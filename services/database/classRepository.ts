import { executeSql, queryAll, queryFirst } from './client';
import { Class } from '../../types';
import * as Crypto from 'expo-crypto';

/**
 * Database row type (snake_case from SQLite)
 */
interface ClassRow {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  is_deleted: number;
}

/**
 * Convert database row to Class type
 */
function rowToClass(row: ClassRow): Class {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

/**
 * Generate a UUID for new records
 */
async function generateId(): Promise<string> {
  return Crypto.randomUUID();
}

/**
 * Create a new class
 */
export async function createClass(
  userId: string,
  name: string
): Promise<Class> {
  const id = await generateId();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO classes (id, user_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, userId, name, now, now]
  );

  console.log('[ClassRepository] Created class:', { id, name });

  return {
    id,
    userId,
    name,
    createdAt: now,
  };
}

/**
 * Get all classes for a user (excluding deleted)
 */
export async function getClassesByUserId(userId: string): Promise<Class[]> {
  const rows = await queryAll<ClassRow>(
    `SELECT * FROM classes
     WHERE user_id = ? AND is_deleted = 0
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows.map(rowToClass);
}

/**
 * Get a single class by ID
 */
export async function getClassById(id: string): Promise<Class | null> {
  const row = await queryFirst<ClassRow>(
    `SELECT * FROM classes WHERE id = ? AND is_deleted = 0`,
    [id]
  );

  return row ? rowToClass(row) : null;
}

/**
 * Update a class name
 */
export async function updateClass(
  id: string,
  name: string
): Promise<Class | null> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE classes SET name = ?, updated_at = ?, synced_at = NULL
     WHERE id = ? AND is_deleted = 0`,
    [name, now, id]
  );

  return getClassById(id);
}

/**
 * Soft delete a class (mark as deleted)
 */
export async function deleteClass(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE classes SET is_deleted = 1, updated_at = ?, synced_at = NULL
     WHERE id = ?`,
    [now, id]
  );

  console.log('[ClassRepository] Deleted class:', id);
}

/**
 * Get count of classes for a user
 */
export async function getClassCount(userId: string): Promise<number> {
  const result = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM classes
     WHERE user_id = ? AND is_deleted = 0`,
    [userId]
  );

  return result?.count || 0;
}
