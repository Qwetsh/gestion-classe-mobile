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
  groupTemplatesSync: number;
  sessionGroupsSync: number;
  groupMembersSync: number;
  groupEventsSync: number;
  errors: string[];
}

/**
 * Get count of unsynced records
 */
export async function getUnsyncedCount(): Promise<number> {
  if (!isSupabaseConfigured) return 0;

  const tables = [
    'sessions',
    'events',
    'classes',
    'students',
    'rooms',
    'class_room_plans',
    'group_templates',
    'session_groups',
    'group_members',
    'group_events',
  ];
  let total = 0;

  for (const table of tables) {
    try {
      const result = await queryAll<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${table} WHERE synced_at IS NULL`
      );
      total += result[0]?.count || 0;
    } catch {
      // Table might not exist yet, skip
    }
  }

  return total;
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
    groupTemplatesSync: 0,
    sessionGroupsSync: 0,
    groupMembersSync: 0,
    groupEventsSync: 0,
    errors: [],
  };

  if (!isSupabaseConfigured || !supabase) {
    result.success = false;
    result.errors.push('Supabase non configure');
    return result;
  }

  try {
    // Sync in dependency order: classes -> students -> rooms -> plans -> sessions -> events -> groups

    // 1. Sync classes
    result.classesSync = await syncClasses(userId);

    // 2. Sync students
    result.studentsSync = await syncStudents();

    // 3. Sync rooms
    result.roomsSync = await syncRooms(userId);

    // 4. Sync class_room_plans
    result.plansSync = await syncPlans(userId);

    // 5. Sync sessions
    result.sessionsSync = await syncSessions();

    // 6. Sync events
    result.eventsSync = await syncEvents();

    // 7. Sync group templates
    result.groupTemplatesSync = await syncGroupTemplates(userId);

    // 8. Sync session groups (depends on sessions)
    result.sessionGroupsSync = await syncSessionGroups();

    // 9. Sync group members (depends on session groups and students)
    result.groupMembersSync = await syncGroupMembers();

    // 10. Sync group events (depends on session groups)
    result.groupEventsSync = await syncGroupEvents();

    console.log('[syncService] Sync complete:', result);
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

  // Mark as synced
  const now = new Date().toISOString();
  for (const c of unsynced) {
    await executeSql(`UPDATE classes SET synced_at = ? WHERE id = ?`, [now, c.id]);
  }

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
    pseudo: string;
    created_at: string;
  }>(`SELECT id, user_id, class_id, pseudo, created_at FROM students WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    class_id: s.class_id,
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

  // Mark as synced
  const now = new Date().toISOString();
  for (const s of unsynced) {
    await executeSql(`UPDATE students SET synced_at = ? WHERE id = ?`, [now, s.id]);
  }

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

  const toSync = unsynced.map((r) => ({
    id: r.id,
    user_id: userId,
    name: r.name,
    grid_rows: r.grid_rows,
    grid_cols: r.grid_cols,
    disabled_cells: JSON.parse(r.disabled_cells || '[]'),
    created_at: r.created_at,
  }));

  const { error } = await supabase
    .from('rooms')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Rooms sync error:', error);
    throw new Error(`Rooms: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  for (const r of unsynced) {
    await executeSql(`UPDATE rooms SET synced_at = ? WHERE id = ?`, [now, r.id]);
  }

  return unsynced.length;
}

/**
 * Sync class_room_plans to Supabase
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

  let syncedCount = 0;
  const now = new Date().toISOString();

  // For each plan, check if it exists on server and update, or insert new
  for (const p of unsynced) {
    // First verify that the class and room exist on the server
    const { data: classExists } = await supabase
      .from('classes')
      .select('id')
      .eq('id', p.class_id)
      .single();

    const { data: roomExists } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', p.room_id)
      .single();

    if (!classExists || !roomExists) {
      console.log('[syncService] Skipping plan - class or room not on server yet:', p.class_id, p.room_id);
      continue;
    }

    // Check if plan already exists on server for this class/room combo
    const { data: existing } = await supabase
      .from('class_room_plans')
      .select('id')
      .eq('class_id', p.class_id)
      .eq('room_id', p.room_id)
      .single();

    // Parse positions from JSON string
    let positionsData;
    try {
      positionsData = JSON.parse(p.positions);
    } catch {
      positionsData = {};
    }

    if (existing) {
      // Update existing plan
      const { error: updateError } = await supabase
        .from('class_room_plans')
        .update({
          positions: positionsData,
          updated_at: p.updated_at || now,
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[syncService] Plan update error:', updateError);
        // Don't throw, just skip this plan
        continue;
      }
    } else {
      // Insert new plan with user_id (required by RLS)
      const { error: insertError } = await supabase
        .from('class_room_plans')
        .insert({
          id: p.id,
          class_id: p.class_id,
          room_id: p.room_id,
          user_id: userId,
          positions: positionsData,
          created_at: p.created_at,
          updated_at: p.updated_at,
        });

      if (insertError) {
        console.error('[syncService] Plan insert error:', insertError);
        // Don't throw, just skip this plan
        continue;
      }
    }

    // Mark as synced
    await executeSql(`UPDATE class_room_plans SET synced_at = ? WHERE id = ?`, [now, p.id]);
    syncedCount++;
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
    console.log('[syncService] Checking room dependency:', roomId);

    const room = await queryFirst<{ id: string; synced_at: string | null; user_id: string; name: string; grid_rows: number; grid_cols: number; disabled_cells: string; created_at: string }>(
      `SELECT id, synced_at, user_id, name, grid_rows, grid_cols, disabled_cells, created_at FROM rooms WHERE id = ?`,
      [roomId]
    );

    if (!room) {
      console.error('[syncService] CRITICAL: Room not found locally for session:', roomId);
      throw new Error(`Room ${roomId} not found locally but referenced by session`);
    }

    // Always force sync the room to Supabase (even if synced_at is set, it might not exist on server)
    console.log('[syncService] Force syncing room to ensure it exists on server:', room.name, 'id:', room.id, 'user_id:', room.user_id);
    const { error: roomError, data: roomData } = await supabase
      .from('rooms')
      .upsert({
        id: room.id,
        user_id: room.user_id,
        name: room.name,
        grid_rows: room.grid_rows,
        grid_cols: room.grid_cols,
        disabled_cells: JSON.parse(room.disabled_cells || '[]'),
        created_at: room.created_at,
      }, { onConflict: 'id' })
      .select();

    if (roomError) {
      console.error('[syncService] Failed to sync required room:', roomError);
      throw new Error(`Room sync required for session failed: ${roomError.message}`);
    }

    console.log('[syncService] Room upsert result:', roomData);

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
    console.log('[syncService] Room synced and verified:', room.name);
  }

  // Check for unsynced classes that are referenced by sessions
  for (const classId of classIds) {
    console.log('[syncService] Checking class dependency:', classId);

    const cls = await queryFirst<{ id: string; synced_at: string | null; user_id: string; name: string; created_at: string }>(
      `SELECT id, synced_at, user_id, name, created_at FROM classes WHERE id = ?`,
      [classId]
    );

    if (!cls) {
      console.error('[syncService] CRITICAL: Class not found locally for session:', classId);
      throw new Error(`Class ${classId} not found locally but referenced by session`);
    }

    // Always force sync the class to Supabase
    console.log('[syncService] Force syncing class to ensure it exists on server:', cls.name);
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
    console.log('[syncService] Class synced successfully:', cls.name);
  }

  // Now sync sessions
  const toSync = unsynced.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    class_id: s.class_id,
    room_id: s.room_id,
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

  // Mark as synced
  const now = new Date().toISOString();
  for (const s of unsynced) {
    await executeSql(`UPDATE sessions SET synced_at = ? WHERE id = ?`, [now, s.id]);
  }

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

  // Mark as synced
  const now = new Date().toISOString();
  for (const e of unsynced) {
    await executeSql(`UPDATE events SET synced_at = ? WHERE id = ?`, [now, e.id]);
  }

  return unsynced.length;
}

/**
 * Sync group templates to Supabase
 */
async function syncGroupTemplates(userId: string): Promise<number> {
  if (!supabase) return 0;

  try {
    const unsynced = await queryAll<{
      id: string;
      class_id: string;
      name: string;
      groups_config: string;
      created_at: string;
      updated_at: string | null;
      is_deleted: number;
    }>(`SELECT * FROM group_templates WHERE user_id = ? AND synced_at IS NULL`, [userId]);

    if (unsynced.length === 0) return 0;

    const toSync = unsynced.map((t) => ({
      id: t.id,
      user_id: userId,
      class_id: t.class_id,
      name: t.name,
      groups_config: JSON.parse(t.groups_config),
      created_at: t.created_at,
      updated_at: t.updated_at,
      is_deleted: t.is_deleted === 1,
    }));

    const { error } = await supabase
      .from('group_templates')
      .upsert(toSync, { onConflict: 'id' });

    if (error) {
      console.error('[syncService] Group templates sync error:', error);
      throw new Error(`Group templates: ${error.message}`);
    }

    // Mark as synced
    const now = new Date().toISOString();
    for (const t of unsynced) {
      await executeSql(`UPDATE group_templates SET synced_at = ? WHERE id = ?`, [now, t.id]);
    }

    return unsynced.length;
  } catch (error) {
    console.error('[syncService] syncGroupTemplates error:', error);
    return 0;
  }
}

/**
 * Sync session groups to Supabase
 */
async function syncSessionGroups(): Promise<number> {
  if (!supabase) return 0;

  try {
    const unsynced = await queryAll<{
      id: string;
      session_id: string;
      group_number: number;
      created_at: string;
    }>(`SELECT * FROM session_groups WHERE synced_at IS NULL`);

    if (unsynced.length === 0) return 0;

    const toSync = unsynced.map((g) => ({
      id: g.id,
      session_id: g.session_id,
      group_number: g.group_number,
      created_at: g.created_at,
    }));

    const { error } = await supabase
      .from('session_groups')
      .upsert(toSync, { onConflict: 'id' });

    if (error) {
      console.error('[syncService] Session groups sync error:', error);
      throw new Error(`Session groups: ${error.message}`);
    }

    // Mark as synced
    const now = new Date().toISOString();
    for (const g of unsynced) {
      await executeSql(`UPDATE session_groups SET synced_at = ? WHERE id = ?`, [now, g.id]);
    }

    return unsynced.length;
  } catch (error) {
    console.error('[syncService] syncSessionGroups error:', error);
    return 0;
  }
}

/**
 * Sync group members to Supabase
 */
async function syncGroupMembers(): Promise<number> {
  if (!supabase) return 0;

  try {
    const unsynced = await queryAll<{
      id: string;
      session_group_id: string;
      student_id: string;
      joined_at: string;
      left_at: string | null;
    }>(`SELECT * FROM group_members WHERE synced_at IS NULL`);

    if (unsynced.length === 0) return 0;

    const toSync = unsynced.map((m) => ({
      id: m.id,
      session_group_id: m.session_group_id,
      student_id: m.student_id,
      joined_at: m.joined_at,
      left_at: m.left_at,
    }));

    const { error } = await supabase
      .from('group_members')
      .upsert(toSync, { onConflict: 'id' });

    if (error) {
      console.error('[syncService] Group members sync error:', error);
      throw new Error(`Group members: ${error.message}`);
    }

    // Mark as synced
    const now = new Date().toISOString();
    for (const m of unsynced) {
      await executeSql(`UPDATE group_members SET synced_at = ? WHERE id = ?`, [now, m.id]);
    }

    return unsynced.length;
  } catch (error) {
    console.error('[syncService] syncGroupMembers error:', error);
    return 0;
  }
}

/**
 * Sync group events to Supabase
 */
async function syncGroupEvents(): Promise<number> {
  if (!supabase) return 0;

  try {
    const unsynced = await queryAll<{
      id: string;
      session_group_id: string;
      type: string;
      note: string | null;
      photo_path: string | null;
      grade_value: number | null;
      grade_max: number | null;
      timestamp: string;
    }>(`SELECT * FROM group_events WHERE synced_at IS NULL`);

    if (unsynced.length === 0) return 0;

    const toSync = unsynced.map((e) => ({
      id: e.id,
      session_group_id: e.session_group_id,
      type: e.type,
      note: e.note,
      photo_path: e.photo_path,
      grade_value: e.grade_value,
      grade_max: e.grade_max,
      timestamp: e.timestamp,
    }));

    const { error } = await supabase
      .from('group_events')
      .upsert(toSync, { onConflict: 'id' });

    if (error) {
      console.error('[syncService] Group events sync error:', error);
      throw new Error(`Group events: ${error.message}`);
    }

    // Mark as synced
    const now = new Date().toISOString();
    for (const e of unsynced) {
      await executeSql(`UPDATE group_events SET synced_at = ? WHERE id = ?`, [now, e.id]);
    }

    return unsynced.length;
  } catch (error) {
    console.error('[syncService] syncGroupEvents error:', error);
    return 0;
  }
}

/**
 * Pull data from Supabase to local SQLite
 * This is the reverse sync: server -> mobile
 */
export async function pullFromServer(userId: string): Promise<{
  classes: number;
  students: number;
  rooms: number;
  plans: number;
  sessions: number;
  events: number;
}> {
  const result = { classes: 0, students: 0, rooms: 0, plans: 0, sessions: 0, events: 0 };

  if (!isSupabaseConfigured || !supabase) {
    console.log('[syncService] Supabase not configured, skipping pull');
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
    } else {
      const serverClassIds = new Set((serverClasses || []).map(c => c.id));

      // Delete local classes that don't exist on server anymore
      const localClasses = await queryAll<{ id: string }>(
        `SELECT id FROM classes WHERE user_id = ?`,
        [userId]
      );
      for (const local of localClasses) {
        if (!serverClassIds.has(local.id)) {
          // Class was deleted on server, remove locally
          await executeSql(`DELETE FROM students WHERE class_id = ?`, [local.id]);
          await executeSql(`DELETE FROM class_room_plans WHERE class_id = ?`, [local.id]);
          await executeSql(`DELETE FROM classes WHERE id = ?`, [local.id]);
          console.log('[syncService] Deleted local class not on server:', local.id);
        }
      }

      // Add new classes from server
      for (const cls of (serverClasses || [])) {
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
          console.log('[syncService] Pulled class:', cls.name);
        }
      }
    }

    // 2. Pull students from Supabase
    const { data: serverStudents, error: studentsError } = await supabase
      .from('students')
      .select('id, user_id, class_id, pseudo, created_at')
      .eq('user_id', userId);

    if (studentsError) {
      console.error('[syncService] Pull students error:', studentsError);
    } else {
      const serverStudentIds = new Set((serverStudents || []).map(s => s.id));

      // Delete local students that don't exist on server anymore
      const localStudents = await queryAll<{ id: string }>(
        `SELECT id FROM students WHERE user_id = ?`,
        [userId]
      );
      for (const local of localStudents) {
        if (!serverStudentIds.has(local.id)) {
          await executeSql(`DELETE FROM students WHERE id = ?`, [local.id]);
          console.log('[syncService] Deleted local student not on server:', local.id);
        }
      }

      // Add new students from server
      for (const student of (serverStudents || [])) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM students WHERE id = ?`,
          [student.id]
        );

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO students (id, user_id, class_id, pseudo, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [student.id, student.user_id, student.class_id, student.pseudo, student.created_at, now]
          );
          result.students++;
          console.log('[syncService] Pulled student:', student.pseudo);
        }
      }
    }

    // 3. Pull rooms from Supabase
    const { data: serverRooms, error: roomsError } = await supabase
      .from('rooms')
      .select('id, name, grid_rows, grid_cols, disabled_cells, created_at')
      .eq('user_id', userId);

    if (roomsError) {
      console.error('[syncService] Pull rooms error:', roomsError);
    } else {
      const serverRoomIds = new Set((serverRooms || []).map(r => r.id));

      // Delete local rooms that don't exist on server anymore
      const localRooms = await queryAll<{ id: string }>(
        `SELECT id FROM rooms WHERE user_id = ? AND is_deleted = 0`,
        [userId]
      );
      for (const local of localRooms) {
        if (!serverRoomIds.has(local.id)) {
          await executeSql(`DELETE FROM class_room_plans WHERE room_id = ?`, [local.id]);
          await executeSql(`DELETE FROM rooms WHERE id = ?`, [local.id]);
          console.log('[syncService] Deleted local room not on server:', local.id);
        }
      }

      // Add/update rooms from server
      for (const room of (serverRooms || [])) {
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
          console.log('[syncService] Pulled room:', room.name);
        } else {
          await executeSql(
            `UPDATE rooms SET name = ?, grid_rows = ?, grid_cols = ?, disabled_cells = ?, synced_at = ? WHERE id = ?`,
            [room.name, room.grid_rows, room.grid_cols, disabledCellsJson, now, room.id]
          );
          console.log('[syncService] Updated room from server:', room.name);
        }
      }
    }

    // 4. Pull class_room_plans from Supabase
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
            console.log('[syncService] Pulled plan for class:', plan.class_id, 'room:', plan.room_id);
          } else {
            // Update existing plan - server wins for positions
            await executeSql(
              `UPDATE class_room_plans SET positions = ?, updated_at = ?, synced_at = ? WHERE class_id = ? AND room_id = ?`,
              [positionsJson, plan.updated_at || now, now, plan.class_id, plan.room_id]
            );
            console.log('[syncService] Updated plan for class:', plan.class_id, 'room:', plan.room_id);
          }
        }
      }
    }

    // 5. Pull sessions from Supabase
    const { data: serverSessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, user_id, class_id, room_id, started_at, ended_at')
      .eq('user_id', userId);

    if (sessionsError) {
      console.error('[syncService] Pull sessions error:', sessionsError);
    } else if (serverSessions && serverSessions.length > 0) {
      for (const session of serverSessions) {
        // Check if exists locally
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM sessions WHERE id = ?`,
          [session.id]
        );

        if (existing.length === 0) {
          // Insert new session
          await executeSql(
            `INSERT INTO sessions (id, user_id, class_id, room_id, started_at, ended_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [session.id, session.user_id, session.class_id, session.room_id, session.started_at, session.ended_at, now]
          );
          result.sessions++;
          console.log('[syncService] Pulled session:', session.id);
        }
      }
    }

    // 6. Pull events from Supabase (for all user's sessions)
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
        console.log('[syncService] Pulled events:', result.events);
      }
    }

    console.log('[syncService] Pull complete:', result);
  } catch (error) {
    console.error('[syncService] Pull failed:', error);
  }

  return result;
}
