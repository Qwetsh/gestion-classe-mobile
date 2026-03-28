/**
 * Database schema definitions
 * Aligned with Supabase schema from architecture.md
 */

export const SCHEMA_VERSION = 11;

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

-- ============================================
-- Group Sessions (Séances de groupe notées)
-- ============================================

-- Group sessions table (parent table for graded group activities)
CREATE TABLE IF NOT EXISTS group_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  synced_at TEXT,
  linked_session_id TEXT,
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (linked_session_id) REFERENCES sessions(id)
);

-- Grading criteria for a group session
CREATE TABLE IF NOT EXISTS grading_criteria (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT,
  FOREIGN KEY (session_id) REFERENCES group_sessions(id) ON DELETE CASCADE
);

-- Groups within a session
CREATE TABLE IF NOT EXISTS session_groups (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  conduct_malus REAL NOT NULL DEFAULT 0,
  synced_at TEXT,
  FOREIGN KEY (session_id) REFERENCES group_sessions(id) ON DELETE CASCADE
);

-- Members of a session group
CREATE TABLE IF NOT EXISTS session_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  synced_at TEXT,
  FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(group_id, student_id)
);

-- Grades per criteria per group
CREATE TABLE IF NOT EXISTS group_grades (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  criteria_id TEXT NOT NULL,
  points_awarded REAL NOT NULL DEFAULT 0,
  synced_at TEXT,
  FOREIGN KEY (group_id) REFERENCES session_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (criteria_id) REFERENCES grading_criteria(id) ON DELETE CASCADE,
  UNIQUE(group_id, criteria_id)
);

-- ============================================
-- TP Templates (modèles de TP)
-- ============================================

-- TP templates table
CREATE TABLE IF NOT EXISTS tp_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

-- TP template criteria
CREATE TABLE IF NOT EXISTS tp_template_criteria (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  label TEXT NOT NULL,
  max_points REAL NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT,
  FOREIGN KEY (template_id) REFERENCES tp_templates(id) ON DELETE CASCADE
);

-- ============================================
-- Stamp Cards (Carte à tampons / Récompenses)
-- ============================================

-- Catégories de tampons (raisons d'attribution)
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
);

-- Bonus (récompenses quand carte complète)
CREATE TABLE IF NOT EXISTS bonuses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at TEXT
);

-- Cartes à tampons (une carte = 10 emplacements)
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
);

-- Tampons individuels (sur une carte)
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
);

-- Sélection de bonus par l'élève
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
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_student_id ON events(student_id);
CREATE INDEX IF NOT EXISTS idx_local_mapping_student_id ON local_student_mapping(student_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_user_id ON group_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_group_sessions_class_id ON group_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_grading_criteria_session_id ON grading_criteria(session_id);
CREATE INDEX IF NOT EXISTS idx_session_groups_session_id ON session_groups(session_id);
CREATE INDEX IF NOT EXISTS idx_session_group_members_group_id ON session_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_session_group_members_student_id ON session_group_members(student_id);
CREATE INDEX IF NOT EXISTS idx_group_grades_group_id ON group_grades(group_id);
CREATE INDEX IF NOT EXISTS idx_group_grades_criteria_id ON group_grades(criteria_id);
CREATE INDEX IF NOT EXISTS idx_tp_templates_user_id ON tp_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_tp_template_criteria_template_id ON tp_template_criteria(template_id);
CREATE INDEX IF NOT EXISTS idx_stamp_categories_user_id ON stamp_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_bonuses_user_id ON bonuses(user_id);
CREATE INDEX IF NOT EXISTS idx_stamp_cards_student_id ON stamp_cards(student_id);
CREATE INDEX IF NOT EXISTS idx_stamp_cards_user_id ON stamp_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_stamps_card_id ON stamps(card_id);
CREATE INDEX IF NOT EXISTS idx_stamps_student_id ON stamps(student_id);
CREATE INDEX IF NOT EXISTS idx_stamps_category_id ON stamps(category_id);
CREATE INDEX IF NOT EXISTS idx_bonus_selections_card_id ON bonus_selections(card_id);
CREATE INDEX IF NOT EXISTS idx_bonus_selections_student_id ON bonus_selections(student_id);
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

/**
 * Group session statuses
 */
export const GROUP_SESSION_STATUSES = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

/**
 * Stamp card statuses
 */
export const STAMP_CARD_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
} as const;

/**
 * Default stamp categories (seeded on first use)
 */
export const DEFAULT_STAMP_CATEGORIES = [
  { label: 'Aider/Encourager un camarade', icon: '🤝', color: '#4CAF50' },
  { label: 'Utilisation d\'outils', icon: '🔧', color: '#2196F3' },
  { label: 'Participation remarquable', icon: '✋', color: '#FF9800' },
  { label: 'Comportement remarquable', icon: '⭐', color: '#FFC107' },
  { label: 'Accepter une responsabilité', icon: '🎯', color: '#9C27B0' },
  { label: 'Écriture remarquable', icon: '✍️', color: '#3F51B5' },
  { label: 'Créativité remarquable', icon: '🎨', color: '#E91E63' },
  { label: 'Travail supplémentaire', icon: '📚', color: '#795548' },
  { label: 'Avis constructif', icon: '💡', color: '#FFEB3B' },
  { label: 'Serviabilité', icon: '🤲', color: '#00BCD4' },
  { label: 'Rappel utile', icon: '🔔', color: '#FF5722' },
  { label: 'Mémoire remarquable', icon: '🧠', color: '#673AB7' },
  { label: 'Oral remarquable', icon: '🎤', color: '#F44336' },
  { label: 'Rédaction remarquable', icon: '📝', color: '#009688' },
  { label: 'Orthographe remarquable', icon: '📖', color: '#8BC34A' },
  { label: 'Lecture remarquable', icon: '📗', color: '#CDDC39' },
  { label: 'Rattrapage du cours', icon: '🔄', color: '#607D8B' },
  { label: 'Autonomie', icon: '🦾', color: '#FF6F00' },
  { label: 'Travail de groupe remarquable', icon: '👥', color: '#1565C0' },
] as const;

/**
 * Default bonuses (seeded on first use)
 */
export const DEFAULT_BONUSES = [
  'Choisir sa place de la semaine',
  '+1 pt sur la note de son choix',
  'Rendre un devoir une semaine plus tard',
  '−1 faute en devoir de langue',
  '+1 indice en évaluation',
  'Pas de cours à écrire la semaine',
  'Pas de prise de parole de la semaine',
  'Un article de papeterie au choix',
] as const;
