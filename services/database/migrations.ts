import { Platform } from 'react-native';
import { getDatabase, queryFirst, queryAll, executeSql, executeTransaction } from './client';
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
 * Each migration is atomic - either fully succeeds or fully rolls back
 */
async function runMigrations(fromVersion: number): Promise<void> {
  console.log('[Database] Running migrations from version', fromVersion);

  const db = await getDatabase();

  // Migration 0 -> 1: Initial schema
  // Note: Initial schema uses execAsync which handles its own transaction
  if (fromVersion < 1) {
    console.log('[Database] Applying migration: Initial schema (v1)');

    try {
      // Execute all CREATE TABLE statements
      await db.execAsync(CREATE_TABLES_SQL);

      // Set schema version
      await executeSql(
        'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
        [1]
      );

      console.log('[Database] Migration v1 complete');
    } catch (error) {
      console.error('[Database] Migration v1 failed:', error);
      throw new Error('Initial schema migration failed. Database may be corrupted.');
    }
  }

  // Migration 1 -> 2: Add photo_path to events
  if (fromVersion < 2) {
    console.log('[Database] Applying migration: Add photo_path to events (v2)');

    // Check if column already exists (idempotent check for interrupted migrations)
    const hasPhotoPath = await columnExists('events', 'photo_path');
    if (!hasPhotoPath) {
      // ATOMIC: Both ALTER and version update in same transaction
      await db.execAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync('ALTER TABLE events ADD COLUMN photo_path TEXT');
        await db.runAsync('UPDATE schema_version SET version = ?', [2]);
        await db.execAsync('COMMIT');
        console.log('[Database] Migration v2 complete');
      } catch (error) {
        await db.execAsync('ROLLBACK');
        console.error('[Database] Migration v2 failed, rolled back:', error);
        throw error;
      }
    } else {
      // Column exists, just update version
      console.log('[Database] Column photo_path already exists, updating version only');
      await executeSql('UPDATE schema_version SET version = ?', [2]);
    }
  }

  // Migration 2 -> 3: Add disabled_cells to rooms
  if (fromVersion < 3) {
    console.log('[Database] Applying migration: Add disabled_cells to rooms (v3)');

    const hasDisabledCells = await columnExists('rooms', 'disabled_cells');
    if (!hasDisabledCells) {
      // ATOMIC: Both ALTER and version update in same transaction
      await db.execAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync("ALTER TABLE rooms ADD COLUMN disabled_cells TEXT DEFAULT '[]'");
        await db.runAsync('UPDATE schema_version SET version = ?', [3]);
        await db.execAsync('COMMIT');
        console.log('[Database] Migration v3 complete');
      } catch (error) {
        await db.execAsync('ROLLBACK');
        console.error('[Database] Migration v3 failed, rolled back:', error);
        throw error;
      }
    } else {
      console.log('[Database] Column disabled_cells already exists, updating version only');
      await executeSql('UPDATE schema_version SET version = ?', [3]);
    }
  }

  // Migration 3 -> 4: Add topic to sessions
  if (fromVersion < 4) {
    console.log('[Database] Applying migration: Add topic to sessions (v4)');

    const hasTopic = await columnExists('sessions', 'topic');
    if (!hasTopic) {
      // ATOMIC: Both ALTER and version update in same transaction
      await db.execAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync('ALTER TABLE sessions ADD COLUMN topic TEXT');
        await db.runAsync('UPDATE schema_version SET version = ?', [4]);
        await db.execAsync('COMMIT');
        console.log('[Database] Migration v4 complete');
      } catch (error) {
        await db.execAsync('ROLLBACK');
        console.error('[Database] Migration v4 failed, rolled back:', error);
        throw error;
      }
    } else {
      console.log('[Database] Column topic already exists, updating version only');
      await executeSql('UPDATE schema_version SET version = ?', [4]);
    }
  }

  // Migration 4 -> 5: Add notes to sessions (for session-level notes during class)
  if (fromVersion < 5) {
    console.log('[Database] Applying migration: Add notes to sessions (v5)');

    const hasNotes = await columnExists('sessions', 'notes');
    if (!hasNotes) {
      // ATOMIC: Both ALTER and version update in same transaction
      await db.execAsync('BEGIN TRANSACTION');
      try {
        await db.runAsync('ALTER TABLE sessions ADD COLUMN notes TEXT');
        await db.runAsync('UPDATE schema_version SET version = ?', [5]);
        await db.execAsync('COMMIT');
        console.log('[Database] Migration v5 complete');
      } catch (error) {
        await db.execAsync('ROLLBACK');
        console.error('[Database] Migration v5 failed, rolled back:', error);
        throw error;
      }
    } else {
      console.log('[Database] Column notes already exists, updating version only');
      await executeSql('UPDATE schema_version SET version = ?', [5]);
    }
  }

  // Migration 5 -> 6: Add student_groups table and group_id to students
  if (fromVersion < 6) {
    console.log('[Database] Applying migration: Add student_groups and group_id (v6)');

    // Check if student_groups table exists
    const tables = await queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='student_groups'`
    );
    const hasGroupsTable = tables.length > 0;

    // Check if group_id column exists in students
    const hasGroupId = await columnExists('students', 'group_id');

    // ATOMIC: All changes in same transaction
    await db.execAsync('BEGIN TRANSACTION');
    try {
      if (!hasGroupsTable) {
        await db.runAsync(`
          CREATE TABLE student_groups (
            id TEXT PRIMARY KEY,
            class_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#6366f1',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            synced_at TEXT,
            FOREIGN KEY (class_id) REFERENCES classes(id)
          )
        `);
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_student_groups_class_id ON student_groups(class_id)`);
      }

      if (!hasGroupId) {
        await db.runAsync('ALTER TABLE students ADD COLUMN group_id TEXT REFERENCES student_groups(id)');
        await db.runAsync(`CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id)`);
      }

      await db.runAsync('UPDATE schema_version SET version = ?', [6]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v6 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v6 failed, rolled back:', error);
      throw error;
    }
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
    'student_groups',
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
    'student_groups',
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
