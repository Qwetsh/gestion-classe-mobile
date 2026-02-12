import { Platform } from 'react-native';
import { getDatabase, queryFirst, queryAll, executeSql } from './client';
import { SCHEMA_VERSION, CREATE_TABLES_SQL } from './schema';

interface SchemaVersion {
  version: number;
}

interface ColumnInfo {
  name: string;
}

/**
 * Check if a column exists in a table
 */
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const columns = await queryAll<ColumnInfo>(
      `PRAGMA table_info(${tableName})`
    );
    return columns.some(col => col.name === columnName);
  } catch {
    return false;
  }
}

// Check if we're on a platform that supports SQLite
const IS_NATIVE = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Initialize the database with the latest schema
 */
export async function initializeDatabase(): Promise<void> {
  console.log('[Database] Initializing database...');

  // Skip SQLite initialization on web - we'll use Supabase directly
  if (!IS_NATIVE) {
    console.log('[Database] Web platform detected - skipping SQLite init');
    return;
  }

  const db = await getDatabase();

  // Check current schema version
  let currentVersion = 0;

  try {
    const result = await queryFirst<SchemaVersion>(
      'SELECT version FROM schema_version LIMIT 1'
    );
    currentVersion = result?.version || 0;
  } catch {
    // Table doesn't exist yet, that's fine
    currentVersion = 0;
  }

  console.log('[Database] Current schema version:', currentVersion);
  console.log('[Database] Target schema version:', SCHEMA_VERSION);

  if (currentVersion < SCHEMA_VERSION) {
    // Run migrations
    await runMigrations(currentVersion);
  }

  console.log('[Database] Database initialized successfully');
}

/**
 * Run all necessary migrations
 */
async function runMigrations(fromVersion: number): Promise<void> {
  console.log('[Database] Running migrations from version', fromVersion);

  const db = await getDatabase();

  // Migration 0 -> 1: Initial schema
  if (fromVersion < 1) {
    console.log('[Database] Applying migration: Initial schema (v1)');

    // Execute all CREATE TABLE statements
    await db.execAsync(CREATE_TABLES_SQL);

    // Set schema version
    await executeSql(
      'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      [1]
    );

    console.log('[Database] Migration v1 complete');
  }

  // Migration 1 -> 2: Add photo_path to events
  if (fromVersion < 2) {
    console.log('[Database] Applying migration: Add photo_path to events (v2)');

    // Check if column already exists (in case of interrupted migration)
    const hasPhotoPath = await columnExists('events', 'photo_path');
    if (!hasPhotoPath) {
      await executeSql(
        'ALTER TABLE events ADD COLUMN photo_path TEXT'
      );
    } else {
      console.log('[Database] Column photo_path already exists, skipping');
    }

    // Update schema version
    await executeSql(
      'UPDATE schema_version SET version = ?',
      [2]
    );

    console.log('[Database] Migration v2 complete');
  }

  // Migration 2 -> 3: Add disabled_cells to rooms
  if (fromVersion < 3) {
    console.log('[Database] Applying migration: Add disabled_cells to rooms (v3)');

    // Check if column already exists (in case of interrupted migration)
    const hasDisabledCells = await columnExists('rooms', 'disabled_cells');
    if (!hasDisabledCells) {
      await executeSql(
        "ALTER TABLE rooms ADD COLUMN disabled_cells TEXT DEFAULT '[]'"
      );
    } else {
      console.log('[Database] Column disabled_cells already exists, skipping');
    }

    // Update schema version
    await executeSql(
      'UPDATE schema_version SET version = ?',
      [3]
    );

    console.log('[Database] Migration v3 complete');
  }

  // Migration 3 -> 4: Add topic to sessions
  if (fromVersion < 4) {
    console.log('[Database] Applying migration: Add topic to sessions (v4)');

    // Check if column already exists (in case of interrupted migration)
    const hasTopic = await columnExists('sessions', 'topic');
    if (!hasTopic) {
      await executeSql(
        'ALTER TABLE sessions ADD COLUMN topic TEXT'
      );
    } else {
      console.log('[Database] Column topic already exists, skipping');
    }

    // Update schema version
    await executeSql(
      'UPDATE schema_version SET version = ?',
      [4]
    );

    console.log('[Database] Migration v4 complete');
  }
}

/**
 * Reset the database (for development/testing)
 * WARNING: This will delete all data!
 */
export async function resetDatabase(): Promise<void> {
  console.warn('[Database] RESETTING DATABASE - All data will be lost!');

  const db = await getDatabase();

  // Drop all tables
  const tables = [
    'local_student_mapping',
    'events',
    'sessions',
    'class_room_plans',
    'rooms',
    'students',
    'classes',
    'schema_version',
  ];

  for (const table of tables) {
    await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
  }

  console.log('[Database] All tables dropped');

  // Re-initialize
  await initializeDatabase();
}

/**
 * Get database statistics (for debugging)
 */
export async function getDatabaseStats(): Promise<Record<string, number>> {
  const tables = [
    'classes',
    'students',
    'rooms',
    'class_room_plans',
    'sessions',
    'events',
    'local_student_mapping',
  ];

  const stats: Record<string, number> = {};

  for (const table of tables) {
    try {
      const result = await queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table}`
      );
      stats[table] = result?.count || 0;
    } catch {
      stats[table] = -1; // Table doesn't exist
    }
  }

  return stats;
}
