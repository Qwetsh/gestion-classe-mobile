import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'gestion-classe.db';

// Promesse d'ouverture unique : evite la course ou plusieurs appelants concurrents
// voyaient `db === null` et ouvraient chacun leur connexion (les doublons finissaient
// fermes par le GC natif d'expo-sqlite, tuant la connexion pour toute l'app).
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Check if we're on a platform that supports SQLite
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // CRITICAL: Enable foreign key constraints for data integrity
  // Without this, CASCADE deletes don't work and orphaned records can occur
  await database.execAsync('PRAGMA foreign_keys = ON');

  if (__DEV__) {
    console.log('[Database] Opened database:', DATABASE_NAME);
    console.log('[Database] Foreign keys enabled');
  }
  return database;
}

/**
 * Get or create the database instance (single shared connection)
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!IS_NATIVE) {
    console.warn('[Database] SQLite not supported on web platform');
    throw new Error('SQLite is not supported on web. Please use mobile app.');
  }

  if (!dbPromise) {
    dbPromise = openDatabase().catch((error) => {
      // Ne pas garder en cache une ouverture echouee
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbPromise) {
    const database = await dbPromise.catch(() => null);
    dbPromise = null;
    if (database) {
      await database.closeAsync();
      console.log('[Database] Closed database');
    }
  }
}

/**
 * Detecte une connexion native morte (fermee par un reload ou le GC).
 * Symptome observe : "Call to function 'NativeDatabase.prepareAsync' has been
 * rejected. → Caused by: java.lang.NullPointerException".
 */
function isDeadConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /NativeDatabase|NativeStatement|closed resource|NullPointerException|database is closed/i.test(
    message
  );
}

/** Reouvre une connexion fraiche apres detection d'une connexion morte. */
async function reopenDatabase(): Promise<SQLite.SQLiteDatabase> {
  console.warn('[Database] Dead connection detected, reopening…');
  dbPromise = null;
  return getDatabase();
}

/**
 * Execute a SQL statement
 */
export async function executeSql(
  sql: string,
  params: (string | number | null)[] = []
): Promise<SQLite.SQLiteRunResult> {
  const database = await getDatabase();
  try {
    return await database.runAsync(sql, params);
  } catch (error) {
    if (!isDeadConnectionError(error)) throw error;
    const fresh = await reopenDatabase();
    return fresh.runAsync(sql, params);
  }
}

/**
 * Execute a SQL query and return all results
 */
export async function queryAll<T>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T[]> {
  const database = await getDatabase();
  try {
    return await database.getAllAsync<T>(sql, params);
  } catch (error) {
    if (!isDeadConnectionError(error)) throw error;
    const fresh = await reopenDatabase();
    return fresh.getAllAsync<T>(sql, params);
  }
}

/**
 * Execute a SQL query and return the first result
 */
export async function queryFirst<T>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T | null> {
  const database = await getDatabase();
  try {
    return await database.getFirstAsync<T>(sql, params);
  } catch (error) {
    if (!isDeadConnectionError(error)) throw error;
    const fresh = await reopenDatabase();
    return fresh.getFirstAsync<T>(sql, params);
  }
}

/**
 * Execute multiple SQL statements in a transaction
 */
export async function executeTransaction(
  statements: { sql: string; params?: (string | number | null)[] }[]
): Promise<void> {
  const run = async (database: SQLite.SQLiteDatabase) => {
    await database.execAsync('BEGIN TRANSACTION');
    try {
      for (const statement of statements) {
        await database.runAsync(statement.sql, statement.params || []);
      }
      await database.execAsync('COMMIT');
    } catch (error) {
      await database.execAsync('ROLLBACK').catch(() => {});
      throw error;
    }
  };

  const database = await getDatabase();
  try {
    await run(database);
  } catch (error) {
    if (!isDeadConnectionError(error)) throw error;
    const fresh = await reopenDatabase();
    await run(fresh);
  }
}
