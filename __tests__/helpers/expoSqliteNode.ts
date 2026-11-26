/**
 * Remplaçant d'`expo-sqlite` pour Jest, adossé au vrai moteur SQLite de Node (`node:sqlite`).
 *
 * Pourquoi : la synchro repose sur le comportement réel de SQLite (clés étrangères, cascades,
 * `INSERT OR REPLACE`, contraintes UNIQUE, `PRAGMA defer_foreign_keys`). Un faux en mémoire fait
 * main ne reproduit rien de tout cela, donc ne peut pas attraper les pertes de données.
 *
 * Utilisation, en tête d'un fichier de test :
 *
 *   jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
 *
 * Ce qui est reproduit : uniquement l'API que l'app utilise (voir services/database/client.ts) :
 * `openDatabaseAsync`, puis `execAsync`, `runAsync`, `getAllAsync`, `getFirstAsync`, `closeAsync`.
 * Toute autre méthode d'expo-sqlite (withTransactionAsync, prepareAsync, API synchrone…) est
 * absente exprès : si l'app se met à l'utiliser, le test casse avec « is not a function » au lieu
 * de passer sur une imitation jamais vérifiée.
 *
 * Fidélité au téléphone :
 *  - même réglage de départ qu'une connexion expo-sqlite : clés étrangères DÉSACTIVÉES tant que
 *    l'app n'a pas lancé `PRAGMA foreign_keys = ON` (node:sqlite les active d'office, on le coupe),
 *    et chaînes entre guillemets doubles tolérées (expo-sqlite compile SQLite sans SQLITE_DQS=0) ;
 *  - mêmes conversions de paramètres que le module natif Android (SQLiteModule.kt) : un nombre
 *    entier est lié comme INTEGER, un booléen comme 0/1, `undefined` comme NULL.
 *
 * Ce qui diffère du téléphone (à garder en tête en lisant un test) :
 *  - SQLite 3.50.4 (Node 24) au lieu de 3.50.3 (expo-sqlite 16) ;
 *  - base en mémoire : rien n'est écrit sur disque, pas de journal WAL, pas de verrou de fichier ;
 *  - exécution synchrone derrière des promesses : pas de fil natif, donc pas de vraie concurrence
 *    entre deux requêtes ni de connexion « morte » (NullPointerException natif) à réouvrir ;
 *  - les messages d'erreur sont ceux de SQLite seul (« FOREIGN KEY constraint failed »), sans
 *    l'enrobage d'expo (« Call to function 'NativeStatement.runAsync' has been rejected… ») ;
 *    le code SQLite étendu est dans `error.code` (787 pour une clé étrangère, par exemple) ;
 *  - `lastInsertRowId` est un nombre JS ordinaire (le natif Android le tronque à 32 bits).
 *
 * Demande Node 22.16 ou plus (écrit et essayé avec Node 24.13). `node:sqlite` y est encore annoncé
 * « expérimental » : Node l'écrit une fois par processus de test, sans conséquence. Aucune
 * dépendance à installer.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

type Row = Record<string, unknown>;

/** Bases ouvertes, par nom de fichier : fermer puis rouvrir retrouve les données, comme sur disque. */
const databases = new Map<string, DatabaseSync>();

function openEngine(): DatabaseSync {
  return new DatabaseSync(':memory:', {
    enableForeignKeyConstraints: false,
    enableDoubleQuotedStringLiterals: true,
  });
}

/** Même règle qu'expo-sqlite (paramUtils.ts) : un tableau, ou des arguments à la suite. */
function toParamList(params: unknown[]): unknown[] {
  const bind = params.length > 1 ? params : params[0];
  if (bind === null || bind === undefined) return [];
  if (Array.isArray(bind)) return bind;
  if (typeof bind === 'object' && !(bind instanceof Uint8Array)) {
    throw new Error('expoSqliteNode : paramètres nommés non reproduits (l’app ne les utilise pas)');
  }
  return [bind];
}

/** Même conversion que le module natif Android avant sqlite3_bind_*. */
function toBindValue(value: unknown): SQLInputValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (typeof value === 'number') return Number.isInteger(value) ? BigInt(value) : value;
  if (typeof value === 'string' || typeof value === 'bigint' || value instanceof Uint8Array) return value;
  throw new Error(`expoSqliteNode : valeur impossible à lier (${typeof value})`);
}

function bindAll(params: unknown[]): SQLInputValue[] {
  return toParamList(params).map(toBindValue);
}

/**
 * Une erreur levée par un module intégré de Node vient d'un autre « monde » que celui du test :
 * `error instanceof Error` y est faux, et l'app prendrait toute erreur SQLite pour une erreur
 * inconnue. On la relève donc ici, avec le même message.
 */
function guarded<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    const source = cause as { message?: string; errcode?: number };
    const error = new Error(source?.message ?? String(cause)) as Error & { code?: number };
    if (typeof source?.errcode === 'number') error.code = source.errcode;
    throw error;
  }
}

/** node:sqlite rend des objets sans prototype : on rend des objets ordinaires, comme expo. */
function plain<T>(row: unknown): T {
  return { ...(row as Row) } as T;
}

export class SQLiteDatabase {
  private closed = false;

  constructor(
    public readonly databasePath: string,
    private readonly engine: DatabaseSync,
  ) {}

  private use(): DatabaseSync {
    if (this.closed) throw new Error('database is closed');
    return this.engine;
  }

  async execAsync(source: string): Promise<void> {
    guarded(() => this.use().exec(source));
  }

  async runAsync(source: string, ...params: unknown[]): Promise<SQLiteRunResult> {
    const result = guarded(() => this.use().prepare(source).run(...bindAll(params)));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return guarded(() => this.use().prepare(source).all(...bindAll(params))).map((row) => plain<T>(row));
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    const row = guarded(() => this.use().prepare(source).get(...bindAll(params)));
    return row === undefined ? null : plain<T>(row);
  }

  async closeAsync(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    // Une connexion fermée n'emporte ni transaction ouverte ni réglage : la suivante repart de zéro.
    if (this.engine.isTransaction) this.engine.exec('ROLLBACK');
    this.engine.exec('PRAGMA foreign_keys = OFF');
  }
}

export async function openDatabaseAsync(databaseName: string): Promise<SQLiteDatabase> {
  let engine = databases.get(databaseName);
  if (!engine) {
    engine = openEngine();
    databases.set(databaseName, engine);
  }
  return new SQLiteDatabase(databaseName, engine);
}

// ---------------------------------------------------------------------------------------------
// Réservé aux tests (n'existe pas dans expo-sqlite)
// ---------------------------------------------------------------------------------------------

/** Détruit toutes les bases : à appeler après chaque test pour repartir d'une base neuve. */
export function __deleteAllDatabases(): void {
  for (const engine of databases.values()) engine.close();
  databases.clear();
}

/** Version du moteur, pour le rapport de test. */
export function __sqliteVersion(): string {
  const engine = openEngine();
  try {
    return String((engine.prepare('SELECT sqlite_version() AS v').get() as Row).v);
  } finally {
    engine.close();
  }
}
