/**
 * Faux serveur Supabase pour les tests de synchro : des tables en mémoire, interrogées par les
 * chaînes que l'app utilise vraiment.
 *
 *   from(table).select(colonnes).eq().in().gt().order().limit()   puis await, .single(), .maybeSingle()
 *   from(table).upsert(lignes, { onConflict, ignoreDuplicates })   puis éventuellement .select()
 *   from(table).insert(lignes)
 *   from(table).update(valeurs).eq()
 *   from(table).delete().eq()
 *
 * Les filtres, le tri et la limite sont VRAIMENT appliqués, et une réponse ne dépasse jamais
 * `maxRows` lignes (1 000, comme l'API Supabase) même sans `.limit()` : une lecture non paginée
 * est donc tronquée ici comme en production, sans erreur.
 *
 * Reproduit aussi, parce que la synchro s'appuie dessus :
 *  - clé primaire `id`, contraintes UNIQUE et clés étrangères déclarées par le test (codes
 *    Postgres 23505 et 23503), suppressions en cascade ;
 *  - un envoi de plusieurs lignes est « tout ou rien » ;
 *  - les erreurs reviennent dans `{ data: null, error }`, jamais en exception (comme supabase-js).
 *
 * Non reproduit : sécurité par ligne (RLS), authentification, types de colonnes, valeurs par
 * défaut et déclencheurs du serveur, RPC, Storage, temps réel, filtres autres que eq / in / gt.
 * Une méthode non reproduite est absente : l'appeler lève « is not a function ».
 *
 * Aucun appel réseau : tout est en mémoire.
 */

export type ServerRow = Record<string, unknown>;

export interface ServerError {
  message: string;
  code: string;
  details?: string;
}

export interface ServerResult<T> {
  data: T | null;
  error: ServerError | null;
}

export type Operation = 'select' | 'insert' | 'upsert' | 'update' | 'delete';

interface Filter {
  kind: 'eq' | 'in' | 'gt';
  column: string;
  value: unknown;
}

/** Une requête reçue par le faux serveur, telle que les tests peuvent l'examiner. */
export interface ServerRequest {
  table: string;
  operation: Operation;
  filters: Filter[];
  limit: number | null;
  /** Nombre de lignes envoyées (insert / upsert) */
  sent: number;
  /** Nombre de lignes rendues (select) */
  returned: number;
  failed: boolean;
}

interface ForeignKey {
  column: string;
  references: string;
  onDelete: 'cascade' | 'set null';
}

interface FailureRule {
  match: (request: ServerRequest) => boolean;
  error: ServerError;
  /** Nombre de requêtes correspondantes à laisser passer avant d'échouer */
  skip: number;
  /** Nombre d'échecs restants */
  times: number;
}

export interface FailureOptions {
  table: string;
  operation?: Operation;
  message?: string;
  code?: string;
  /** Laisser passer les n premières requêtes correspondantes (ex. 1 = échouer à la 2e page) */
  after?: number;
  /** Nombre d'échecs (par défaut : tous les suivants) */
  times?: number;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

export class FakeSupabaseServer {
  private tables = new Map<string, ServerRow[]>();
  private uniques = new Map<string, string[][]>();
  private foreignKeys = new Map<string, ForeignKey[]>();
  private failures: FailureRule[] = [];

  /** Journal de toutes les requêtes reçues, dans l'ordre. */
  requests: ServerRequest[] = [];
  /** Plafond de lignes par réponse (max-rows de l'API). */
  maxRows = 1000;
  /**
   * Taille maximale d'une liste `.in()`. Au-delà, le serveur refuse la requête, comme une adresse
   * trop longue. `null` : pas de limite (par défaut).
   */
  maxInValues: number | null = null;
  /**
   * Appelée à l'arrivée de chaque requête, avant la réponse : permet à un test de faire quelque
   * chose « pendant » un envoi (l'enseignant continue d'utiliser l'app pendant la synchro).
   */
  onRequest: ((request: { table: string; operation: Operation }) => void | Promise<void>) | null = null;

