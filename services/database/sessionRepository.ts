import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

export interface Session {
  id: string;
  user_id: string;
  class_id: string;
  room_id: string;
  topic: string | null;
  started_at: string;
  ended_at: string | null;
  synced_at: string | null;
}

/**
 * Create a new session
 */
export async function createSession(
  userId: string,
  classId: string,
  roomId: string,
  topic?: string | null
): Promise<Session> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionTopic = topic?.trim() || null;

  await executeSql(
    `INSERT INTO sessions (id, user_id, class_id, room_id, topic, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, classId, roomId, sessionTopic, now]
  );

  if (__DEV__) {
    console.log('[sessionRepository] Created session:', id, 'topic:', sessionTopic);
  }

  return {
    id,
    user_id: userId,
    class_id: classId,
    room_id: roomId,
    topic: sessionTopic,
    started_at: now,
    ended_at: null,
    synced_at: null,
  };
}

/**
 * End a session
 */
export async function endSession(id: string): Promise<Session | null> {
  const now = new Date().toISOString();

  // Reset synced_at to NULL so the session gets re-synced with ended_at
  await executeSql(
    `UPDATE sessions SET ended_at = ?, synced_at = NULL WHERE id = ?`,
    [now, id]
  );

  if (__DEV__) {
    console.log('[sessionRepository] Ended session:', id);
  }
  return getSessionById(id);
}

/**
 * Get a session by ID
 */
export async function getSessionById(id: string): Promise<Session | null> {
  return queryFirst<Session>(
    `SELECT * FROM sessions WHERE id = ?`,
    [id]
  );
}

/**
 * Get active session for a user (not ended)
 */
export async function getActiveSession(userId: string): Promise<Session | null> {
  return queryFirst<Session>(
    `SELECT * FROM sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );
}

/**
 * Get all sessions for a user
 */
export async function getSessionsByUserId(userId: string): Promise<Session[]> {
  return queryAll<Session>(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC`,
    [userId]
  );
}

/**
 * Get sessions for a class
 */
export async function getSessionsByClassId(classId: string): Promise<Session[]> {
  return queryAll<Session>(
    `SELECT * FROM sessions WHERE class_id = ? ORDER BY started_at DESC`,
    [classId]
  );
}

/**
 * Get sessions for a user within a date range
 */
export async function getSessionsByDateRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Session[]> {
  return queryAll<Session>(
    `SELECT * FROM sessions
     WHERE user_id = ?
       AND started_at >= ?
       AND started_at <= ?
     ORDER BY started_at DESC`,
    [userId, startDate, endDate]
  );
}

/**
 * Delete a session and its events
 */
export async function deleteSession(id: string): Promise<void> {
  if (__DEV__) {
    console.log('[sessionRepository] deleteSession called with id:', id);
  }

  // Delete events first (foreign key)
  await executeSql(
    `DELETE FROM events WHERE session_id = ?`,
    [id]
  );

  await executeSql(
    `DELETE FROM sessions WHERE id = ?`,
    [id]
  );

  if (__DEV__) {
    console.log('[sessionRepository] Session deleted:', id);
  }
}
