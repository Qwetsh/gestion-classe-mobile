import { executeSql, queryFirst, queryAll, executeTransaction } from './client';
import { supabase, isSupabaseConfigured } from '../supabase';

/**
 * RGPD-compliant deletion service
 * Handles cascade deletion of data locally and on Supabase
 */

export interface DeleteStudentResult {
  success: boolean;
  eventsDeleted: number;
  error?: string;
}

export interface DeleteClassResult {
  success: boolean;
  studentsDeleted: number;
  sessionsDeleted: number;
  eventsDeleted: number;
  error?: string;
}

export interface DeleteAllDataResult {
  success: boolean;
  classesDeleted: number;
  studentsDeleted: number;
  sessionsDeleted: number;
  eventsDeleted: number;
  roomsDeleted: number;
  plansDeleted: number;
  error?: string;
}

/**
 * Get stats before deleting a student
 */
export async function getStudentDeleteStats(studentId: string): Promise<{ eventsCount: number }> {
  const result = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM events WHERE student_id = ?`,
    [studentId]
  );
  return { eventsCount: result?.count || 0 };
}

/**
 * Delete a student and all their data (RGPD)
 * - Deletes events
 * - Deletes local mapping
 * - Deletes student (hard delete)
 * - Syncs deletion to Supabase if online
 */
export async function deleteStudentCompletely(studentId: string): Promise<DeleteStudentResult> {
  try {
    // Get event count before deletion
    const stats = await getStudentDeleteStats(studentId);

    // Execute local deletions in transaction
    await executeTransaction([
      {
        sql: `DELETE FROM events WHERE student_id = ?`,
        params: [studentId],
      },
      {
        sql: `DELETE FROM session_group_members WHERE student_id = ?`,
        params: [studentId],
      },
      {
        sql: `DELETE FROM local_student_mapping WHERE student_id = ?`,
        params: [studentId],
      },
      {
        sql: `DELETE FROM students WHERE id = ?`,
        params: [studentId],
      },
    ]);

    console.log('[deleteService] Deleted student locally:', studentId);

    // Delete from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        // Delete events first
        await supabase.from('events').delete().eq('student_id', studentId);
        // Delete student
        await supabase.from('students').delete().eq('id', studentId);
        console.log('[deleteService] Deleted student from Supabase:', studentId);
      } catch (error) {
        console.error('[deleteService] Supabase deletion failed:', error);
        // Local deletion succeeded, Supabase can be retried later
      }
    }

    return {
      success: true,
      eventsDeleted: stats.eventsCount,
    };
  } catch (error) {
    console.error('[deleteService] Failed to delete student:', error);
    return {
      success: false,
      eventsDeleted: 0,
      error: error instanceof Error ? error.message : 'Erreur de suppression',
    };
  }
}

/**
 * Get stats before deleting a class
 */
export async function getClassDeleteStats(classId: string): Promise<{
  studentsCount: number;
  sessionsCount: number;
  eventsCount: number;
}> {
  const studentsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM students WHERE class_id = ?`,
    [classId]
  );

  const sessionsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE class_id = ?`,
    [classId]
  );

  // Events from sessions of this class
  const eventsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM events WHERE session_id IN (SELECT id FROM sessions WHERE class_id = ?)`,
    [classId]
  );

  return {
    studentsCount: studentsResult?.count || 0,
    sessionsCount: sessionsResult?.count || 0,
    eventsCount: eventsResult?.count || 0,
  };
}

/**
 * Delete a class and all related data (RGPD)
 * Cascade: events -> sessions -> plans -> mappings -> students -> class
 */
export async function deleteClassCompletely(classId: string): Promise<DeleteClassResult> {
  try {
    // Get stats before deletion
    const stats = await getClassDeleteStats(classId);

    // Get student IDs for this class (for event deletion)
    const students = await queryAll<{ id: string }>(
      `SELECT id FROM students WHERE class_id = ?`,
      [classId]
    );
    const studentIds = students.map(s => s.id);

    // Build transaction statements
    const statements: { sql: string; params: (string | number | null)[] }[] = [];

    // 1. Delete events for all sessions of this class
    statements.push({
      sql: `DELETE FROM events WHERE session_id IN (SELECT id FROM sessions WHERE class_id = ?)`,
      params: [classId],
    });

    // 2. Delete events for all students of this class (in case they have events in other sessions)
    if (studentIds.length > 0) {
      const placeholders = studentIds.map(() => '?').join(',');
      statements.push({
        sql: `DELETE FROM events WHERE student_id IN (${placeholders})`,
        params: studentIds,
      });
    }

    // 3. Delete sessions
    statements.push({
      sql: `DELETE FROM sessions WHERE class_id = ?`,
      params: [classId],
    });

    // 4. Delete class room plans
    statements.push({
      sql: `DELETE FROM class_room_plans WHERE class_id = ?`,
      params: [classId],
    });

    // 5. Delete local mappings
    statements.push({
      sql: `DELETE FROM local_student_mapping WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)`,
      params: [classId],
    });

    // 6. Delete students
    statements.push({
      sql: `DELETE FROM students WHERE class_id = ?`,
      params: [classId],
    });

    // 7. Delete class
    statements.push({
      sql: `DELETE FROM classes WHERE id = ?`,
      params: [classId],
    });

    // Execute transaction
    await executeTransaction(statements);
    console.log('[deleteService] Deleted class locally:', classId);

    // Delete from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        // Delete in dependency order
        if (studentIds.length > 0) {
          await supabase.from('events').delete().in('student_id', studentIds);
        }
        await supabase.from('events').delete().in('session_id',
          (await supabase.from('sessions').select('id').eq('class_id', classId)).data?.map(s => s.id) || []
        );
        await supabase.from('sessions').delete().eq('class_id', classId);
        await supabase.from('class_room_plans').delete().eq('class_id', classId);
        await supabase.from('students').delete().eq('class_id', classId);
        await supabase.from('classes').delete().eq('id', classId);
        console.log('[deleteService] Deleted class from Supabase:', classId);
      } catch (error) {
        console.error('[deleteService] Supabase deletion failed:', error);
      }
    }

    return {
      success: true,
      studentsDeleted: stats.studentsCount,
      sessionsDeleted: stats.sessionsCount,
      eventsDeleted: stats.eventsCount,
    };
  } catch (error) {
    console.error('[deleteService] Failed to delete class:', error);
    return {
      success: false,
      studentsDeleted: 0,
      sessionsDeleted: 0,
      eventsDeleted: 0,
      error: error instanceof Error ? error.message : 'Erreur de suppression',
    };
  }
}

