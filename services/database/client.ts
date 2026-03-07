import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const DATABASE_NAME = 'gestion-classe.db';

// Database instance (singleton)
let db: SQLite.SQLiteDatabase | null = null;

// Check if we're on a platform that supports SQLite
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Get or create the database instance
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!IS_NATIVE) {
    console.warn('[Database] SQLite not supported on web platform');
    throw new Error('SQLite is not supported on web. Please use mobile app.');
  }

  if (!db) {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);

    // CRITICAL: Enable foreign key constraints for data integrity
    // Without this, CASCADE deletes don't work and orphaned records can occur
    await db.execAsync('PRAGMA foreign_keys = ON');

    if (__DEV__) {
      console.log('[Database] Opened database:', DATABASE_NAME);
      console.log('[Database] Foreign keys enabled');
    }
  }
  return db;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    console.log('[Database] Closed database');
  }
}

/**
 * Execute a SQL statement
 */
export async function executeSql(
  sql: string,
  params: (string | number | null)[] = []
): Promise<SQLite.SQLiteRunResult> {
  const database = await getDatabase();
  return database.runAsync(sql, params);
}

/**
 * Execute a SQL query and return all results
 */
export async function queryAll<T>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T[]> {
  const database = await getDatabase();
  return database.getAllAsync<T>(sql, params);
}

/**
 * Execute a SQL query and return the first result
 */
export async function queryFirst<T>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<T | null> {
  const database = await getDatabase();
  return database.getFirstAsync<T>(sql, params);
}

/**
 * Execute multiple SQL statements in a transaction
 */
export async function executeTransaction(
  statements: { sql: string; params?: (string | number | null)[] }[]
): Promise<void> {
  const database = await getDatabase();

  await database.execAsync('BEGIN TRANSACTION');

  try {
    for (const statement of statements) {
      await database.runAsync(statement.sql, statement.params || []);
    }
    await database.execAsync('COMMIT');
  } catch (error) {
    await database.execAsync('ROLLBACK');
    throw error;
  }
}
