import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

export interface SessionGroupRow {
  id: string;
  session_id: string;
  group_number: number;
  created_at: string;
  synced_at: string | null;
}

/**
 * Create a new session group
 */
export async function createSessionGroup(
  sessionId: string,
  groupNumber: number
): Promise<SessionGroupRow> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO session_groups (id, session_id, group_number, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, sessionId, groupNumber, now]
  );

  if (__DEV__) {
    console.log('[sessionGroupRepository] Created group:', id, 'number:', groupNumber);
  }

  return {
    id,
    session_id: sessionId,
    group_number: groupNumber,
    created_at: now,
    synced_at: null,
  };
}

/**
 * Create multiple groups at once (for batch creation)
 */
export async function createSessionGroups(
  sessionId: string,
  groupNumbers: number[]
): Promise<SessionGroupRow[]> {
  const groups: SessionGroupRow[] = [];
  const now = new Date().toISOString();

  for (const groupNumber of groupNumbers) {
    const id = Crypto.randomUUID();

    await executeSql(
      `INSERT INTO session_groups (id, session_id, group_number, created_at)
       VALUES (?, ?, ?, ?)`,
      [id, sessionId, groupNumber, now]
    );

    groups.push({
      id,
      session_id: sessionId,
      group_number: groupNumber,
      created_at: now,
      synced_at: null,
    });
  }

  if (__DEV__) {
    console.log('[sessionGroupRepository] Created', groups.length, 'groups for session:', sessionId);
  }

  return groups;
}

/**
 * Get all groups for a session
 */
export async function getGroupsBySessionId(sessionId: string): Promise<SessionGroupRow[]> {
  return queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups
     WHERE session_id = ?
     ORDER BY group_number ASC`,
    [sessionId]
  );
}

/**
 * Get a group by ID
 */
export async function getGroupById(id: string): Promise<SessionGroupRow | null> {
  return queryFirst<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE id = ?`,
    [id]
  );
}

/**
 * Get group by session and number
 */
export async function getGroupByNumber(
  sessionId: string,
  groupNumber: number
): Promise<SessionGroupRow | null> {
  return queryFirst<SessionGroupRow>(
    `SELECT * FROM session_groups
     WHERE session_id = ? AND group_number = ?`,
    [sessionId, groupNumber]
  );
}

/**
 * Delete a session group and its members/events
 */
export async function deleteSessionGroup(id: string): Promise<void> {
  if (__DEV__) {
    console.log('[sessionGroupRepository] Deleting group:', id);
  }

  // Delete group events first
  await executeSql(
    `DELETE FROM group_events WHERE session_group_id = ?`,
    [id]
  );

  // Delete group members
  await executeSql(
    `DELETE FROM group_members WHERE session_group_id = ?`,
    [id]
  );

  // Delete the group
  await executeSql(
    `DELETE FROM session_groups WHERE id = ?`,
    [id]
  );

  if (__DEV__) {
    console.log('[sessionGroupRepository] Group deleted:', id);
  }
}

/**
 * Delete all groups for a session
 */
export async function deleteGroupsBySessionId(sessionId: string): Promise<void> {
  const groups = await getGroupsBySessionId(sessionId);

  for (const group of groups) {
    await deleteSessionGroup(group.id);
  }

  if (__DEV__) {
    console.log('[sessionGroupRepository] Deleted all groups for session:', sessionId);
  }
}

/**
 * Get unsynced groups
 */
export async function getUnsyncedGroups(): Promise<SessionGroupRow[]> {
  return queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE synced_at IS NULL`
  );
}

/**
 * Mark group as synced
 */
export async function markGroupSynced(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE session_groups SET synced_at = ? WHERE id = ?`,
    [now, id]
  );
}

/**
 * Get next available group number for a session
 */
export async function getNextGroupNumber(sessionId: string): Promise<number> {
  const result = await queryFirst<{ max_number: number | null }>(
    `SELECT MAX(group_number) as max_number FROM session_groups WHERE session_id = ?`,
    [sessionId]
  );

  return (result?.max_number ?? 0) + 1;
}
