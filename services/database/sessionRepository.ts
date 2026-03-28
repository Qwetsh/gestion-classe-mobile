import * as Crypto from 'expo-crypto';
import { executeSql, executeTransaction, queryAll, queryFirst } from './client';

export interface Session {
  id: string;
  user_id: string;
  class_id: string;
  room_id: string;
  topic: string | null;
  notes: string | null;
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
    notes: null,
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
 * Cleanup orphan sessions (active sessions older than maxHours)
 * These are sessions that were never properly ended (app crash, force quit, etc.)
 * We auto-end them rather than delete to preserve event data
 */
export async function cleanupOrphanSessions(userId: string, maxHours: number = 12): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - maxHours);
  const cutoffISO = cutoffDate.toISOString();
  const now = new Date().toISOString();

  // Find orphan sessions
  const orphans = await queryAll<Session>(
    `SELECT * FROM sessions
     WHERE user_id = ?
       AND ended_at IS NULL
       AND started_at < ?`,
    [userId, cutoffISO]
  );

  if (orphans.length > 0) {
    console.log(`[sessionRepository] Found ${orphans.length} orphan session(s), auto-ending them`);

    // Auto-end each orphan session
    for (const session of orphans) {
      await executeSql(
        `UPDATE sessions SET ended_at = ?, synced_at = NULL WHERE id = ?`,
        [now, session.id]
      );
      console.log(`[sessionRepository] Auto-ended orphan session: ${session.id} (started: ${session.started_at})`);
    }
  }

  return orphans.length;
}

/**
 * Update session notes
 */
export async function updateSessionNotes(id: string, notes: string | null): Promise<Session | null> {
  const trimmedNotes = notes?.trim() || null;

  // Reset synced_at to NULL so the session gets re-synced with new notes
  await executeSql(
    `UPDATE sessions SET notes = ?, synced_at = NULL WHERE id = ?`,
    [trimmedNotes, id]
  );

  if (__DEV__) {
    console.log('[sessionRepository] Updated session notes:', id);
  }
  return getSessionById(id);
}

/**
 * Delete a session and its events
 */
export async function deleteSession(id: string): Promise<void> {
  if (__DEV__) {
    console.log('[sessionRepository] deleteSession called with id:', id);
  }

  // Atomic deletion: events + linked group sessions + session
  await executeTransaction([
    { sql: `DELETE FROM events WHERE session_id = ?`, params: [id] },
    { sql: `DELETE FROM group_sessions WHERE linked_session_id = ?`, params: [id] },
    { sql: `DELETE FROM sessions WHERE id = ?`, params: [id] },
  ]);

  if (__DEV__) {
    console.log('[sessionRepository] Session deleted:', id);
  }
}
