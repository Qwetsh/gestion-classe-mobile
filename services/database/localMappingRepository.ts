import { executeSql, queryAll, queryFirst, executeTransaction } from './client';
import * as Crypto from 'expo-crypto';

/**
 * LOCAL ONLY Repository for student name mappings
 * This data is NEVER synchronized to the server (RGPD compliance)
 */

/**
 * Student mapping entry
 */
export interface LocalStudentMapping {
  id: string;
  studentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  createdAt: string;
}

/**
 * Database row type (snake_case from SQLite)
 */
interface MappingRow {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  created_at: string;
}

/**
 * Convert database row to LocalStudentMapping type
 */
function rowToMapping(row: MappingRow): LocalStudentMapping {
  return {
    id: row.id,
    studentId: row.student_id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
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
 * Create a new local mapping entry
 */
export async function createLocalMapping(
  studentId: string,
  firstName: string,
  lastName: string,
  fullName: string
): Promise<LocalStudentMapping> {
  const id = await generateId();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO local_student_mapping (id, student_id, first_name, last_name, full_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, studentId, firstName, lastName, fullName, now]
  );

  console.log('[LocalMappingRepository] Created mapping for student:', studentId);

  return {
    id,
    studentId,
    firstName,
    lastName,
    fullName,
    createdAt: now,
  };
}

/**
 * Create multiple mappings in a transaction
 */
export async function createLocalMappingsBatch(
  mappings: { studentId: string; firstName: string; lastName: string; fullName: string }[]
): Promise<string[]> {
  const now = new Date().toISOString();
  const ids: string[] = [];

  const statements = await Promise.all(
    mappings.map(async (mapping) => {
      const id = await generateId();
      ids.push(id);
      return {
        sql: `INSERT INTO local_student_mapping (id, student_id, first_name, last_name, full_name, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [id, mapping.studentId, mapping.firstName, mapping.lastName, mapping.fullName, now],
      };
    })
  );

  await executeTransaction(statements);

  console.log('[LocalMappingRepository] Created batch:', ids.length, 'mappings');
  return ids;
}

/**
 * Get mapping for a student
 */
export async function getLocalMappingByStudentId(studentId: string): Promise<LocalStudentMapping | null> {
  const row = await queryFirst<MappingRow>(
    `SELECT * FROM local_student_mapping WHERE student_id = ?`,
    [studentId]
  );

  return row ? rowToMapping(row) : null;
}

/**
 * Get all mappings for students in a class
 */
export async function getLocalMappingsByClassId(classId: string): Promise<LocalStudentMapping[]> {
  const rows = await queryAll<MappingRow>(
    `SELECT lsm.* FROM local_student_mapping lsm
     JOIN students s ON lsm.student_id = s.id
     WHERE s.class_id = ? AND s.is_deleted = 0
     ORDER BY lsm.full_name ASC`,
    [classId]
  );

  return rows.map(rowToMapping);
}

/**
 * Delete mapping for a student
 */
export async function deleteLocalMapping(studentId: string): Promise<void> {
  await executeSql(
    `DELETE FROM local_student_mapping WHERE student_id = ?`,
    [studentId]
  );

  console.log('[LocalMappingRepository] Deleted mapping for student:', studentId);
}

/**
 * Delete all mappings for students in a class
 * (Used when deleting a class)
 */
export async function deleteLocalMappingsByClassId(classId: string): Promise<void> {
  await executeSql(
    `DELETE FROM local_student_mapping
     WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)`,
    [classId]
  );

  console.log('[LocalMappingRepository] Deleted all mappings for class:', classId);
}