/**
 * Get stats before deleting all user data
 */
export async function getAllDataDeleteStats(userId: string): Promise<{
  classesCount: number;
  studentsCount: number;
  sessionsCount: number;
  eventsCount: number;
  roomsCount: number;
  plansCount: number;
}> {
  const classesResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM classes WHERE user_id = ?`,
    [userId]
  );

  const studentsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM students WHERE user_id = ?`,
    [userId]
  );

  const sessionsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE user_id = ?`,
    [userId]
  );

  const eventsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM events WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`,
    [userId]
  );

  const roomsResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM rooms WHERE user_id = ?`,
    [userId]
  );

  const plansResult = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM class_room_plans WHERE class_id IN (SELECT id FROM classes WHERE user_id = ?)`,
    [userId]
  );

  return {
    classesCount: classesResult?.count || 0,
    studentsCount: studentsResult?.count || 0,
    sessionsCount: sessionsResult?.count || 0,
    eventsCount: eventsResult?.count || 0,
    roomsCount: roomsResult?.count || 0,
    plansCount: plansResult?.count || 0,
  };
}

/**
 * Delete all data for a user (RGPD - complete data wipe)
 */
export async function deleteAllUserData(userId: string): Promise<DeleteAllDataResult> {
  try {
    // Get stats before deletion
    const stats = await getAllDataDeleteStats(userId);

    // Build transaction statements
    const statements: { sql: string; params: (string | number | null)[] }[] = [
      // 1. Delete all events
      {
        sql: `DELETE FROM events WHERE session_id IN (SELECT id FROM sessions WHERE user_id = ?)`,
        params: [userId],
      },
      // 2. Delete all sessions
      {
        sql: `DELETE FROM sessions WHERE user_id = ?`,
        params: [userId],
      },
      // 3. Delete all plans
      {
        sql: `DELETE FROM class_room_plans WHERE class_id IN (SELECT id FROM classes WHERE user_id = ?)`,
        params: [userId],
      },
      // 4. Delete all local mappings
      {
        sql: `DELETE FROM local_student_mapping WHERE student_id IN (SELECT id FROM students WHERE user_id = ?)`,
        params: [userId],
      },
      // 5. Delete all students
      {
        sql: `DELETE FROM students WHERE user_id = ?`,
        params: [userId],
      },
      // 6. Delete all classes
      {
        sql: `DELETE FROM classes WHERE user_id = ?`,
        params: [userId],
      },
      // 7. Delete all rooms
      {
        sql: `DELETE FROM rooms WHERE user_id = ?`,
        params: [userId],
      },
    ];

    // Execute transaction
    await executeTransaction(statements);
    console.log('[deleteService] Deleted all data for user locally:', userId);

    // Delete from Supabase if configured
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: sessions } = await supabase.from('sessions').select('id').eq('user_id', userId);
        if (sessions && sessions.length > 0) {
          await supabase.from('events').delete().in('session_id', sessions.map(s => s.id));
        }
        await supabase.from('sessions').delete().eq('user_id', userId);
        await supabase.from('class_room_plans').delete().in('class_id',
          (await supabase.from('classes').select('id').eq('user_id', userId)).data?.map(c => c.id) || []
        );
        await supabase.from('students').delete().eq('user_id', userId);
        await supabase.from('classes').delete().eq('user_id', userId);
        await supabase.from('rooms').delete().eq('user_id', userId);
        console.log('[deleteService] Deleted all data from Supabase for user:', userId);
      } catch (error) {
        console.error('[deleteService] Supabase deletion failed:', error);
      }
    }

    return {
      success: true,
      classesDeleted: stats.classesCount,
      studentsDeleted: stats.studentsCount,
      sessionsDeleted: stats.sessionsCount,
      eventsDeleted: stats.eventsCount,
      roomsDeleted: stats.roomsCount,
      plansDeleted: stats.plansCount,
    };
  } catch (error) {
    console.error('[deleteService] Failed to delete all data:', error);
    return {
      success: false,
      classesDeleted: 0,
      studentsDeleted: 0,
      sessionsDeleted: 0,
      eventsDeleted: 0,
      roomsDeleted: 0,
      plansDeleted: 0,
      error: error instanceof Error ? error.message : 'Erreur de suppression',
    };
  }
}
