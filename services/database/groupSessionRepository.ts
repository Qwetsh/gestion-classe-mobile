import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst, executeTransaction } from './client';
import {
  GroupSession,
  GradingCriteria,
  SessionGroup,
  SessionGroupMember,
  GroupGrade,
  GroupSessionStatus,
} from '../../types';

// ============================================
// Database Row Types (snake_case from SQLite)
// ============================================

interface GroupSessionRow {
  id: string;
  user_id: string;
  class_id: string;
  name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  synced_at: string | null;
}

interface GradingCriteriaRow {
  id: string;
  session_id: string;
  label: string;
  max_points: number;
  display_order: number;
  synced_at: string | null;
}

interface SessionGroupRow {
  id: string;
  session_id: string;
  name: string;
  conduct_malus: number;
  synced_at: string | null;
}

interface SessionGroupMemberRow {
  id: string;
  group_id: string;
  student_id: string;
  synced_at: string | null;
}

interface GroupGradeRow {
  id: string;
  group_id: string;
  criteria_id: string;
  points_awarded: number;
  synced_at: string | null;
}

// ============================================
// Row to Type Converters
// ============================================

function rowToGroupSession(row: GroupSessionRow): GroupSession {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    name: row.name,
    status: row.status as GroupSessionStatus,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    syncedAt: row.synced_at,
  };
}

function rowToGradingCriteria(row: GradingCriteriaRow): GradingCriteria {
  return {
    id: row.id,
    sessionId: row.session_id,
    label: row.label,
    maxPoints: row.max_points,
    displayOrder: row.display_order,
    syncedAt: row.synced_at,
  };
}

function rowToSessionGroup(row: SessionGroupRow): SessionGroup {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    conductMalus: row.conduct_malus,
    syncedAt: row.synced_at,
  };
}

function rowToSessionGroupMember(row: SessionGroupMemberRow): SessionGroupMember {
  return {
    id: row.id,
    groupId: row.group_id,
    studentId: row.student_id,
    syncedAt: row.synced_at,
  };
}

function rowToGroupGrade(row: GroupGradeRow): GroupGrade {
  return {
    id: row.id,
    groupId: row.group_id,
    criteriaId: row.criteria_id,
    pointsAwarded: row.points_awarded,
    syncedAt: row.synced_at,
  };
}

// ============================================
// Group Session CRUD
// ============================================

/**
 * Create a new group session
 */
export async function createGroupSession(
  userId: string,
  classId: string,
  name: string
): Promise<GroupSession> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO group_sessions (id, user_id, class_id, name, status, created_at)
     VALUES (?, ?, ?, ?, 'draft', ?)`,
    [id, userId, classId, name.trim(), now]
  );

  if (__DEV__) {
    console.log('[groupSessionRepository] Created session:', name);
  }

  return {
    id,
    userId,
    classId,
    name: name.trim(),
    status: 'draft',
    createdAt: now,
    completedAt: null,
    syncedAt: null,
  };
}

/**
 * Get all group sessions for a user
 */
export async function getGroupSessionsByUserId(userId: string): Promise<GroupSession[]> {
  const rows = await queryAll<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE user_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map(rowToGroupSession);
}

/**
 * Get active group session for a user (status = 'active' or 'draft')
 * Returns the most recent one if multiple exist
 */
export async function getActiveGroupSession(userId: string): Promise<GroupSession | null> {
  const row = await queryFirst<GroupSessionRow>(
    `SELECT * FROM group_sessions
     WHERE user_id = ? AND status IN ('active', 'draft')
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return row ? rowToGroupSession(row) : null;
}

/**
 * Get all group sessions for a class
 */
export async function getGroupSessionsByClassId(classId: string): Promise<GroupSession[]> {
  const rows = await queryAll<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE class_id = ? ORDER BY created_at DESC`,
    [classId]
  );
  return rows.map(rowToGroupSession);
}

/**
 * Get a group session by ID
 */
export async function getGroupSessionById(id: string): Promise<GroupSession | null> {
  const row = await queryFirst<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE id = ?`,
    [id]
  );
  return row ? rowToGroupSession(row) : null;
}

/**
 * Update group session status
 */
