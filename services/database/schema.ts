/**
 * Database schema definitions
 * Aligned with Supabase schema from architecture.md
 */

export const SCHEMA_VERSION = 6;

/**
 * SQL statements to create all tables
 */
export const CREATE_TABLES_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

-- Classes table
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  is_deleted INTEGER DEFAULT 0
);

-- Student groups table (îlots)
CREATE TABLE IF NOT EXISTS student_groups (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Students table (pseudonymized)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pseudo TEXT NOT NULL,
  class_id TEXT NOT NULL,
  group_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (group_id) REFERENCES student_groups(id)
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  grid_rows INTEGER DEFAULT 6,
  grid_cols INTEGER DEFAULT 5,
  disabled_cells TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  is_deleted INTEGER DEFAULT 0
);

-- Class-Room plans (student positions)
CREATE TABLE IF NOT EXISTS class_room_plans (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  positions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  UNIQUE(class_id, room_id)
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  topic TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  synced_at TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  type TEXT NOT NULL,
  subtype TEXT,
  note TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- LOCAL ONLY: Student name mapping (never synced to server)
-- This table stores the real names corresponding to pseudonyms
-- Required for RGPD compliance: full names stay local only
CREATE TABLE IF NOT EXISTS local_student_mapping (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_student_groups_class_id ON student_groups(class_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_student_id ON events(student_id);
CREATE INDEX IF NOT EXISTS idx_local_mapping_student_id ON local_student_mapping(student_id);
`;

/**
 * Event types
 */
export const EVENT_TYPES = {
  PARTICIPATION: 'participation',
  BAVARDAGE: 'bavardage',
  ABSENCE: 'absence',
  REMARQUE: 'remarque',
  SORTIE: 'sortie',
  RETOUR: 'retour',
} as const;

/**
 * Sortie subtypes
 */
export const SORTIE_SUBTYPES = {
  INFIRMERIE: 'infirmerie',
  TOILETTES: 'toilettes',
  CONVOCATION: 'convocation',
  EXCLUSION: 'exclusion',
} as const;
