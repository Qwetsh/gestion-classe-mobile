import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';
import { EVENT_TYPES, SORTIE_SUBTYPES } from './schema';

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];
export type SortieSubtype = typeof SORTIE_SUBTYPES[keyof typeof SORTIE_SUBTYPES];

export interface Event {
  id: string;
  session_id: string;
  student_id: string;
  type: EventType;
  subtype: SortieSubtype | null;
  note: string | null;
  photo_path: string | null;
  timestamp: string;
  synced_at: string | null;
}

/**
 * Create a new event
 */
export async function createEvent(
  sessionId: string,
  studentId: string,
  type: EventType,
  subtype?: SortieSubtype | null,
  note?: string | null,
  photoPath?: string | null
): Promise<Event> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO events (id, session_id, student_id, type, subtype, note, photo_path, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, studentId, type, subtype || null, note || null, photoPath || null, now]
  );

  console.log('[eventRepository] Created event:', type, 'for student:', studentId);

  return {
    id,
    session_id: sessionId,
    student_id: studentId,
    type,
    subtype: subtype || null,
    note: note || null,
    photo_path: photoPath || null,
    timestamp: now,
    synced_at: null,
  };
}

/**
 * Get all events for a session
 */
export async function getEventsBySessionId(sessionId: string): Promise<Event[]> {
  return queryAll<Event>(
    `SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC`,
    [sessionId]
  );
}

/**
 * Get all events for a student
 */
export async function getEventsByStudentId(studentId: string): Promise<Event[]> {
  return queryAll<Event>(
    `SELECT * FROM events WHERE student_id = ? ORDER BY timestamp DESC`,
    [studentId]
  );
}

/**
 * Get events for a student in a session
 */
export async function getStudentEventsInSession(
  sessionId: string,
  studentId: string
): Promise<Event[]> {
  return queryAll<Event>(
    `SELECT * FROM events WHERE session_id = ? AND student_id = ? ORDER BY timestamp ASC`,
    [sessionId, studentId]
  );
}

/**
 * Get event counts for a student in a session
 */
export interface StudentEventCounts {
  participation: number;
  bavardage: number;
  absence: number;
  remarque: number;
  sortie: number;
}

export async function getStudentEventCounts(
  sessionId: string,
  studentId: string
): Promise<StudentEventCounts> {
  const events = await getStudentEventsInSession(sessionId, studentId);

  const counts: StudentEventCounts = {
    participation: 0,
    bavardage: 0,
    absence: 0,
    remarque: 0,
    sortie: 0,
  };

  for (const event of events) {
    switch (event.type) {
      case EVENT_TYPES.PARTICIPATION:
        counts.participation++;
        break;
      case EVENT_TYPES.BAVARDAGE:
        counts.bavardage++;
        break;
      case EVENT_TYPES.ABSENCE:
        counts.absence++;
        break;
      case EVENT_TYPES.REMARQUE:
        counts.remarque++;
        break;
      case EVENT_TYPES.SORTIE:
        counts.sortie++;
        break;
    }
  }

  return counts;
}

/**
 * Get event counts for all students in a session
 */
export async function getAllStudentEventCounts(
  sessionId: string
): Promise<Record<string, StudentEventCounts>> {
  const events = await getEventsBySessionId(sessionId);

  const countsByStudent: Record<string, StudentEventCounts> = {};

  for (const event of events) {
    if (!countsByStudent[event.student_id]) {
      countsByStudent[event.student_id] = {
        participation: 0,
        bavardage: 0,
        absence: 0,
        remarque: 0,
        sortie: 0,
      };
    }

    const counts = countsByStudent[event.student_id];
    switch (event.type) {
      case EVENT_TYPES.PARTICIPATION:
        counts.participation++;
        break;
      case EVENT_TYPES.BAVARDAGE:
        counts.bavardage++;
        break;
      case EVENT_TYPES.ABSENCE:
        counts.absence++;
        break;
      case EVENT_TYPES.REMARQUE:
        counts.remarque++;
        break;
      case EVENT_TYPES.SORTIE:
        counts.sortie++;
        break;
    }
  }

  return countsByStudent;
}

export interface ClassStudentEventCounts {
  participation: number;
  bavardage: number;
  absence: number;
  remarque: number;
  sortie: number;
  retour: number;
}

/**
 * Get event counts for all students in a class across all sessions
 */
export async function getClassStudentEventCounts(
  classId: string
): Promise<Record<string, ClassStudentEventCounts>> {
  const events = await queryAll<Event>(
    `SELECT e.* FROM events e
     INNER JOIN sessions s ON e.session_id = s.id
     WHERE s.class_id = ?
     ORDER BY e.timestamp ASC`,
    [classId]
  );

  const countsByStudent: Record<string, ClassStudentEventCounts> = {};

  for (const event of events) {
    if (!countsByStudent[event.student_id]) {
      countsByStudent[event.student_id] = {
        participation: 0,
        bavardage: 0,
        absence: 0,
        remarque: 0,
        sortie: 0,
        retour: 0,
      };
    }

    const counts = countsByStudent[event.student_id];
    switch (event.type) {
      case EVENT_TYPES.PARTICIPATION:
        counts.participation++;
        break;
      case EVENT_TYPES.BAVARDAGE:
        counts.bavardage++;
        break;
      case EVENT_TYPES.ABSENCE:
        counts.absence++;
        break;
      case EVENT_TYPES.REMARQUE:
        counts.remarque++;
        break;
      case EVENT_TYPES.SORTIE:
        counts.sortie++;
        break;
      case EVENT_TYPES.RETOUR:
        counts.retour++;
        break;
    }
  }

  return countsByStudent;
}

/**
 * Delete an event
 */
export async function deleteEvent(id: string): Promise<void> {
  await executeSql(
    `DELETE FROM events WHERE id = ?`,
    [id]
  );
  console.log('[eventRepository] Deleted event:', id);
}

/**
 * Delete all events for a student
 */
export async function deleteEventsByStudentId(studentId: string): Promise<void> {
  await executeSql(
    `DELETE FROM events WHERE student_id = ?`,
    [studentId]
  );
  console.log('[eventRepository] Deleted all events for student:', studentId);
}