export async function updateGroupSessionStatus(
  id: string,
  status: GroupSessionStatus
): Promise<void> {
  const completedAt = status === 'completed' ? new Date().toISOString() : null;

  await executeSql(
    `UPDATE group_sessions SET status = ?, completed_at = ?, synced_at = NULL WHERE id = ?`,
    [status, completedAt, id]
  );

  if (__DEV__) {
    console.log('[groupSessionRepository] Updated session status:', id, status);
  }
}

/**
 * Update group session name
 */
export async function updateGroupSessionName(id: string, name: string): Promise<void> {
  await executeSql(
    `UPDATE group_sessions SET name = ?, synced_at = NULL WHERE id = ?`,
    [name.trim(), id]
  );
}

/**
 * Delete a group session and all related data
 */
export async function deleteGroupSession(id: string): Promise<void> {
  // SQLite cascade will handle related tables
  await executeSql(`DELETE FROM group_sessions WHERE id = ?`, [id]);

  if (__DEV__) {
    console.log('[groupSessionRepository] Deleted session:', id);
  }
}

// ============================================
// Grading Criteria CRUD
// ============================================

/**
 * Create a grading criterion
 */
export async function createGradingCriteria(
  sessionId: string,
  label: string,
  maxPoints: number,
  displayOrder: number
): Promise<GradingCriteria> {
  const id = Crypto.randomUUID();

  await executeSql(
    `INSERT INTO grading_criteria (id, session_id, label, max_points, display_order)
     VALUES (?, ?, ?, ?, ?)`,
    [id, sessionId, label.trim(), maxPoints, displayOrder]
  );

  return {
    id,
    sessionId,
    label: label.trim(),
    maxPoints,
    displayOrder,
    syncedAt: null,
  };
}

/**
 * Get all criteria for a session
 */
export async function getCriteriaBySessionId(sessionId: string): Promise<GradingCriteria[]> {
  const rows = await queryAll<GradingCriteriaRow>(
    `SELECT * FROM grading_criteria WHERE session_id = ? ORDER BY display_order`,
    [sessionId]
  );
  return rows.map(rowToGradingCriteria);
}

/**
 * Update a criterion
 */
export async function updateGradingCriteria(
  id: string,
  label: string,
  maxPoints: number
): Promise<void> {
  await executeSql(
    `UPDATE grading_criteria SET label = ?, max_points = ?, synced_at = NULL WHERE id = ?`,
    [label.trim(), maxPoints, id]
  );
}

/**
 * Delete a criterion
 */
export async function deleteGradingCriteria(id: string): Promise<void> {
  await executeSql(`DELETE FROM grading_criteria WHERE id = ?`, [id]);
}

/**
 * Reorder criteria
 */
export async function reorderCriteria(
  criteria: { id: string; displayOrder: number }[]
): Promise<void> {
  const statements = criteria.map((c) => ({
    sql: `UPDATE grading_criteria SET display_order = ?, synced_at = NULL WHERE id = ?`,
    params: [c.displayOrder, c.id],
  }));
  await executeTransaction(statements);
}

// ============================================
// Session Groups CRUD
// ============================================

/**
 * Create a session group
 */
export async function createSessionGroup(
  sessionId: string,
  name: string
): Promise<SessionGroup> {
  const id = Crypto.randomUUID();

  await executeSql(
    `INSERT INTO session_groups (id, session_id, name, conduct_malus)
     VALUES (?, ?, ?, 0)`,
    [id, sessionId, name.trim()]
  );

  return {
    id,
    sessionId,
    name: name.trim(),
    conductMalus: 0,
    syncedAt: null,
  };
}

/**
 * Get all groups for a session
 */
export async function getGroupsBySessionId(sessionId: string): Promise<SessionGroup[]> {
  const rows = await queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE session_id = ? ORDER BY name`,
    [sessionId]
  );
  return rows.map(rowToSessionGroup);
}

/**
 * Get a session group by ID
 */
export async function getSessionGroupById(id: string): Promise<SessionGroup | null> {
  const row = await queryFirst<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE id = ?`,
    [id]
  );
  return row ? rowToSessionGroup(row) : null;
}

/**
 * Update group name
 */
export async function updateSessionGroupName(id: string, name: string): Promise<void> {
  await executeSql(
    `UPDATE session_groups SET name = ?, synced_at = NULL WHERE id = ?`,
    [name.trim(), id]
  );
}

/**
 * Apply conduct malus (adds to existing malus)
 */