  readonly client = {
    from: (table: string): FakeQuery => new FakeQuery(this, table),
  };

  // -- Mise en place ---------------------------------------------------------------------------

  /** Vide tout : tables, contraintes, pannes, journal. */
  reset(): void {
    this.tables.clear();
    this.uniques.clear();
    this.foreignKeys.clear();
    this.failures = [];
    this.requests = [];
    this.maxRows = 1000;
    this.maxInValues = null;
    this.onRequest = null;
  }

  /** Ajoute des lignes telles quelles (sans contrôle de contrainte : c'est l'état de départ). */
  seed(table: string, rows: ServerRow[]): void {
    this.rowsOf(table).push(...rows.map(clone));
  }

  unique(table: string, columns: string[]): void {
    this.uniques.set(table, [...(this.uniques.get(table) ?? []), columns]);
  }

  foreignKey(table: string, column: string, references: string, onDelete: 'cascade' | 'set null' = 'cascade'): void {
    this.foreignKeys.set(table, [...(this.foreignKeys.get(table) ?? []), { column, references, onDelete }]);
  }

  /** Fait échouer les requêtes correspondantes (panne réseau, erreur serveur). */
  failOn(options: FailureOptions): void {
    this.failures.push({
      match: (r) => r.table === options.table && (options.operation === undefined || r.operation === options.operation),
      error: { message: options.message ?? 'coupure réseau', code: options.code ?? '' },
      skip: options.after ?? 0,
      times: options.times ?? Number.POSITIVE_INFINITY,
    });
  }

  clearFailures(): void {
    this.failures = [];
  }

  clearRequests(): void {
    this.requests = [];
  }

  // -- Lecture par les tests -------------------------------------------------------------------

  rows(table: string): ServerRow[] {
    return clone(this.rowsOf(table));
  }

  ids(table: string): string[] {
    return this.rowsOf(table).map((r) => String(r.id)).sort();
  }

  find(table: string, id: string): ServerRow | undefined {
    return clone(this.rowsOf(table).find((r) => r.id === id));
  }

  /** Supprime une ligne comme le ferait le site web (avec les cascades déclarées). */
  remove(table: string, id: string): void {
    this.deleteWhere(table, (r) => r.id === id);
  }

  /** Modifie une ligne comme le ferait le site web. */
  patch(table: string, id: string, values: ServerRow): void {
    const row = this.rowsOf(table).find((r) => r.id === id);
    if (!row) throw new Error(`fakeSupabase : ligne ${table}/${id} introuvable`);
    Object.assign(row, clone(values));
  }

  requestsFor(table: string, operation?: Operation): ServerRequest[] {
    return this.requests.filter((r) => r.table === table && (operation === undefined || r.operation === operation));
  }

  // -- Moteur (utilisé par FakeQuery) ----------------------------------------------------------

