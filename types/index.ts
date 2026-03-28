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
  | 'retour';

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

// ============================================
// Group Sessions (Séances de groupe notées)
// ============================================

export type GroupSessionStatus = 'draft' | 'active' | 'completed';

export interface GroupSession {
  id: string;
  userId: string;
  classId: string;
  name: string;
  status: GroupSessionStatus;
  createdAt: string;
  completedAt: string | null;
  syncedAt: string | null;
  linkedSessionId: string | null;
}

export interface GradingCriteria {
  id: string;
  sessionId: string;
  label: string;
  maxPoints: number;
  displayOrder: number;
  syncedAt: string | null;
}

export interface SessionGroup {
  id: string;
  sessionId: string;
  name: string;
  conductMalus: number; // Negative value (e.g., -1, -2)
  syncedAt: string | null;
}

export interface SessionGroupMember {
  id: string;
  groupId: string;
  studentId: string;
  syncedAt: string | null;
}

export interface GroupGrade {
  id: string;
  groupId: string;
  criteriaId: string;
  pointsAwarded: number;
  syncedAt: string | null;
}

// Computed types for UI
export interface SessionGroupWithMembers extends SessionGroup {
  members: Student[];
  totalScore: number; // Sum of grades + malus
}

export interface GroupSessionWithDetails extends GroupSession {
  className: string;
  criteria: GradingCriteria[];
  groups: SessionGroupWithMembers[];
  maxPossibleScore: number;
}