export async function applyGroupMalus(id: string, malusChange: number): Promise<void> {
  await executeSql(
    `UPDATE session_groups SET conduct_malus = conduct_malus + ?, synced_at = NULL WHERE id = ?`,
    [malusChange, id]
  );

  if (__DEV__) {
    console.log('[groupSessionRepository] Applied malus:', id, malusChange);
  }
}

/**
 * Set group malus directly
 */
export async function setGroupMalus(id: string, malus: number): Promise<void> {
  await executeSql(
    `UPDATE session_groups SET conduct_malus = ?, synced_at = NULL WHERE id = ?`,
    [malus, id]
  );
}

/**
 * Delete a session group
 */
export async function deleteSessionGroup(id: string): Promise<void> {
  await executeSql(`DELETE FROM session_groups WHERE id = ?`, [id]);
}

// ============================================
// Session Group Members CRUD
// ============================================

/**
 * Add a student to a group
 */
export async function addGroupMember(
  groupId: string,
  studentId: string
): Promise<SessionGroupMember> {
  const id = Crypto.randomUUID();

  await executeSql(
    `INSERT OR REPLACE INTO session_group_members (id, group_id, student_id)
     VALUES (?, ?, ?)`,
    [id, groupId, studentId]
  );

  return {
    id,
    groupId,
    studentId,
    syncedAt: null,
  };
}

/**
 * Add multiple students to a group
 */
export async function addGroupMembersBatch(
  groupId: string,
  studentIds: string[]
): Promise<void> {
  const statements = studentIds.map((studentId) => ({
    sql: `INSERT OR REPLACE INTO session_group_members (id, group_id, student_id) VALUES (?, ?, ?)`,
    params: [Crypto.randomUUID(), groupId, studentId],
  }));
  await executeTransaction(statements);
}

/**
 * Get members of a group
 */
export async function getGroupMembers(groupId: string): Promise<SessionGroupMember[]> {
  const rows = await queryAll<SessionGroupMemberRow>(
    `SELECT * FROM session_group_members WHERE group_id = ?`,
    [groupId]
  );
  return rows.map(rowToSessionGroupMember);
}

/**
 * Get member student IDs for a group
 */
export async function getGroupMemberIds(groupId: string): Promise<string[]> {
  const rows = await queryAll<{ student_id: string }>(
    `SELECT student_id FROM session_group_members WHERE group_id = ?`,
    [groupId]
  );
  return rows.map((r) => r.student_id);
}

/**
 * Remove a student from a group
 */
export async function removeGroupMember(groupId: string, studentId: string): Promise<void> {
  await executeSql(
    `DELETE FROM session_group_members WHERE group_id = ? AND student_id = ?`,
    [groupId, studentId]
  );
}

/**
 * Clear all members from a group
 */
export async function clearGroupMembers(groupId: string): Promise<void> {
  await executeSql(`DELETE FROM session_group_members WHERE group_id = ?`, [groupId]);
}

// ============================================
// Group Grades CRUD
// ============================================

/**
 * Set grade for a criterion on a group
 */
export async function setGroupGrade(
  groupId: string,
  criteriaId: string,
  pointsAwarded: number
): Promise<GroupGrade> {
  const id = Crypto.randomUUID();

  await executeSql(
    `INSERT OR REPLACE INTO group_grades (id, group_id, criteria_id, points_awarded)
     VALUES (
       COALESCE((SELECT id FROM group_grades WHERE group_id = ? AND criteria_id = ?), ?),
       ?, ?, ?
     )`,
    [groupId, criteriaId, id, groupId, criteriaId, pointsAwarded]
  );

  return {
    id,
    groupId,
    criteriaId,
    pointsAwarded,
    syncedAt: null,
  };
}

/**
 * Get all grades for a group
 */
export async function getGradesByGroupId(groupId: string): Promise<GroupGrade[]> {
  const rows = await queryAll<GroupGradeRow>(
    `SELECT * FROM group_grades WHERE group_id = ?`,
    [groupId]
  );
  return rows.map(rowToGroupGrade);
}

/**
 * Get grade for a specific criterion on a group
 */
export async function getGrade(groupId: string, criteriaId: string): Promise<GroupGrade | null> {
  const row = await queryFirst<GroupGradeRow>(
    `SELECT * FROM group_grades WHERE group_id = ? AND criteria_id = ?`,
    [groupId, criteriaId]
  );
  return row ? rowToGroupGrade(row) : null;
}