  /** @internal */
  rowsOf(table: string): ServerRow[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  /** @internal Rend l'erreur programmée pour cette requête, s'il y en a une. */
  takeFailure(request: ServerRequest): ServerError | null {
    for (const rule of this.failures) {
      if (!rule.match(request)) continue;
      if (rule.skip > 0) {
        rule.skip--;
        continue;
      }
      if (rule.times <= 0) continue;
      rule.times--;
      return rule.error;
    }
    return null;
  }

  /** @internal Contrôle clé primaire, UNIQUE et clés étrangères d'un état candidat de la table. */
  checkConstraints(table: string, candidate: ServerRow[], touched: ServerRow[]): ServerError | null {
    const keys: { name: string; columns: string[] }[] = [
      { name: `${table}_pkey`, columns: ['id'] },
      ...(this.uniques.get(table) ?? []).map((columns) => ({ name: `${table}_${columns.join('_')}_key`, columns })),
    ];
    for (const key of keys) {
      const seen = new Set<string>();
      for (const row of candidate) {
        // Comme en SQL : une valeur NULL n'entre jamais en conflit
        if (key.columns.some((c) => row[c] === null || row[c] === undefined)) continue;
        const value = JSON.stringify(key.columns.map((c) => row[c]));
        if (seen.has(value)) {
          return {
            code: '23505',
            message: `duplicate key value violates unique constraint "${key.name}"`,
            details: `Key (${key.columns.join(', ')})=(${key.columns.map((c) => row[c]).join(', ')}) already exists.`,
          };
        }
        seen.add(value);
      }
    }
    for (const fk of this.foreignKeys.get(table) ?? []) {
      const parents = new Set(this.rowsOf(fk.references).map((r) => r.id));
      for (const row of touched) {
        const value = row[fk.column];
        if (value === null || value === undefined) continue;
        if (!parents.has(value)) {
          return {
            code: '23503',
            message: `insert or update on table "${table}" violates foreign key constraint "${table}_${fk.column}_fkey"`,
            details: `Key (${fk.column})=(${String(value)}) is not present in table "${fk.references}".`,
          };
        }
      }
    }
    return null;
  }

  /** @internal */
  replaceRows(table: string, rows: ServerRow[]): void {
    this.tables.set(table, rows);
  }

  /** @internal Supprime des lignes et applique les cascades déclarées. */
  deleteWhere(table: string, predicate: (row: ServerRow) => boolean): number {
    const rows = this.rowsOf(table);
    const removed = rows.filter(predicate);
    if (removed.length === 0) return 0;
    this.tables.set(table, rows.filter((r) => !predicate(r)));
    const removedIds = new Set(removed.map((r) => r.id));
    for (const [childTable, fks] of this.foreignKeys) {
      for (const fk of fks) {
        if (fk.references !== table) continue;
        if (fk.onDelete === 'cascade') {
          this.deleteWhere(childTable, (child) => removedIds.has(child[fk.column]));
        } else {
          for (const child of this.rowsOf(childTable)) {
            if (removedIds.has(child[fk.column])) child[fk.column] = null;
          }
        }
      }
    }
    return removed.length;
  }
}

interface UpsertOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

type Shape = 'many' | 'single' | 'maybeSingle';

/** Une requête en cours de construction. Elle ne part qu'au `await` (ou `.then`). */
export class FakeQuery implements PromiseLike<ServerResult<any>> {
  private operation: Operation = 'select';
  private columns: string | null = null;
  private returning = false;
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private payload: ServerRow[] = [];
  private values: ServerRow = {};
  private options: UpsertOptions = {};
  private shape: Shape = 'many';

  constructor(
    private readonly server: FakeSupabaseServer,
    private readonly table: string,
  ) {}

  select(columns = '*'): this {
    this.columns = columns;
    if (this.operation !== 'select') this.returning = true;
    return this;
  }

  insert(rows: ServerRow | ServerRow[]): this {
    this.operation = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: ServerRow | ServerRow[], options: UpsertOptions = {}): this {
    this.operation = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.options = options;
    return this;
  }

  update(values: ServerRow): this {
    this.operation = 'update';
    this.values = values;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: 'eq', column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.filters.push({ kind: 'in', column, value: [...values] });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ kind: 'gt', column, value });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderBy = { column, ascending: options.ascending !== false };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): this {
    this.shape = 'single';
    return this;
  }

  maybeSingle(): this {
    this.shape = 'maybeSingle';
    return this;
  }

