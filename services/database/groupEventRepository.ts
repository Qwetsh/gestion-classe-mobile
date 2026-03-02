import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';
import { GroupEventType } from '../../types';

export interface GroupEventRow {
  id: string;
  session_group_id: string;
  type: string;
  note: string | null;
  photo_path: string | null;
  grade_value: number | null;
  grade_max: number | null;
  timestamp: string;
  synced_at: string | null;
}

/**
 * Create a group remark (remarque)
 */
export async function createGroupRemark(
  sessionGroupId: string,
  note: string,
  photoPath?: string | null
): Promise<GroupEventRow> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO group_events (id, session_group_id, type, note, photo_path, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sessionGroupId, 'remarque', note, photoPath || null, now]
  );

  if (__DEV__) {
    console.log('[groupEventRepository] Created remark for group:', sessionGroupId);
  }

  return {
    id,
    session_group_id: sessionGroupId,
    type: 'remarque',
    note,
    photo_path: photoPath || null,
    grade_value: null,
    grade_max: null,
    timestamp: now,
    synced_at: null,
  };
}

/**
 * Create a group grade (note)
 */
export async function createGroupGrade(
  sessionGroupId: string,
  gradeValue: number,
  gradeMax: number,
  note?: string | null
): Promise<GroupEventRow> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO group_events (id, session_group_id, type, note, grade_value, grade_max, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionGroupId, 'note', note || null, gradeValue, gradeMax, now]
  );

  if (__DEV__) {
    console.log('[groupEventRepository] Created grade for group:', sessionGroupId, gradeValue + '/' + gradeMax);
  }

  return {
    id,
    session_group_id: sessionGroupId,
    type: 'note',
    note: note || null,
    photo_path: null,
    grade_value: gradeValue,
    grade_max: gradeMax,
    timestamp: now,
    synced_at: null,
  };
}

/**
 * Get all events for a group
 */
export async function getEventsByGroupId(sessionGroupId: string): Promise<GroupEventRow[]> {
  return queryAll<GroupEventRow>(
    `SELECT * FROM group_events
     WHERE session_group_id = ?
     ORDER BY timestamp DESC`,
    [sessionGroupId]
  );
}

/**
 * Get events by type for a group
 */
export async function getEventsByType(
  sessionGroupId: string,
  type: GroupEventType
): Promise<GroupEventRow[]> {
  return queryAll<GroupEventRow>(
    `SELECT * FROM group_events
     WHERE session_group_id = ? AND type = ?
     ORDER BY timestamp DESC`,
    [sessionGroupId, type]
  );
}

/**
 * Get an event by ID
 */
export async function getEventById(id: string): Promise<GroupEventRow | null> {
  return queryFirst<GroupEventRow>(
    `SELECT * FROM group_events WHERE id = ?`,
    [id]
  );
}

/**
 * Get all events for a session (across all groups)
 */
export async function getEventsBySessionId(sessionId: string): Promise<GroupEventRow[]> {
  return queryAll<GroupEventRow>(
    `SELECT ge.*
     FROM group_events ge
     JOIN session_groups sg ON ge.session_group_id = sg.id
     WHERE sg.session_id = ?
     ORDER BY ge.timestamp DESC`,
    [sessionId]
  );
}

/**
 * Update an event's note/photo
 */
export async function updateGroupEvent(
  id: string,
  note?: string | null,
  photoPath?: string | null
): Promise<GroupEventRow | null> {
  await executeSql(
    `UPDATE group_events
     SET note = COALESCE(?, note),
         photo_path = COALESCE(?, photo_path),
         synced_at = NULL
     WHERE id = ?`,
    [note ?? null, photoPath ?? null, id]
  );

  if (__DEV__) {
    console.log('[groupEventRepository] Updated event:', id);
  }

  return getEventById(id);
}

/**
 * Delete an event
 */
export async function deleteGroupEvent(id: string): Promise<void> {
  await executeSql(
    `DELETE FROM group_events WHERE id = ?`,
    [id]
  );

  if (__DEV__) {
    console.log('[groupEventRepository] Deleted event:', id);
  }
}

/**
 * Delete all events for a group
 */
export async function deleteEventsByGroupId(sessionGroupId: string): Promise<void> {
  await executeSql(
    `DELETE FROM group_events WHERE session_group_id = ?`,
    [sessionGroupId]
  );

  if (__DEV__) {
    console.log('[groupEventRepository] Deleted all events for group:', sessionGroupId);
  }
}

/**
 * Get unsynced events
 */
export async function getUnsyncedEvents(): Promise<GroupEventRow[]> {
  return queryAll<GroupEventRow>(
    `SELECT * FROM group_events WHERE synced_at IS NULL`
  );
}

/**
 * Mark event as synced
 */
export async function markEventSynced(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE group_events SET synced_at = ? WHERE id = ?`,
    [now, id]
  );
}

/**
 * Get grade statistics for a session
 */
export async function getGradeStatsBySession(sessionId: string): Promise<{
  averageGrade: number | null;
  totalGrades: number;
  gradesByGroup: Array<{ groupNumber: number; averageGrade: number }>;
}> {
  // Get overall average
  const overallResult = await queryFirst<{ avg_grade: number | null; total: number }>(
    `SELECT
       AVG(ge.grade_value * 1.0 / ge.grade_max * 100) as avg_grade,
       COUNT(*) as total
     FROM group_events ge
     JOIN session_groups sg ON ge.session_group_id = sg.id
     WHERE sg.session_id = ? AND ge.type = 'note'`,
    [sessionId]
  );

  // Get average by group
  const byGroupResult = await queryAll<{ group_number: number; avg_grade: number }>(
    `SELECT
       sg.group_number,
       AVG(ge.grade_value * 1.0 / ge.grade_max * 100) as avg_grade
     FROM group_events ge
     JOIN session_groups sg ON ge.session_group_id = sg.id
     WHERE sg.session_id = ? AND ge.type = 'note'
     GROUP BY sg.group_number
     ORDER BY sg.group_number`,
    [sessionId]
  );

  return {
    averageGrade: overallResult?.avg_grade ?? null,
    totalGrades: overallResult?.total ?? 0,
    gradesByGroup: byGroupResult.map(r => ({
      groupNumber: r.group_number,
      averageGrade: r.avg_grade,
    })),
  };
}