/**
 * Get all grades for a session (all groups)
 */
export async function getGradesBySessionId(sessionId: string): Promise<GroupGrade[]> {
  const rows = await queryAll<GroupGradeRow>(
    `SELECT gg.* FROM group_grades gg
     JOIN session_groups sg ON gg.group_id = sg.id
     WHERE sg.session_id = ?`,
    [sessionId]
  );
  return rows.map(rowToGroupGrade);
}

// ============================================
// Computed Values
// ============================================

/**
 * Calculate total score for a group
 * Returns sum of awarded points minus conduct malus
 */
export async function calculateGroupScore(groupId: string): Promise<number> {
  const group = await getSessionGroupById(groupId);
  if (!group) return 0;

  const grades = await getGradesByGroupId(groupId);
  const pointsSum = grades.reduce((sum, g) => sum + g.pointsAwarded, 0);

  return pointsSum - group.conductMalus; // conductMalus is stored as positive
}

/**
 * Calculate max possible score for a session
 */
export async function calculateMaxScore(sessionId: string): Promise<number> {
  const criteria = await getCriteriaBySessionId(sessionId);
  return criteria.reduce((sum, c) => sum + c.maxPoints, 0);
}

/**
 * Get student's grades from all group sessions they participated in
 */
export async function getStudentGroupSessionGrades(
  studentId: string
): Promise<Array<{
  sessionId: string;
  sessionName: string;
  classId: string;
  completedAt: string;
  score: number;
  maxScore: number;
}>> {
  const rows = await queryAll<{
    session_id: string;
    session_name: string;
    class_id: string;
    completed_at: string;
    group_id: string;
    conduct_malus: number;
  }>(
    `SELECT gs.id as session_id, gs.name as session_name, gs.class_id, gs.completed_at,
            sg.id as group_id, sg.conduct_malus
     FROM group_sessions gs
     JOIN session_groups sg ON sg.session_id = gs.id
     JOIN session_group_members sgm ON sgm.group_id = sg.id
     WHERE sgm.student_id = ? AND gs.status = 'completed'
     ORDER BY gs.completed_at DESC`,
    [studentId]
  );

  const results = [];

  for (const row of rows) {
    const grades = await getGradesByGroupId(row.group_id);
    const criteria = await getCriteriaBySessionId(row.session_id);

    const score = grades.reduce((sum, g) => sum + g.pointsAwarded, 0) - row.conduct_malus;
    const maxScore = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

    results.push({
      sessionId: row.session_id,
      sessionName: row.session_name,
      classId: row.class_id,
      completedAt: row.completed_at,
      score,
      maxScore,
    });
  }

  return results;
}

// ============================================
// Unsynced Data for Sync Service
// ============================================

export async function getUnsyncedGroupSessions(): Promise<GroupSession[]> {
  const rows = await queryAll<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE synced_at IS NULL`
  );
  return rows.map(rowToGroupSession);
}

export async function getUnsyncedGradingCriteria(): Promise<GradingCriteria[]> {
  const rows = await queryAll<GradingCriteriaRow>(
    `SELECT * FROM grading_criteria WHERE synced_at IS NULL`
  );
  return rows.map(rowToGradingCriteria);
}

export async function getUnsyncedSessionGroups(): Promise<SessionGroup[]> {
  const rows = await queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE synced_at IS NULL`
  );
  return rows.map(rowToSessionGroup);
}

export async function getUnsyncedGroupMembers(): Promise<SessionGroupMember[]> {
  const rows = await queryAll<SessionGroupMemberRow>(
    `SELECT * FROM session_group_members WHERE synced_at IS NULL`
  );
  return rows.map(rowToSessionGroupMember);
}

export async function getUnsyncedGroupGrades(): Promise<GroupGrade[]> {
  const rows = await queryAll<GroupGradeRow>(
    `SELECT * FROM group_grades WHERE synced_at IS NULL`
  );
  return rows.map(rowToGroupGrade);
}

/**
 * Mark records as synced
 */
export async function markGroupSessionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE group_sessions SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

export async function markGradingCriteriaSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE grading_criteria SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

export async function markSessionGroupsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE session_groups SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

export async function markGroupMembersSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE session_group_members SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}

export async function markGroupGradesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE group_grades SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );
}
