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

  // Migration 6 -> 7: Remove student_groups feature (replaced by group_sessions)
  if (fromVersion < 7) {
    console.log('[Database] Applying migration: Remove student_groups (v7)');

    // ATOMIC: All changes in same transaction
    await db.execAsync('BEGIN TRANSACTION');
    try {
      // SQLite doesn't support DROP COLUMN, so we need to recreate the table
      // First check if group_id column exists
      const hasGroupId = await columnExists('students', 'group_id');

      if (hasGroupId) {
        // Recreate students table without group_id
        await db.runAsync(`
          CREATE TABLE students_new (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            pseudo TEXT NOT NULL,
            class_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT,
            synced_at TEXT,
            is_deleted INTEGER DEFAULT 0,
            FOREIGN KEY (class_id) REFERENCES classes(id)
          )
        `);
        await db.runAsync(`
          INSERT INTO students_new (id, user_id, pseudo, class_id, created_at, updated_at, synced_at, is_deleted)
          SELECT id, user_id, pseudo, class_id, created_at, updated_at, synced_at, is_deleted FROM students
        `);
        await db.runAsync('DROP TABLE students');
        await db.runAsync('ALTER TABLE students_new RENAME TO students');
        await db.runAsync('CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)');
        await db.runAsync('CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id)');
      }

      // Drop student_groups table and its index
      await db.runAsync('DROP TABLE IF EXISTS student_groups');
      await db.runAsync('DROP INDEX IF EXISTS idx_student_groups_class_id');
      await db.runAsync('DROP INDEX IF EXISTS idx_students_group_id');

      await db.runAsync('UPDATE schema_version SET version = ?', [7]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v7 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v7 failed, rolled back:', error);
      throw error;
    }
  }

  // Migration 7 -> 8: Add group_sessions feature (séances de groupe notées)
  if (fromVersion < 8) {
    console.log('[Database] Applying migration: Add group_sessions tables (v8)');

    // ATOMIC: All changes in same transaction
    await db.execAsync('BEGIN TRANSACTION');
    try {
      // Create group_sessions table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS group_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          class_id TEXT NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT,
          synced_at TEXT,
          FOREIGN KEY (class_id) REFERENCES classes(id)
        )
      `);

      // Create grading_criteria table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS grading_criteria (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          label TEXT NOT NULL,
          max_points REAL NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT,
          FOREIGN KEY (session_id) REFERENCES group_sessions(id) ON DELETE CASCADE
        )
      `);

      // Create session_groups table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS session_groups (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          name TEXT NOT NULL,
          conduct_malus REAL NOT NULL DEFAULT 0,
          synced_at TEXT,
          FOREIGN KEY (session_id) REFERENCES group_sessions(id) ON DELETE CASCADE
        )
      `);

      // Create session_group_members table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS session_group_members (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          synced_at TEXT,
          FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (student_id) REFERENCES students(id),
          UNIQUE(group_id, student_id)
        )
      `);

      // Create group_grades table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS group_grades (
          id TEXT PRIMARY KEY,
          group_id TEXT NOT NULL,
          criteria_id TEXT NOT NULL,
          points_awarded REAL NOT NULL DEFAULT 0,
          synced_at TEXT,
          FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
          FOREIGN KEY (criteria_id) REFERENCES grading_criteria(id) ON DELETE CASCADE,
          UNIQUE(group_id, criteria_id)
        )
      `);

      // Create indexes
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_group_sessions_user_id ON group_sessions(user_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_group_sessions_class_id ON group_sessions(class_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_grading_criteria_session_id ON grading_criteria(session_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON session_groups(session_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_session_group_members_group_id ON session_group_members(group_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_session_group_members_student_id ON session_group_members(student_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_group_grades_group_id ON group_grades(group_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_group_grades_criteria_id ON group_grades(criteria_id)');

      await db.runAsync('UPDATE schema_version SET version = ?', [8]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v8 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v8 failed, rolled back:', error);
      throw error;
    }
  }

  // Migration 8 -> 9: Add TP templates feature
  if (fromVersion < 9) {
    console.log('[Database] Applying migration: Add TP templates tables (v9)');

    // ATOMIC: All changes in same transaction
    await db.execAsync('BEGIN TRANSACTION');
    try {
      // Create tp_templates table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS tp_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT
        )
      `);

      // Create tp_template_criteria table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS tp_template_criteria (
          id TEXT PRIMARY KEY,
          template_id TEXT NOT NULL,
          label TEXT NOT NULL,
          max_points REAL NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT,
          FOREIGN KEY (template_id) REFERENCES tp_templates(id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_tp_templates_user_id ON tp_templates(user_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_tp_template_criteria_template_id ON tp_template_criteria(template_id)');

      await db.runAsync('UPDATE schema_version SET version = ?', [9]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v9 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v9 failed, rolled back:', error);
      throw error;
    }
  }

  // Migration 9 -> 10: Add linked_session_id to group_sessions
  if (fromVersion < 10) {
    console.log('[Database] Applying migration: Add linked_session_id to group_sessions (v10)');

    await db.execAsync('BEGIN TRANSACTION');
    try {
      const hasColumn = await columnExists('group_sessions', 'linked_session_id');
      if (!hasColumn) {
        await db.runAsync(`ALTER TABLE group_sessions ADD COLUMN linked_session_id TEXT REFERENCES sessions(id)`);
      }

      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_group_sessions_linked_session_id ON group_sessions(linked_session_id)');

      await db.runAsync('UPDATE schema_version SET version = ?', [10]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v10 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v10 failed, rolled back:', error);
      throw error;
    }
  }
  // Migration 10 -> 11: Add stamp cards system (récompenses)
  if (fromVersion < 11) {
    console.log('[Database] Applying migration: Add stamp cards tables (v11)');

    await db.execAsync('BEGIN TRANSACTION');
    try {
      // Create stamp_categories table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS stamp_categories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          label TEXT NOT NULL,
          icon TEXT NOT NULL,
          color TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT
        )
      `);

      // Create bonuses table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS bonuses (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          label TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT
        )
      `);

      // Create stamp_cards table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS stamp_cards (
          id TEXT PRIMARY KEY,
          student_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          card_number INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'active',
          completed_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          FOREIGN KEY (student_id) REFERENCES students(id),
          UNIQUE(student_id, card_number)
        )
      `);

      // Create stamps table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS stamps (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL,
          student_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          category_id TEXT,
          slot_number INTEGER NOT NULL,
          awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
          synced_at TEXT,
          FOREIGN KEY (card_id) REFERENCES stamp_cards(id) ON DELETE CASCADE,
          FOREIGN KEY (student_id) REFERENCES students(id),
          FOREIGN KEY (category_id) REFERENCES stamp_categories(id),
          UNIQUE(card_id, slot_number)
        )
      `);

      // Create bonus_selections table
      await db.runAsync(`
        CREATE TABLE IF NOT EXISTS bonus_selections (
          id TEXT PRIMARY KEY,
          card_id TEXT NOT NULL UNIQUE,
          bonus_id TEXT,
          student_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          selected_at TEXT NOT NULL DEFAULT (datetime('now')),
          used_at TEXT,
          synced_at TEXT,
          FOREIGN KEY (card_id) REFERENCES stamp_cards(id) ON DELETE CASCADE,
          FOREIGN KEY (bonus_id) REFERENCES bonuses(id),
          FOREIGN KEY (student_id) REFERENCES students(id)
        )
      `);

      // Create indexes
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamp_categories_user_id ON stamp_categories(user_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_bonuses_user_id ON bonuses(user_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamp_cards_student_id ON stamp_cards(student_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamp_cards_user_id ON stamp_cards(user_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamps_card_id ON stamps(card_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamps_student_id ON stamps(student_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_stamps_category_id ON stamps(category_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_bonus_selections_card_id ON bonus_selections(card_id)');
      await db.runAsync('CREATE INDEX IF NOT EXISTS idx_bonus_selections_student_id ON bonus_selections(student_id)');

      await db.runAsync('UPDATE schema_version SET version = ?', [11]);
      await db.execAsync('COMMIT');
      console.log('[Database] Migration v11 complete');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      console.error('[Database] Migration v11 failed, rolled back:', error);
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

  // Drop all tables (in dependency order)
  const tables = [
    'bonus_selections',
    'stamps',
    'stamp_cards',
    'bonuses',
    'stamp_categories',
    'tp_template_criteria',
    'tp_templates',
    'group_grades',
    'session_group_members',
    'session_groups',
    'grading_criteria',
    'group_sessions',
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
    'group_sessions',
    'grading_criteria',
    'session_groups',
    'session_group_members',
    'group_grades',
    'tp_templates',
    'tp_template_criteria',
    'stamp_categories',
    'bonuses',
    'stamp_cards',
    'stamps',
    'bonus_selections',
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
