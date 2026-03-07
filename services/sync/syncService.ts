import { supabase, isSupabaseConfigured } from '../supabase';
import { queryAll, queryFirst, executeSql } from '../database/client';
import {
  type Session,
  type Event,
} from '../database';

export interface SyncResult {
  success: boolean;
  sessionsSync: number;
  eventsSync: number;
  classesSync: number;
  studentsSync: number;
  roomsSync: number;
  plansSync: number;
  groupsSync: number;
  errors: string[];
}

/**
 * Get count of unsynced records
 */
export async function getUnsyncedCount(): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const result = await queryFirst<{ total: number }>(`
    SELECT (
      (SELECT COUNT(*) FROM sessions WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM events WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM classes WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM students WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM rooms WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM class_room_plans WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM student_groups WHERE synced_at IS NULL)
    ) as total
  `);

  return result?.total || 0;
}

/**
 * Sync all unsynced data to Supabase
 */
export async function syncAll(userId: string): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    sessionsSync: 0,
    eventsSync: 0,
    classesSync: 0,
    studentsSync: 0,
    roomsSync: 0,
    plansSync: 0,
    groupsSync: 0,
    errors: [],
  };

  if (!isSupabaseConfigured || !supabase) {
    result.success = false;
    result.errors.push('Supabase non configure');
    return result;
  }

  try {
    // Sync in dependency order: classes -> groups -> students -> rooms -> plans -> sessions -> events

    // 1. Sync classes
    result.classesSync = await syncClasses(userId);

    // 2. Sync groups (depends on classes)
    result.groupsSync = await syncGroups(userId);

    // 3. Sync students (depends on classes and groups)
    result.studentsSync = await syncStudents();

    // 4. Sync rooms
    result.roomsSync = await syncRooms(userId);

    // 5. Sync class_room_plans
    result.plansSync = await syncPlans(userId);

    // 6. Sync sessions
    result.sessionsSync = await syncSessions();

    // 7. Sync events
    result.eventsSync = await syncEvents();

    if (__DEV__) {
      console.log('[syncService] Sync complete:', result);
    }
  } catch (error) {
    console.error('[syncService] Sync failed:', error);
    result.success = false;
    result.errors.push(error instanceof Error ? error.message : 'Erreur de synchronisation');
  }

  return result;
}

/**
 * Sync classes to Supabase
 */
