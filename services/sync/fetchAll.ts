/**
 * Lectures complètes pour la synchro.
 *
 * L'API Supabase plafonne une réponse à 1 000 lignes, sans erreur. Or la synchro supprime du
 * téléphone ce qui est absent de la réponse du serveur : une lecture tronquée effacerait donc des
 * données valides. Deux garde-fous :
 *
 *   - `selectAll` lit une requête en entier, page après page ;
 *   - `selectAllIn` fait de même pour une requête filtrée sur une liste d'identifiants, en passant
 *     la liste par paquets : une longue liste dans l'adresse fait échouer la requête.
 *
 * Les pages avancent par identifiant (« les lignes après la dernière reçue ») et non par position :
 * une ligne ajoutée ou supprimée sur le serveur pendant la lecture ne décale rien, donc aucune
 * ligne n'est sautée. La requête doit sélectionner la colonne `id`.
 *
 * En cas d'erreur sur une page, le résultat est `{ data: null, error }`, jamais une liste partielle :
 * l'appelant garde ainsi sa règle « pas de suppression locale si la lecture a échoué ».
 */

export const SYNC_PAGE_SIZE = 1000;
export const SYNC_ID_CHUNK_SIZE = 100;

export interface SyncQueryError {
  message: string;
}

export interface SyncQueryResult<T> {
  data: T[] | null;
  error: SyncQueryError | null;
}

interface PageRequest<T> extends PromiseLike<SyncQueryResult<T>> {}

/** Ce que la lecture par pages demande au constructeur de requêtes de Supabase. */
export interface PageableQuery<T> {
  gt(column: string, value: string): PageableQuery<T>;
  order(column: string, options?: { ascending?: boolean }): { limit(count: number): PageRequest<T> };
}

type WithId = { id: string };

/**
 * Lit toutes les lignes d'une requête. `makeQuery` est rappelée pour chaque page : elle doit rendre
 * une requête neuve, avec ses filtres, sans tri ni limite.
 */
export async function selectAll<T extends WithId>(
  makeQuery: () => PageableQuery<T>,
  pageSize: number = SYNC_PAGE_SIZE,
): Promise<SyncQueryResult<T>> {
  const rows: T[] = [];
  let lastId: string | null = null;
  for (;;) {
    let query = makeQuery();
    if (lastId !== null) query = query.gt('id', lastId);
    const { data, error } = await query.order('id', { ascending: true }).limit(pageSize);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
    lastId = page[page.length - 1].id;
  }
}

/**
 * Lit toutes les lignes d'une requête filtrée sur une liste d'identifiants, paquet par paquet.
 * Une liste vide rend une liste vide, sans appel au serveur.
 */
export async function selectAllIn<T extends WithId, Id>(
  ids: readonly Id[],
  makeQuery: (chunk: Id[]) => PageableQuery<T>,
  chunkSize: number = SYNC_ID_CHUNK_SIZE,
  pageSize: number = SYNC_PAGE_SIZE,
): Promise<SyncQueryResult<T>> {
  const distinct = [...new Set(ids)];
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < distinct.length; start += chunkSize) {
    const chunk = distinct.slice(start, start + chunkSize);
    const { data, error } = await selectAll(() => makeQuery(chunk), pageSize);
    if (error || data === null) return { data: null, error: error ?? { message: 'Lecture incomplète' } };
    for (const row of data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return { data: rows, error: null };
}
