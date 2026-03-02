/**
 * Database schema definitions
 * Aligned with Supabase schema from architecture.md
 */

export const SCHEMA_VERSION = 5;

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

-- Students table (pseudonymized)
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  pseudo TEXT NOT NULL,
  class_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (class_id) REFERENCES classes(id)
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

-- Group templates (saved configurations per class)
CREATE TABLE IF NOT EXISTS group_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  name TEXT NOT NULL,
  groups_config TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  synced_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Session groups (active groups during a session)
CREATE TABLE IF NOT EXISTS session_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  group_number INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Group members (student-group association)
CREATE TABLE IF NOT EXISTS group_members (
  id TEXT PRIMARY KEY,
  session_group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT,
  synced_at TEXT,
  FOREIGN KEY (session_group_id) REFERENCES session_groups(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Group events (remarks and grades for groups)
CREATE TABLE IF NOT EXISTS group_events (
  id TEXT PRIMARY KEY,
  session_group_id TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT,
  photo_path TEXT,
  grade_value REAL,
  grade_max INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT,
  FOREIGN KEY (session_group_id) REFERENCES session_groups(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_student_id ON events(student_id);
CREATE INDEX IF NOT EXISTS idx_local_mapping_student_id ON local_student_mapping(student_id);
CREATE INDEX IF NOT EXISTS idx_group_templates_class_id ON group_templates(class_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON session_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_group_members_session_group_id ON group_members(session_group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_student_id ON group_members(student_id);
CREATE INDEX IF NOT EXISTS idx_group_events_session_group_id ON group_events(session_group_id);
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
  NOTE_GROUPE: 'note_groupe',
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

/**
 * Group event types
 */
export const GROUP_EVENT_TYPES = {
  REMARQUE: 'remarque',
  NOTE: 'note',
} as const;
