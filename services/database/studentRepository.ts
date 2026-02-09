import { executeSql, queryAll, queryFirst, executeTransaction } from './client';
import { Student } from '../../types';
import * as Crypto from 'expo-crypto';

/**
 * Database row type (snake_case from SQLite)
 */
interface StudentRow {
  id: string;
  user_id: string;
  pseudo: string;
  class_id: string;
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  is_deleted: number;
}

/**
 * Convert database row to Student type
 */
function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    pseudo: row.pseudo,
    classId: row.class_id,
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
 * Create a new student
 */
export async function createStudent(
  userId: string,
  pseudo: string,
  classId: string
): Promise<Student> {
  const id = await generateId();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO students (id, user_id, pseudo, class_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, pseudo, classId, now, now]
  );

  console.log('[StudentRepository] Created student:', { id, pseudo });

  return {
    id,
    pseudo,
    classId,
    createdAt: now,
  };
}

/**
 * Create multiple students in a transaction
 * Returns array of created student IDs
 */
export async function createStudentsBatch(
  userId: string,
  students: { pseudo: string; classId: string }[]
): Promise<string[]> {
  const now = new Date().toISOString();
  const ids: string[] = [];

  const statements = await Promise.all(
    students.map(async (student) => {
      const id = await generateId();
      ids.push(id);
      return {
        sql: `INSERT INTO students (id, user_id, pseudo, class_id, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [id, userId, student.pseudo, student.classId, now, now],
      };
    })
  );

  await executeTransaction(statements);

  console.log('[StudentRepository] Created batch:', ids.length, 'students');
  return ids;
}

/**
 * Get all students for a class (excluding deleted)
 */
export async function getStudentsByClassId(classId: string): Promise<Student[]> {
  const rows = await queryAll<StudentRow>(
    `SELECT * FROM students
     WHERE class_id = ? AND is_deleted = 0
     ORDER BY pseudo ASC`,
    [classId]
  );

  return rows.map(rowToStudent);
}

/**
 * Get a single student by ID
 */
export async function getStudentById(id: string): Promise<Student | null> {
  const row = await queryFirst<StudentRow>(
    `SELECT * FROM students WHERE id = ? AND is_deleted = 0`,
    [id]
  );

  return row ? rowToStudent(row) : null;
}

/**
 * Update a student's pseudo
 */
export async function updateStudent(
  id: string,
  pseudo: string
): Promise<Student | null> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE students SET pseudo = ?, updated_at = ?, synced_at = NULL
     WHERE id = ? AND is_deleted = 0`,
    [pseudo, now, id]
  );

  return getStudentById(id);
}

/**
 * Soft delete a student (mark as deleted)
 */
export async function deleteStudent(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE students SET is_deleted = 1, updated_at = ?, synced_at = NULL
     WHERE id = ?`,
    [now, id]
  );

  console.log('[StudentRepository] Deleted student:', id);
}

/**
 * Get count of students in a class
 */
export async function getStudentCount(classId: string): Promise<number> {
  const result = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM students
     WHERE class_id = ? AND is_deleted = 0`,
    [classId]
  );

  return result?.count || 0;
}