async function syncClasses(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    name: string;
    created_at: string;
  }>(`SELECT id, name, created_at FROM classes WHERE user_id = ? AND synced_at IS NULL`, [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((c) => ({
    id: c.id,
    user_id: userId,
    name: c.name,
    created_at: c.created_at,
  }));

  const { error } = await supabase
    .from('classes')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Classes sync error:', error);
    throw new Error(`Classes: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE classes SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync student groups to Supabase
 */
async function syncGroups(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    class_id: string;
    name: string;
    color: string;
    created_at: string;
  }>(`SELECT id, class_id, name, color, created_at FROM student_groups WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((g) => ({
    id: g.id,
    user_id: userId,
    class_id: g.class_id,
    name: g.name,
    color: g.color,
    created_at: g.created_at,
  }));

  const { error } = await supabase
    .from('student_groups')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Groups sync error:', error);
    throw new Error(`Groups: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(g => g.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE student_groups SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync students to Supabase
 */
async function syncStudents(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    user_id: string;
    class_id: string;
    group_id: string | null;
    pseudo: string;
    created_at: string;
  }>(`SELECT id, user_id, class_id, group_id, pseudo, created_at FROM students WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    class_id: s.class_id,
    group_id: s.group_id,
    pseudo: s.pseudo,
    created_at: s.created_at,
  }));

  const { error } = await supabase
    .from('students')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Students sync error:', error);
    throw new Error(`Students: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE students SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync rooms to Supabase
 */
async function syncRooms(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    name: string;
    grid_rows: number;
    grid_cols: number;
    disabled_cells: string;
    created_at: string;
  }>(`SELECT id, name, grid_rows, grid_cols, disabled_cells, created_at FROM rooms WHERE user_id = ? AND synced_at IS NULL AND is_deleted = 0`, [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((r) => {
    let disabledCells: string[] = [];
    try {
      disabledCells = JSON.parse(r.disabled_cells || '[]');
    } catch {
      console.warn('[syncService] Invalid disabled_cells JSON for room:', r.id);
      disabledCells = [];
    }
    return {
      id: r.id,
      user_id: userId,
      name: r.name,
      grid_rows: r.grid_rows,
      grid_cols: r.grid_cols,
      disabled_cells: disabledCells,
      created_at: r.created_at,
    };
  });

  const { error } = await supabase
    .from('rooms')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Rooms sync error:', error);
    throw new Error(`Rooms: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE rooms SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync class_room_plans to Supabase
 * Optimized: batch verify classes/rooms existence instead of N+1 queries
 */
async function syncPlans(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    class_id: string;
    room_id: string;
    positions: string;
    created_at: string;
    updated_at: string | null;
  }>(`SELECT id, class_id, room_id, positions, created_at, updated_at FROM class_room_plans WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Batch: get all unique class_ids and room_ids
  const classIds = [...new Set(unsynced.map(p => p.class_id))];
  const roomIds = [...new Set(unsynced.map(p => p.room_id))];

  // Single query to verify all classes exist on server
  const { data: existingClasses } = await supabase
    .from('classes')
    .select('id')
    .in('id', classIds);
  const serverClassIds = new Set((existingClasses || []).map(c => c.id));

  // Single query to verify all rooms exist on server
  const { data: existingRooms } = await supabase
    .from('rooms')
    .select('id')
    .in('id', roomIds);
  const serverRoomIds = new Set((existingRooms || []).map(r => r.id));

  // Single query to get existing plans on server
  const { data: existingPlans } = await supabase
    .from('class_room_plans')
    .select('id, class_id, room_id')
    .in('class_id', classIds);

  // Build lookup map: "class_id:room_id" -> server plan id
  const serverPlanMap = new Map<string, string>();
  for (const plan of (existingPlans || [])) {
    serverPlanMap.set(`${plan.class_id}:${plan.room_id}`, plan.id);
  }

  let syncedCount = 0;
  const now = new Date().toISOString();
  const toInsert: Array<{
    id: string;
    class_id: string;
    room_id: string;
    user_id: string;
    positions: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
  }> = [];
  const toUpdate: Array<{
    localId: string;
    serverId: string;
    positions: Record<string, unknown>;
    updated_at: string;
  }> = [];
  const syncedIds: string[] = [];

  // Categorize plans for batch operations
  for (const p of unsynced) {
    // Skip if class or room not on server
    if (!serverClassIds.has(p.class_id) || !serverRoomIds.has(p.room_id)) {
      if (__DEV__) {
        console.log('[syncService] Skipping plan - class or room not on server yet:', p.class_id, p.room_id);
      }
      continue;
    }

    // Parse positions safely
    let positionsData: Record<string, unknown>;
    try {
      positionsData = JSON.parse(p.positions);
    } catch {
      positionsData = {};
    }

    const serverPlanId = serverPlanMap.get(`${p.class_id}:${p.room_id}`);

    if (serverPlanId) {
      // Plan exists on server - queue for update
      toUpdate.push({
        localId: p.id,
        serverId: serverPlanId,
        positions: positionsData,
        updated_at: p.updated_at || now,
      });
    } else {
      // New plan - queue for insert
      toInsert.push({
        id: p.id,
        class_id: p.class_id,
        room_id: p.room_id,
        user_id: userId,
        positions: positionsData,
        created_at: p.created_at,
        updated_at: p.updated_at,
      });
    }
  }

  // Batch insert new plans
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('class_room_plans')
      .insert(toInsert);

    if (insertError) {
      console.error('[syncService] Batch plan insert error:', insertError);
    } else {
      syncedIds.push(...toInsert.map(p => p.id));
      syncedCount += toInsert.length;
    }
  }

  // Update existing plans (one by one - Supabase doesn't support batch update with different values)
  for (const update of toUpdate) {
    const { error: updateError } = await supabase
      .from('class_room_plans')
      .update({
        positions: update.positions,
        updated_at: update.updated_at,
      })
      .eq('id', update.serverId);

    if (updateError) {
      console.error('[syncService] Plan update error:', updateError);
    } else {
      syncedIds.push(update.localId);
      syncedCount++;
    }
  }

  // Batch mark as synced
  if (syncedIds.length > 0) {
    const placeholders = syncedIds.map(() => '?').join(',');
    await executeSql(
      `UPDATE class_room_plans SET synced_at = ? WHERE id IN (${placeholders})`,
      [now, ...syncedIds]
    );
  }

  return syncedCount;
}

/**
 * Sync sessions to Supabase
 * First ensures all referenced classes and rooms are synced
 */
async function syncSessions(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<Session>(
    `SELECT * FROM sessions WHERE synced_at IS NULL`
  );

  if (unsynced.length === 0) return 0;

  // Verify all referenced rooms and classes are synced
  // Get unique room_ids and class_ids from unsynced sessions
  const roomIds = [...new Set(unsynced.map(s => s.room_id))];
  const classIds = [...new Set(unsynced.map(s => s.class_id))];

  // Check for unsynced rooms that are referenced by sessions
  for (const roomId of roomIds) {
    if (__DEV__) {
      console.log('[syncService] Checking room dependency:', roomId);
    }

    const room = await queryFirst<{ id: string; synced_at: string | null; user_id: string; name: string; grid_rows: number; grid_cols: number; disabled_cells: string; created_at: string }>(
      `SELECT id, synced_at, user_id, name, grid_rows, grid_cols, disabled_cells, created_at FROM rooms WHERE id = ?`,
      [roomId]
    );

    if (!room) {
      console.error('[syncService] CRITICAL: Room not found locally for session:', roomId);
      throw new Error(`Room ${roomId} not found locally but referenced by session`);
    }

    // Always force sync the room to Supabase (even if synced_at is set, it might not exist on server)
    if (__DEV__) {
      console.log('[syncService] Force syncing room to ensure it exists on server:', room.name);
    }

    let roomDisabledCells: string[] = [];
    try {
      roomDisabledCells = JSON.parse(room.disabled_cells || '[]');
    } catch {
      console.warn('[syncService] Invalid disabled_cells JSON for room:', room.id);
      roomDisabledCells = [];
    }

    const { error: roomError, data: roomData } = await supabase
      .from('rooms')
      .upsert({
        id: room.id,
        user_id: room.user_id,
        name: room.name,
        grid_rows: room.grid_rows,
        grid_cols: room.grid_cols,
        disabled_cells: roomDisabledCells,
        created_at: room.created_at,
      }, { onConflict: 'id' })
      .select();

    if (roomError) {
      console.error('[syncService] Failed to sync required room:', roomError);
      throw new Error(`Room sync required for session failed: ${roomError.message}`);
    }

    if (__DEV__) {
      console.log('[syncService] Room upsert result:', roomData);
    }

    // Verify the room actually exists on server
    const { data: verifyRoom, error: verifyError } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', room.id)
      .single();

    if (verifyError || !verifyRoom) {
      console.error('[syncService] Room verification failed - room not found on server after upsert:', verifyError);
      throw new Error(`Room ${room.id} could not be verified on server. RLS policy may be blocking.`);
    }

    // Mark room as synced
    await executeSql(`UPDATE rooms SET synced_at = ? WHERE id = ?`, [new Date().toISOString(), roomId]);
    if (__DEV__) {
      console.log('[syncService] Room synced and verified:', room.name);
    }
  }

  // Check for unsynced classes that are referenced by sessions
  for (const classId of classIds) {
    if (__DEV__) {
      console.log('[syncService] Checking class dependency:', classId);
    }

    const cls = await queryFirst<{ id: string; synced_at: string | null; user_id: string; name: string; created_at: string }>(
      `SELECT id, synced_at, user_id, name, created_at FROM classes WHERE id = ?`,
      [classId]
    );

    if (!cls) {
      console.error('[syncService] CRITICAL: Class not found locally for session:', classId);
      throw new Error(`Class ${classId} not found locally but referenced by session`);
    }

    // Always force sync the class to Supabase
    if (__DEV__) {
      console.log('[syncService] Force syncing class to ensure it exists on server:', cls.name);
    }
    const { error: classError } = await supabase
      .from('classes')
      .upsert({
        id: cls.id,
        user_id: cls.user_id,
        name: cls.name,
        created_at: cls.created_at,
      }, { onConflict: 'id' });

    if (classError) {
      console.error('[syncService] Failed to sync required class:', classError);
      throw new Error(`Class sync required for session failed: ${classError.message}`);
    }

    // Mark class as synced
    await executeSql(`UPDATE classes SET synced_at = ? WHERE id = ?`, [new Date().toISOString(), classId]);
    if (__DEV__) {
      console.log('[syncService] Class synced successfully:', cls.name);
    }
  }

  // Now sync sessions (including topic and notes fields)
  const toSync = unsynced.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    class_id: s.class_id,
    room_id: s.room_id,
    topic: s.topic,
    notes: s.notes,
    started_at: s.started_at,
    ended_at: s.ended_at,
  }));

  const { error } = await supabase
    .from('sessions')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Sessions sync error:', error);
    throw new Error(`Sessions: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE sessions SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync events to Supabase
 */
async function syncEvents(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<Event>(
    `SELECT * FROM events WHERE synced_at IS NULL`
  );

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((e) => ({
    id: e.id,
    session_id: e.session_id,
    student_id: e.student_id,
    type: e.type,
    subtype: e.subtype,
    note: e.note,
    photo_path: e.photo_path,
    timestamp: e.timestamp,
  }));

  const { error } = await supabase
    .from('events')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Events sync error:', error);
    throw new Error(`Events: ${error.message}`);
  }

  // Mark as synced (batch update)
  const now = new Date().toISOString();
  const ids = unsynced.map(e => e.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE events SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Pull data from Supabase to local SQLite
 * This is the reverse sync: server -> mobile
 * Returns counts of synced items and any errors encountered
 */
export async function pullFromServer(userId: string): Promise<{
  classes: number;
  students: number;
  groups: number;
  rooms: number;
  plans: number;
  sessions: number;
  events: number;
  errors: string[];
}> {
  const result = { classes: 0, students: 0, groups: 0, rooms: 0, plans: 0, sessions: 0, events: 0, errors: [] as string[] };

  if (!isSupabaseConfigured || !supabase) {
    if (__DEV__) {
      console.log('[syncService] Supabase not configured, skipping pull');
    }
    return result;
  }

  const now = new Date().toISOString();

  try {
    // 1. Pull classes from Supabase
    const { data: serverClasses, error: classesError } = await supabase
      .from('classes')
      .select('id, name, created_at, updated_at')
      .eq('user_id', userId);

    if (classesError) {
      console.error('[syncService] Pull classes error:', classesError);
      result.errors.push(`Classes: ${classesError.message}`);
      // IMPORTANT: Do NOT delete local data if server request failed
    } else if (serverClasses !== null) {
      // Only proceed with deletions if we got a valid response from server
      const serverClassIds = new Set(serverClasses.map(c => c.id));

      // Delete local classes that don't exist on server anymore
      // SAFETY: Only delete if server returned data (not null/undefined)
      // This prevents data loss on network errors or partial responses
      const localClasses = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM classes WHERE user_id = ?`,
        [userId]
      );
      for (const local of localClasses) {
        // Only delete if:
        // 1. Not on server anymore
        // 2. AND was previously synced (synced_at is set)
        // This protects locally-created data that hasn't been pushed yet
        if (!serverClassIds.has(local.id) && local.synced_at !== null) {
          // Class was deleted on server, remove locally
          await executeSql(`DELETE FROM students WHERE class_id = ?`, [local.id]);
          await executeSql(`DELETE FROM class_room_plans WHERE class_id = ?`, [local.id]);
          await executeSql(`DELETE FROM classes WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local class not on server:', local.id);
          }
        }
      }

      // Add new classes from server
      for (const cls of serverClasses) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM classes WHERE id = ?`,
          [cls.id]
        );

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO classes (id, user_id, name, created_at, synced_at) VALUES (?, ?, ?, ?, ?)`,
            [cls.id, userId, cls.name, cls.created_at, now]
          );
          result.classes++;
          if (__DEV__) {
            console.log('[syncService] Pulled class:', cls.name);
          }
        }
      }
    }

    // 2. Pull groups from Supabase (before students since students reference groups)
    // Get all class IDs for this user first
    const userClasses = await queryAll<{ id: string }>(
      `SELECT id FROM classes WHERE user_id = ?`,
      [userId]
    );
    const userClassIds = userClasses.map(c => c.id);

    if (userClassIds.length > 0) {
      const { data: serverGroups, error: groupsError } = await supabase
        .from('student_groups')
        .select('id, class_id, name, color, created_at')
        .in('class_id', userClassIds);

      if (groupsError) {
        console.error('[syncService] Pull groups error:', groupsError);
        result.errors.push(`Groups: ${groupsError.message}`);
      } else if (serverGroups !== null) {
        const serverGroupIds = new Set(serverGroups.map(g => g.id));

        // Delete local groups that don't exist on server anymore
        const localGroups = await queryAll<{ id: string; synced_at: string | null }>(
          `SELECT id, synced_at FROM student_groups WHERE class_id IN (${userClassIds.map(() => '?').join(',')})`,
          userClassIds
        );
        for (const local of localGroups) {
          if (!serverGroupIds.has(local.id) && local.synced_at !== null) {
            // Clear group_id from students before deleting the group
            await executeSql(`UPDATE students SET group_id = NULL WHERE group_id = ?`, [local.id]);
            await executeSql(`DELETE FROM student_groups WHERE id = ?`, [local.id]);
            if (__DEV__) {
              console.log('[syncService] Deleted local group not on server:', local.id);
            }
          }
        }

        // Add new groups from server
        for (const group of serverGroups) {
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM student_groups WHERE id = ?`,
            [group.id]
          );

          if (existing.length === 0) {
            await executeSql(
              `INSERT INTO student_groups (id, class_id, user_id, name, color, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [group.id, group.class_id, userId, group.name, group.color, group.created_at, now]
            );
            result.groups++;
            if (__DEV__) {
              console.log('[syncService] Pulled group:', group.name);
            }
          }
        }
      }
    }

    // 3. Pull students from Supabase
    const { data: serverStudents, error: studentsError } = await supabase
      .from('students')
      .select('id, user_id, class_id, group_id, pseudo, created_at')
      .eq('user_id', userId);

    if (studentsError) {
      console.error('[syncService] Pull students error:', studentsError);
      result.errors.push(`Students: ${studentsError.message}`);
      // IMPORTANT: Do NOT delete local data if server request failed
    } else if (serverStudents !== null) {
      // Only proceed with deletions if we got a valid response from server
      const serverStudentIds = new Set(serverStudents.map(s => s.id));

      // Delete local students that don't exist on server anymore
      // SAFETY: Only delete previously synced students
      const localStudents = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM students WHERE user_id = ?`,
        [userId]
      );
      for (const local of localStudents) {
        // Only delete if was previously synced (protects unsynced local data)
        if (!serverStudentIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM students WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local student not on server:', local.id);
          }
        }
      }

      // Add new students from server
      for (const student of serverStudents) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM students WHERE id = ?`,
          [student.id]
        );

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO students (id, user_id, class_id, group_id, pseudo, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [student.id, student.user_id, student.class_id, student.group_id, student.pseudo, student.created_at, now]
          );
          result.students++;
          if (__DEV__) {
            console.log('[syncService] Pulled student:', student.pseudo);
          }
        } else {
          // Update existing student's group_id
          await executeSql(
            `UPDATE students SET group_id = ?, synced_at = ? WHERE id = ?`,
            [student.group_id, now, student.id]
          );
        }
      }
    }

    // 4. Pull rooms from Supabase
    const { data: serverRooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, name, grid_rows, grid_cols, disabled_cells, created_at')
      .eq('user_id', userId);

    if (roomsError) {
      console.error('[syncService] Pull rooms error:', roomsError);
      result.errors.push(`Rooms: ${roomsError.message}`);
      // IMPORTANT: Do NOT delete local data if server request failed
    } else if (serverRooms !== null) {
      // Only proceed with deletions if we got a valid response from server
      const serverRoomIds = new Set(serverRooms.map(r => r.id));

      // Delete local rooms that don't exist on server anymore
      // SAFETY: Only delete previously synced rooms
      const localRooms = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM rooms WHERE user_id = ? AND is_deleted = 0`,
        [userId]
      );
      for (const local of localRooms) {
        // Only delete if was previously synced (protects unsynced local data)
        if (!serverRoomIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM class_room_plans WHERE room_id = ?`, [local.id]);
          await executeSql(`DELETE FROM rooms WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local room not on server:', local.id);
          }
        }
      }

      // Add/update rooms from server
      for (const room of serverRooms) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM rooms WHERE id = ?`,
          [room.id]
        );

        const disabledCellsJson = JSON.stringify(room.disabled_cells || []);

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO rooms (id, user_id, name, grid_rows, grid_cols, disabled_cells, created_at, synced_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [room.id, userId, room.name, room.grid_rows, room.grid_cols, disabledCellsJson, room.created_at, now]
          );
          result.rooms++;
          if (__DEV__) {
            console.log('[syncService] Pulled room:', room.name);
          }
        } else {
          await executeSql(
            `UPDATE rooms SET name = ?, grid_rows = ?, grid_cols = ?, disabled_cells = ?, synced_at = ? WHERE id = ?`,
            [room.name, room.grid_rows, room.grid_cols, disabledCellsJson, now, room.id]
          );
          if (__DEV__) {
            console.log('[syncService] Updated room from server:', room.name);
          }
        }
      }
    }

    // 5. Pull class_room_plans from Supabase
    // Get all class IDs for this user
    const localClasses = await queryAll<{ id: string }>(
      `SELECT id FROM classes WHERE user_id = ?`,
      [userId]
    );
    const classIds = localClasses.map(c => c.id);

    if (classIds.length > 0) {
      const { data: serverPlans, error: plansError } = await supabase
        .from('class_room_plans')
        .select('id, class_id, room_id, positions, created_at, updated_at')
        .in('class_id', classIds);

      if (plansError) {
        console.error('[syncService] Pull plans error:', plansError);
        result.errors.push(`Plans: ${plansError.message}`);
      } else if (serverPlans && serverPlans.length > 0) {
        for (const plan of serverPlans) {
          // Check if exists locally
          const existing = await queryAll<{ id: string; updated_at: string | null }>(
            `SELECT id, updated_at FROM class_room_plans WHERE class_id = ? AND room_id = ?`,
            [plan.class_id, plan.room_id]
          );

          // Convert positions to JSON string if it's an object
          const positionsJson = typeof plan.positions === 'string'
            ? plan.positions
            : JSON.stringify(plan.positions || {});

          if (existing.length === 0) {
            // Insert new plan
            await executeSql(
              `INSERT INTO class_room_plans (id, class_id, room_id, positions, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [plan.id, plan.class_id, plan.room_id, positionsJson, plan.created_at, plan.updated_at, now]
            );
            result.plans++;
            if (__DEV__) {
              console.log('[syncService] Pulled plan for class:', plan.class_id, 'room:', plan.room_id);
            }
          } else {
            // Update existing plan - server wins for positions
            await executeSql(
              `UPDATE class_room_plans SET positions = ?, updated_at = ?, synced_at = ? WHERE class_id = ? AND room_id = ?`,
              [positionsJson, plan.updated_at || now, now, plan.class_id, plan.room_id]
            );
            if (__DEV__) {
              console.log('[syncService] Updated plan for class:', plan.class_id, 'room:', plan.room_id);
            }
          }
        }
      }
    }

    // 6. Pull sessions from Supabase
    const { data: serverSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, user_id, class_id, room_id, topic, notes, started_at, ended_at')
      .eq('user_id', userId);

    if (sessionsError) {
      console.error('[syncService] Pull sessions error:', sessionsError);
      result.errors.push(`Sessions: ${sessionsError.message}`);
    } else if (serverSessions && serverSessions.length > 0) {
      for (const session of serverSessions) {
        // Check if exists locally
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM sessions WHERE id = ?`,
          [session.id]
        );

        if (existing.length === 0) {
          // IMPORTANT: If session has no ended_at on server, don't import it as "active"
          // This prevents zombie sessions from being recreated after sync
          // Instead, auto-end the session with the current timestamp
          const effectiveEndedAt = session.ended_at || now;

          if (!session.ended_at) {
            if (__DEV__) {
              console.log('[syncService] Auto-ending imported session (was active on server):', session.id);
            }
          }

          // Insert new session (with auto-ended_at if it was active)
          await executeSql(
            `INSERT INTO sessions (id, user_id, class_id, room_id, topic, notes, started_at, ended_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [session.id, session.user_id, session.class_id, session.room_id, session.topic || null, session.notes || null, session.started_at, effectiveEndedAt, now]
          );
          result.sessions++;
          if (__DEV__) {
            console.log('[syncService] Pulled session:', session.id);
          }
        }
      }
    }

    // 7. Pull events from Supabase (for all user's sessions)
    // Get all session IDs for this user
    const localSessions = await queryAll<{ id: string }>(
      `SELECT id FROM sessions WHERE user_id = ?`,
      [userId]
    );
    const sessionIds = localSessions.map(s => s.id);

    if (sessionIds.length > 0) {
      const { data: serverEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, session_id, student_id, type, subtype, note, photo_path, timestamp')
        .in('session_id', sessionIds);

      if (eventsError) {
        console.error('[syncService] Pull events error:', eventsError);
        result.errors.push(`Events: ${eventsError.message}`);
      } else if (serverEvents && serverEvents.length > 0) {
        for (const event of serverEvents) {
          // Check if exists locally
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM events WHERE id = ?`,
            [event.id]
          );

          if (existing.length === 0) {
            // Insert new event
            await executeSql(
              `INSERT INTO events (id, session_id, student_id, type, subtype, note, photo_path, timestamp, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [event.id, event.session_id, event.student_id, event.type, event.subtype, event.note, event.photo_path, event.timestamp, now]
            );
            result.events++;
          }
        }
        if (__DEV__) {
          console.log('[syncService] Pulled events:', result.events);
        }
      }
    }

    if (__DEV__) {
      console.log('[syncService] Pull complete:', result);
    }
  } catch (error) {
    console.error('[syncService] Pull failed:', error);
    result.errors.push(error instanceof Error ? error.message : 'Pull failed with unknown error');
  }

  return result;
}
