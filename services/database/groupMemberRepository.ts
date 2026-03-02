import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

export interface GroupMemberRow {
  id: string;
  session_group_id: string;
  student_id: string;
  joined_at: string;
  left_at: string | null;
  synced_at: string | null;
}

/**
 * Add a student to a group
 */
export async function addMemberToGroup(
  sessionGroupId: string,
  studentId: string
): Promise<GroupMemberRow> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO group_members (id, session_group_id, student_id, joined_at)
     VALUES (?, ?, ?, ?)`,
    [id, sessionGroupId, studentId, now]
  );

  if (__DEV__) {
    console.log('[groupMemberRepository] Added member:', studentId, 'to group:', sessionGroupId);
  }

  return {
    id,
    session_group_id: sessionGroupId,
    student_id: studentId,
    joined_at: now,
    left_at: null,
    synced_at: null,
  };
}

/**
 * Add multiple students to a group at once
 */
export async function addMembersToGroup(
  sessionGroupId: string,
  studentIds: string[]
): Promise<GroupMemberRow[]> {
  const members: GroupMemberRow[] = [];
  const now = new Date().toISOString();

  for (const studentId of studentIds) {
    const id = Crypto.randomUUID();

    await executeSql(
      `INSERT INTO group_members (id, session_group_id, student_id, joined_at)
       VALUES (?, ?, ?, ?)`,
      [id, sessionGroupId, studentId, now]
    );

    members.push({
      id,
      session_group_id: sessionGroupId,
      student_id: studentId,
      joined_at: now,
      left_at: null,
      synced_at: null,
    });
  }

  if (__DEV__) {
    console.log('[groupMemberRepository] Added', members.length, 'members to group:', sessionGroupId);
  }

  return members;
}

/**
 * Get all active members of a group
 */
export async function getActiveMembers(sessionGroupId: string): Promise<GroupMemberRow[]> {
  return queryAll<GroupMemberRow>(
    `SELECT * FROM group_members
     WHERE session_group_id = ? AND left_at IS NULL
     ORDER BY joined_at ASC`,
    [sessionGroupId]
  );
}

/**
 * Get all members (including those who left) of a group
 */
export async function getAllMembers(sessionGroupId: string): Promise<GroupMemberRow[]> {
  return queryAll<GroupMemberRow>(
    `SELECT * FROM group_members
     WHERE session_group_id = ?
     ORDER BY joined_at ASC`,
    [sessionGroupId]
  );
}

/**
 * Get a member by ID
 */
export async function getMemberById(id: string): Promise<GroupMemberRow | null> {
  return queryFirst<GroupMemberRow>(
    `SELECT * FROM group_members WHERE id = ?`,
    [id]
  );
}

/**
 * Find which group a student is in for a session
 */
export async function getStudentGroup(
  sessionId: string,
  studentId: string
): Promise<{ groupId: string; groupNumber: number } | null> {
  const result = await queryFirst<{ group_id: string; group_number: number }>(
    `SELECT sg.id as group_id, sg.group_number
     FROM group_members gm
     JOIN session_groups sg ON gm.session_group_id = sg.id
     WHERE sg.session_id = ? AND gm.student_id = ? AND gm.left_at IS NULL`,
    [sessionId, studentId]
  );

  if (!result) return null;

  return {
    groupId: result.group_id,
    groupNumber: result.group_number,
  };
}

/**
 * Remove a student from their current group (marks as left)
 */
export async function removeMemberFromGroup(
  sessionGroupId: string,
  studentId: string
): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE group_members
     SET left_at = ?, synced_at = NULL
     WHERE session_group_id = ? AND student_id = ? AND left_at IS NULL`,
    [now, sessionGroupId, studentId]
  );

  if (__DEV__) {
    console.log('[groupMemberRepository] Removed member:', studentId, 'from group:', sessionGroupId);
  }
}

/**
 * Move a student to a different group
 */
export async function moveStudentToGroup(
  sessionId: string,
  studentId: string,
  newGroupId: string
): Promise<GroupMemberRow> {
  // First, find and remove from current group
  const currentGroup = await getStudentGroup(sessionId, studentId);
  if (currentGroup) {
    await removeMemberFromGroup(currentGroup.groupId, studentId);
  }

  // Add to new group
  return addMemberToGroup(newGroupId, studentId);
}

/**
 * Delete all members of a group (hard delete)
 */
export async function deleteGroupMembers(sessionGroupId: string): Promise<void> {
  await executeSql(
    `DELETE FROM group_members WHERE session_group_id = ?`,
    [sessionGroupId]
  );

  if (__DEV__) {
    console.log('[groupMemberRepository] Deleted all members from group:', sessionGroupId);
  }
}

/**
 * Get unsynced members
 */
export async function getUnsyncedMembers(): Promise<GroupMemberRow[]> {
  return queryAll<GroupMemberRow>(
    `SELECT * FROM group_members WHERE synced_at IS NULL`
  );
}

/**
 * Mark member as synced
 */
export async function markMemberSynced(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE group_members SET synced_at = ? WHERE id = ?`,
    [now, id]
  );
}

/**
 * Check if a student is already in a group for this session
 */
export async function isStudentInAnyGroup(
  sessionId: string,
  studentId: string
): Promise<boolean> {
  const group = await getStudentGroup(sessionId, studentId);
  return group !== null;
}
