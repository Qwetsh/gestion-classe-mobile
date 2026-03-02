// Type exports
// Add type exports as they are created

export interface Student {
  id: string;
  pseudo: string;
  classId: string;
  createdAt: string;
  photoPath?: string | null;
}

export interface Class {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  classId: string;
  roomId: string;
  startedAt: string;
  endedAt: string | null;
  syncedAt: string | null;
}

export interface Event {
  id: string;
  sessionId: string;
  studentId: string;
  type: EventType;
  subtype?: string;
  note?: string;
  timestamp: string;
  syncedAt: string | null;
}

export type EventType =
  | 'participation'
  | 'bavardage'
  | 'absence'
  | 'remarque'
  | 'sortie'
  | 'note_groupe';

export interface Room {
  id: string;
  user_id: string;
  name: string;
  grid_rows: number;
  grid_cols: number;
  disabled_cells: string; // JSON string: '["0,2", "1,3"]'
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  is_deleted: number;
}

// ============ GROUP TYPES ============

/**
 * Template de groupes sauvegardé (par classe)
 */
export interface GroupTemplate {
  id: string;
  userId: string;
  classId: string;
  name: string; // Ex: "Îlots habituels"
  groupsConfig: GroupConfig[]; // Configuration des groupes
  createdAt: string;
  updatedAt: string | null;
  syncedAt: string | null;
  isDeleted: boolean;
}

/**
 * Configuration d'un groupe dans un template
 */
export interface GroupConfig {
  number: number; // Numéro du groupe (1, 2, 3...)
  studentIds: string[]; // IDs des élèves
}

/**
 * Groupe actif dans une séance
 */
export interface SessionGroup {
  id: string;
  sessionId: string;
  groupNumber: number; // 1, 2, 3...
  createdAt: string;
  syncedAt: string | null;
}

/**
 * Membre d'un groupe (liaison élève-groupe)
 */
export interface GroupMember {
  id: string;
  sessionGroupId: string;
  studentId: string;
  joinedAt: string;
  leftAt: string | null; // NULL si toujours membre
  syncedAt: string | null;
}

/**
 * Événement de groupe (remarque ou note)
 */
export interface GroupEvent {
  id: string;
  sessionGroupId: string;
  type: GroupEventType;
  note: string | null; // Texte remarque
  photoPath: string | null; // Photo optionnelle
  gradeValue: number | null; // Valeur note (ex: 8)
  gradeMax: number | null; // Barème (ex: 10)
  timestamp: string;
  syncedAt: string | null;
}

export type GroupEventType = 'remarque' | 'note';

/**
 * Groupe avec ses membres (pour l'affichage)
 */
export interface SessionGroupWithMembers extends SessionGroup {
  members: GroupMemberWithStudent[];
  events: GroupEvent[];
}

/**
 * Membre avec infos élève
 */
export interface GroupMemberWithStudent extends GroupMember {
  student: Student;
}
