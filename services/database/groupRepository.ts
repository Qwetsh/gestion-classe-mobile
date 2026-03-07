import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

export interface StudentGroup {
  id: string;
  class_id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  synced_at: string | null;
}

// Predefined colors for groups
export const GROUP_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
] as const;

/**
 * Create a new student group
 */
export async function createGroup(
  classId: string,
  userId: string,
  name: string,
  color: string = GROUP_COLORS[0]
): Promise<StudentGroup> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO student_groups (id, class_id, user_id, name, color, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, classId, userId, name.trim(), color, now]
  );

  if (__DEV__) {
    console.log('[groupRepository] Created group:', name);
  }

  return {
    id,
    class_id: classId,
    user_id: userId,
    name: name.trim(),
    color,
    created_at: now,
    synced_at: null,
  };
}

/**
 * Get all groups for a class
 */
export async function getGroupsByClassId(classId: string): Promise<StudentGroup[]> {
  return queryAll<StudentGroup>(
    `SELECT * FROM student_groups WHERE class_id = ? ORDER BY name`,
    [classId]
  );
}

/**
 * Get a group by ID
 */
export async function getGroupById(id: string): Promise<StudentGroup | null> {
  return queryFirst<StudentGroup>(
    `SELECT * FROM student_groups WHERE id = ?`,
    [id]
  );
}

/**
 * Update a group
 */
export async function updateGroup(
  id: string,
  name: string,
  color: string
): Promise<StudentGroup | null> {
  await executeSql(
    `UPDATE student_groups SET name = ?, color = ?, synced_at = NULL WHERE id = ?`,
    [name.trim(), color, id]
  );

  if (__DEV__) {
    console.log('[groupRepository] Updated group:', id);
  }

  return getGroupById(id);
}

/**
 * Delete a group (removes group_id from students first)
 */
export async function deleteGroup(id: string): Promise<void> {
  // Remove group_id from all students in this group
  await executeSql(
    `UPDATE students SET group_id = NULL, synced_at = NULL WHERE group_id = ?`,
    [id]
  );

  // Delete the group
  await executeSql(
    `DELETE FROM student_groups WHERE id = ?`,
    [id]
  );

  if (__DEV__) {
    console.log('[groupRepository] Deleted group:', id);
  }
}

/**
 * Assign a student to a group
 */
export async function assignStudentToGroup(
  studentId: string,
  groupId: string | null
): Promise<void> {
  await executeSql(
    `UPDATE students SET group_id = ?, synced_at = NULL WHERE id = ?`,
    [groupId, studentId]
  );

  if (__DEV__) {
    console.log('[groupRepository] Assigned student', studentId, 'to group', groupId);
  }
}

/**
 * Get students in a group
 */
export async function getStudentsByGroupId(groupId: string): Promise<{ id: string; pseudo: string }[]> {
  return queryAll<{ id: string; pseudo: string }>(
    `SELECT id, pseudo FROM students WHERE group_id = ? AND is_deleted = 0 ORDER BY pseudo`,
    [groupId]
  );
}

/**
 * Get unsynced groups
 */
export async function getUnsyncedGroups(): Promise<StudentGroup[]> {
  return queryAll<StudentGroup>(
    `SELECT * FROM student_groups WHERE synced_at IS NULL`
  );
}

/**
 * Delete all groups for a class
 */
export async function deleteGroupsByClassId(classId: string): Promise<void> {
  // Remove group_id from all students
  await executeSql(
    `UPDATE students SET group_id = NULL WHERE class_id = ?`,
    [classId]
  );

  // Delete all groups
  await executeSql(
    `DELETE FROM student_groups WHERE class_id = ?`,
    [classId]
  );

  if (__DEV__) {
    console.log('[groupRepository] Deleted all groups for class:', classId);
  }
}
