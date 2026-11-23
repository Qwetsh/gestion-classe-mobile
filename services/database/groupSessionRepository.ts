import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst, executeTransaction } from './client';
import {
  GroupSession,
  GradingCriteria,
  SessionGroup,
  SessionGroupMember,
  GroupGrade,
  GroupSessionStatus,
  GroupSessionPhoto,
} from '../../types';

/**
 * Une ligne supprimée en local doit aussi l'être sur le serveur : sans cela le pull la
 * ressusciterait (il insère toute ligne serveur absente du téléphone).
 */
async function queueRemoteDeletion(table: string, recordId: string): Promise<void> {
  await executeSql(
    `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    [Crypto.randomUUID(), table, recordId, new Date().toISOString()]
  );
}

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
  linked_session_id: string | null;
  template_id: string | null;
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
  position_x: number | null;
  position_y: number | null;
  comment: string | null;
  display_order: number | null;
  synced_at: string | null;
}

interface GroupSessionPhotoRow {
  id: string;
  session_id: string;
  group_id: string | null;
  file_path: string;
  local_uri: string | null;
  caption: string | null;
  author: string;
  student_id: string | null;
  created_at: string;
  uploaded: number;
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
    linkedSessionId: row.linked_session_id,
    templateId: row.template_id,
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
    positionX: row.position_x ?? null,
    positionY: row.position_y ?? null,
    comment: row.comment ?? null,
    displayOrder: row.display_order ?? 0,
    syncedAt: row.synced_at,
  };
}

function rowToGroupSessionPhoto(row: GroupSessionPhotoRow): GroupSessionPhoto {
  return {
    id: row.id,
    sessionId: row.session_id,
    groupId: row.group_id,
    filePath: row.file_path,
    localUri: row.local_uri,
    caption: row.caption ?? '',
    author: row.author === 'student' ? 'student' : 'teacher',
    studentId: row.student_id,
    createdAt: row.created_at,
    uploaded: row.uploaded === 1,
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
  name: string,
  linkedSessionId?: string,
  templateId?: string | null,
): Promise<GroupSession> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO group_sessions (id, user_id, class_id, name, status, created_at, linked_session_id, template_id)
     VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [id, userId, classId, name.trim(), now, linkedSessionId ?? null, templateId ?? null]
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
    linkedSessionId: linkedSessionId ?? null,
    templateId: templateId ?? null,
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
 * Get group session linked to a regular session
 */
export async function getGroupSessionByLinkedSessionId(linkedSessionId: string): Promise<GroupSession | null> {
  const row = await queryFirst<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE linked_session_id = ? ORDER BY created_at DESC LIMIT 1`,
    [linkedSessionId]
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
 * Rattache la séance de groupe à un modèle de TP (et prend son nom).
 */
export async function updateGroupSessionTemplate(id: string, templateId: string | null, name: string): Promise<void> {
  await executeSql(
    `UPDATE group_sessions SET template_id = ?, name = ?, synced_at = NULL WHERE id = ?`,
    [templateId, name.trim(), id]
  );
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
  await queueRemoteDeletion('grading_criteria', id);
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
  name: string,
  displayOrder?: number,
  position?: { x: number; y: number } | null,
): Promise<SessionGroup> {
  const id = Crypto.randomUUID();
  let order = displayOrder;
  if (order === undefined) {
    const row = await queryFirst<{ next: number | null }>(
      `SELECT MAX(display_order) + 1 AS next FROM session_groups WHERE session_id = ?`,
      [sessionId]
    );
    order = row?.next ?? 0;
  }

  await executeSql(
    `INSERT INTO session_groups (id, session_id, name, conduct_malus, display_order, position_x, position_y)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [id, sessionId, name.trim(), order, position?.x ?? null, position?.y ?? null]
  );

  return {
    id,
    sessionId,
    name: name.trim(),
    conductMalus: 0,
    positionX: position?.x ?? null,
    positionY: position?.y ?? null,
    comment: null,
    displayOrder: order,
    syncedAt: null,
  };
}

/** Position de l'îlot (0..1 sur les deux axes), null = rangement automatique. */
export async function updateSessionGroupPosition(id: string, x: number | null, y: number | null): Promise<void> {
  const clamp = (v: number | null) => (v === null ? null : Math.min(1, Math.max(0, v)));
  await executeSql(
    `UPDATE session_groups SET position_x = ?, position_y = ?, synced_at = NULL WHERE id = ?`,
    [clamp(x), clamp(y), id]
  );
}

export async function updateSessionGroupComment(id: string, comment: string): Promise<void> {
  const trimmed = comment.trim();
  await executeSql(
    `UPDATE session_groups SET comment = ?, synced_at = NULL WHERE id = ?`,
    [trimmed.length > 0 ? trimmed : null, id]
  );
}

/**
 * Get all groups for a session
 */
export async function getGroupsBySessionId(sessionId: string): Promise<SessionGroup[]> {
  const rows = await queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE session_id = ? ORDER BY display_order, name`,
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
  // Membres et notes partent en cascade, des deux côtés (clés étrangères ON DELETE CASCADE)
  await executeSql(`DELETE FROM session_groups WHERE id = ?`, [id]);
  await queueRemoteDeletion('session_groups', id);
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
 * Get previous groups from the most recent group session of a class
 * Returns group names and their member IDs for reuse
 */
export async function getPreviousGroupsForClass(classId: string): Promise<{ name: string; memberIds: string[] }[] | null> {
  // Find the most recent completed/active group session for this class
  const session = await queryFirst<GroupSessionRow>(
    `SELECT * FROM group_sessions WHERE class_id = ? ORDER BY created_at DESC LIMIT 1`,
    [classId]
  );
  if (!session) return null;

  const groups = await queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE session_id = ? ORDER BY name`,
    [session.id]
  );
  if (groups.length === 0) return null;

  const result: { name: string; memberIds: string[] }[] = [];
  for (const group of groups) {
    const memberRows = await queryAll<{ student_id: string }>(
      `SELECT student_id FROM session_group_members WHERE group_id = ?`,
      [group.id]
    );
    result.push({
      name: group.name,
      memberIds: memberRows.map((r) => r.student_id),
    });
  }
  return result;
}

/**
 * Remove a student from a group
 */
export async function removeGroupMember(groupId: string, studentId: string): Promise<void> {
  const rows = await queryAll<{ id: string }>(
    `SELECT id FROM session_group_members WHERE group_id = ? AND student_id = ?`,
    [groupId, studentId]
  );
  await executeSql(
    `DELETE FROM session_group_members WHERE group_id = ? AND student_id = ?`,
    [groupId, studentId]
  );
  for (const r of rows) await queueRemoteDeletion('session_group_members', r.id);
}

/**
 * Clear all members from a group
 */
export async function clearGroupMembers(groupId: string): Promise<void> {
  const rows = await queryAll<{ id: string }>(
    `SELECT id FROM session_group_members WHERE group_id = ?`,
    [groupId]
  );
  await executeSql(`DELETE FROM session_group_members WHERE group_id = ?`, [groupId]);
  for (const r of rows) await queueRemoteDeletion('session_group_members', r.id);
}

/**
 * Place un élève dans un groupe d'une séance. S'il est déjà dans un autre groupe de la même
 * séance, sa ligne de membre est DÉPLACÉE (même id) : l'upsert la déplace aussi sur le
 * serveur, où le déclencheur du carnet lui donne la note de son nouveau groupe.
 * Retourne l'id du groupe quitté (ou null).
 */
export async function moveStudentToGroup(
  sessionId: string,
  studentId: string,
  toGroupId: string
): Promise<string | null> {
  const existing = await queryFirst<{ id: string; group_id: string }>(
    `SELECT m.id, m.group_id FROM session_group_members m
     JOIN session_groups g ON g.id = m.group_id
     WHERE g.session_id = ? AND m.student_id = ?`,
    [sessionId, studentId]
  );
  if (existing) {
    if (existing.group_id === toGroupId) return null;
    await executeSql(
      `UPDATE session_group_members SET group_id = ?, synced_at = NULL WHERE id = ?`,
      [toGroupId, existing.id]
    );
    return existing.group_id;
  }
  await executeSql(
    `INSERT INTO session_group_members (id, group_id, student_id) VALUES (?, ?, ?)`,
    [Crypto.randomUUID(), toGroupId, studentId]
  );
  return null;
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

// ============================================
// Photos de TP (par groupe ou pour toute la classe)
// ============================================

export async function createGroupSessionPhoto(photo: {
  id: string;
  sessionId: string;
  groupId: string | null;
  filePath: string;
  localUri: string;
  caption?: string;
}): Promise<GroupSessionPhoto> {
  const now = new Date().toISOString();
  await executeSql(
    `INSERT INTO group_session_photos (id, session_id, group_id, file_path, local_uri, caption, author, created_at, uploaded)
     VALUES (?, ?, ?, ?, ?, ?, 'teacher', ?, 0)`,
    [photo.id, photo.sessionId, photo.groupId, photo.filePath, photo.localUri, photo.caption?.trim() ?? '', now]
  );
  return {
    id: photo.id,
    sessionId: photo.sessionId,
    groupId: photo.groupId,
    filePath: photo.filePath,
    localUri: photo.localUri,
    caption: photo.caption?.trim() ?? '',
    author: 'teacher',
    studentId: null,
    createdAt: now,
    uploaded: false,
    syncedAt: null,
  };
}

export async function getPhotosBySessionId(sessionId: string): Promise<GroupSessionPhoto[]> {
  const rows = await queryAll<GroupSessionPhotoRow>(
    `SELECT * FROM group_session_photos WHERE session_id = ? ORDER BY created_at`,
    [sessionId]
  );
  return rows.map(rowToGroupSessionPhoto);
}

export async function updateGroupSessionPhotoGroup(id: string, groupId: string | null): Promise<void> {
  await executeSql(
    `UPDATE group_session_photos SET group_id = ?, synced_at = NULL WHERE id = ?`,
    [groupId, id]
  );
}

export async function deleteGroupSessionPhoto(id: string): Promise<GroupSessionPhoto | null> {
  const row = await queryFirst<GroupSessionPhotoRow>(`SELECT * FROM group_session_photos WHERE id = ?`, [id]);
  if (!row) return null;
  await executeSql(`DELETE FROM group_session_photos WHERE id = ?`, [id]);
  await queueRemoteDeletion('group_session_photos', id);
  return rowToGroupSessionPhoto(row);
}

/** Photos dont le fichier n'est pas encore dans Storage. */
export async function getPhotosAwaitingUpload(): Promise<GroupSessionPhoto[]> {
  const rows = await queryAll<GroupSessionPhotoRow>(
    `SELECT * FROM group_session_photos WHERE uploaded = 0 AND local_uri IS NOT NULL ORDER BY created_at`
  );
  return rows.map(rowToGroupSessionPhoto);
}

export async function markPhotoUploaded(id: string): Promise<void> {
  await executeSql(`UPDATE group_session_photos SET uploaded = 1, synced_at = NULL WHERE id = ?`, [id]);
}

// ============================================
// Lancement d'un TP : suggestion et reprise
// ============================================

/**
 * TP probablement prévu aujourd'hui pour cette classe : le modèle utilisé le plus récemment
 * (15 derniers jours) dans une AUTRE classe, que cette classe n'a pas encore fait. Un même TP
 * tourne d'ordinaire dans toutes les classes d'un niveau la même semaine.
 */
export async function suggestTemplateForClass(userId: string, classId: string): Promise<string | null> {
  const since = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
  const row = await queryFirst<{ template_id: string }>(
    `SELECT gs.template_id FROM group_sessions gs
     WHERE gs.user_id = ? AND gs.class_id <> ? AND gs.template_id IS NOT NULL AND gs.created_at >= ?
       AND gs.template_id NOT IN (
         SELECT template_id FROM group_sessions WHERE class_id = ? AND template_id IS NOT NULL
       )
     ORDER BY gs.created_at DESC LIMIT 1`,
    [userId, classId, since, classId]
  );
  return row?.template_id ?? null;
}

/** Groupes (et positions) du dernier TP de la classe, pour « Reprendre le dernier TP ». */
export async function getLastTpGroupsForClass(
  classId: string,
  excludeSessionId: string | null
): Promise<Array<{ name: string; memberIds: string[]; positionX: number | null; positionY: number | null }> | null> {
  const session = await queryFirst<{ id: string }>(
    `SELECT gs.id FROM group_sessions gs
     WHERE gs.class_id = ? AND gs.id <> ? AND EXISTS (SELECT 1 FROM session_groups g WHERE g.session_id = gs.id)
     ORDER BY gs.created_at DESC LIMIT 1`,
    [classId, excludeSessionId ?? '']
  );
  if (!session) return null;
  const groups = await queryAll<SessionGroupRow>(
    `SELECT * FROM session_groups WHERE session_id = ? ORDER BY display_order, name`,
    [session.id]
  );
  const out = [];
  for (const g of groups) {
    out.push({
      name: g.name,
      memberIds: await getGroupMemberIds(g.id),
      positionX: g.position_x ?? null,
      positionY: g.position_y ?? null,
    });
  }
  return out.length > 0 ? out : null;
}