  then<TResult1 = ServerResult<any>, TResult2 = never>(
    onfulfilled?: ((value: ServerResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve()
      .then(() => this.server.onRequest?.({ table: this.table, operation: this.operation }))
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }

  // -- Exécution -------------------------------------------------------------------------------

  private matches(row: ServerRow): boolean {
    return this.filters.every((f) => {
      const value = row[f.column];
      if (f.kind === 'eq') return value === f.value;
      if (f.kind === 'in') return (f.value as unknown[]).includes(value);
      return value !== null && value !== undefined && compare(value, f.value) > 0;
    });
  }

  private project(row: ServerRow): ServerRow {
    if (this.columns === null || this.columns.trim() === '*') return clone(row);
    const out: ServerRow = {};
    for (const column of this.columns.split(',').map((c) => c.trim()).filter(Boolean)) {
      // Une colonne demandée mais absente de la ligne revient à null, comme une colonne vide
      out[column] = clone(row[column] ?? null);
    }
    return out;
  }

  private execute(): ServerResult<any> {
    const request: ServerRequest = {
      table: this.table,
      operation: this.operation,
      filters: clone(this.filters),
      limit: this.limitCount,
      sent: this.payload.length,
      returned: 0,
      failed: false,
    };
    this.server.requests.push(request);

    const fail = (error: ServerError): ServerResult<any> => {
      request.failed = true;
      return { data: null, error };
    };

    const planned = this.server.takeFailure(request);
    if (planned) return fail(planned);

    const max = this.server.maxInValues;
    if (max !== null && this.filters.some((f) => f.kind === 'in' && (f.value as unknown[]).length > max)) {
      return fail({ code: '414', message: 'URI too long' });
    }

    let affected: ServerRow[];
    switch (this.operation) {
      case 'select': {
        affected = this.server.rowsOf(this.table).filter((r) => this.matches(r));
        if (this.orderBy) {
          const { column, ascending } = this.orderBy;
          affected = [...affected].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
        }
        affected = affected.slice(0, Math.min(this.limitCount ?? Number.POSITIVE_INFINITY, this.server.maxRows));
        break;
      }
      case 'insert':
      case 'upsert': {
        const result = this.write();
        if ('error' in result) return fail(result.error);
        affected = result.rows;
        break;
      }
      case 'update': {
        const candidate = this.server.rowsOf(this.table).map((r) => (this.matches(r) ? { ...r, ...clone(this.values) } : r));
        affected = candidate.filter((_, i) => this.matches(this.server.rowsOf(this.table)[i]));
        const error = this.server.checkConstraints(this.table, candidate, affected);
        if (error) return fail(error);
        this.server.replaceRows(this.table, candidate);
        break;
      }
      case 'delete': {
        affected = this.server.rowsOf(this.table).filter((r) => this.matches(r));
        this.server.deleteWhere(this.table, (r) => this.matches(r));
        break;
      }
    }

    // Une écriture sans .select() ne rend aucune ligne
    if (this.operation !== 'select' && !this.returning) return { data: null, error: null };

    const rows = affected.map((r) => this.project(r));
    request.returned = rows.length;
    if (this.shape === 'many') return { data: rows, error: null };
    if (rows.length === 1) return { data: rows[0], error: null };
    if (rows.length === 0 && this.shape === 'maybeSingle') return { data: null, error: null };
    return fail({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
  }

  /** insert / upsert : tout ou rien, comme une seule instruction SQL. */
  private write(): { rows: ServerRow[] } | { error: ServerError } {
    const candidate = this.server.rowsOf(this.table).map((r) => ({ ...r }));
    const touched: ServerRow[] = [];
    const conflictColumns = (this.options.onConflict ?? 'id').split(',').map((c) => c.trim());

    for (const sent of this.payload) {
      const row = clone(sent);
      const existing = this.operation === 'upsert'
        ? candidate.find((r) => conflictColumns.every((c) => r[c] !== null && r[c] !== undefined && r[c] === row[c]))
        : undefined;
      if (existing) {
        // ON CONFLICT DO NOTHING : la ligne en place n'est ni modifiée ni rendue
        if (this.options.ignoreDuplicates) continue;
        // ON CONFLICT DO UPDATE : toutes les colonnes envoyées sont réécrites, `id` compris
        Object.assign(existing, row);
        touched.push(existing);
      } else {
        candidate.push(row);
        touched.push(row);
      }
    }

    const error = this.server.checkConstraints(this.table, candidate, touched);
    if (error) return { error };
    this.server.replaceRows(this.table, candidate);
    return { rows: touched };
  }
}

/** Le serveur partagé par le module `services/supabase` simulé et par les tests. */
export const fakeServer = new FakeSupabaseServer();

/**
 * Remplaçant du module `services/supabase` :
 *
 *   jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
 */
export function mockSupabaseModule(): { supabase: unknown; isSupabaseConfigured: boolean } {
  return { supabase: fakeServer.client, isSupabaseConfigured: true };
}
