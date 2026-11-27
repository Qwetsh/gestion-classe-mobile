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
  /** Groupe de classe de la seance ; null = classe entiere */
  group_id: string | null;
}

/**
 * Create a new session
 * @param groupId groupe de classe (null/undefined = classe entiere)
 */
export async function createSession(
  userId: string,
  classId: string,
  roomId: string,
  topic?: string | null,
  groupId?: string | null
): Promise<Session> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionTopic = topic?.trim() || null;
  const sessionGroupId = groupId || null;

  await executeSql(
    `INSERT INTO sessions (id, user_id, class_id, room_id, topic, started_at, group_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, classId, roomId, sessionTopic, now, sessionGroupId]
  );

  if (__DEV__) {
    console.log('[sessionRepository] Created session:', id, 'topic:', sessionTopic, 'group:', sessionGroupId);
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
    group_id: sessionGroupId,
  };
}

/**
 * Derniere seance de la classe faite EN GROUPE (group_id non null), toutes salles confondues.
 * Sert a la preselection par alternance au demarrage d'une seance.
 * Une seance en classe entiere entre deux demi-groupes ne casse pas le cycle.
 */
export async function getLastGroupSessionForClass(classId: string): Promise<Session | null> {
  return queryFirst<Session>(
    `SELECT * FROM sessions WHERE class_id = ? AND group_id IS NOT NULL
     ORDER BY started_at DESC LIMIT 1`,
    [classId]
  );
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

  // La suppression part aussi au serveur (pending_deletions), sinon la réception suivante remet la
  // séance. Côté serveur, ses événements et ses pages de tableau partent avec elle (cascade). Les
  // séances de groupe liées passent d'abord : le serveur refuse de supprimer une séance encore citée.
  const linkedGroupSessions = await queryAll<{ id: string }>(
    `SELECT id FROM group_sessions WHERE linked_session_id = ?`,
    [id]
  );
  const base = Date.now();
  const queue = (table: string, recordId: string, offsetMs: number) => ({
    sql: `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    params: [Crypto.randomUUID(), table, recordId, new Date(base + offsetMs).toISOString()],
  });

  // Atomic deletion: events + linked group sessions + session
  await executeTransaction([
    { sql: `DELETE FROM events WHERE session_id = ?`, params: [id] },
    { sql: `DELETE FROM group_sessions WHERE linked_session_id = ?`, params: [id] },
    { sql: `DELETE FROM sessions WHERE id = ?`, params: [id] },
    ...linkedGroupSessions.map((gs) => queue('group_sessions', gs.id, 0)),
    queue('sessions', id, 1),
  ]);

  if (__DEV__) {
    console.log('[sessionRepository] Session deleted:', id);
  }
}
