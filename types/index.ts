// Type exports
// Add type exports as they are created

export interface Student {
  id: string;
  pseudo: string;
  classId: string;
  groupId?: string | null;
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
