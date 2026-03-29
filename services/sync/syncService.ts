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
  groupSessionsSync: number;
  gradingCriteriaSync: number;
  sessionGroupsSync: number;
  groupMembersSync: number;
  groupGradesSync: number;
  tpTemplatesSync: number;
  tpTemplateCriteriaSync: number;
  stampCategoriesSync: number;
  bonusesSync: number;
  stampCardsSync: number;
  stampsSync: number;
  bonusSelectionsSync: number;
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
      (SELECT COUNT(*) FROM group_sessions WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM grading_criteria WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM session_groups WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM session_group_members WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM group_grades WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM tp_templates WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM tp_template_criteria WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM stamp_categories WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM bonuses WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM stamp_cards WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM stamps WHERE synced_at IS NULL) +
      (SELECT COUNT(*) FROM bonus_selections WHERE synced_at IS NULL)
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
    groupSessionsSync: 0,
    gradingCriteriaSync: 0,
    sessionGroupsSync: 0,
    groupMembersSync: 0,
    groupGradesSync: 0,
    tpTemplatesSync: 0,
    tpTemplateCriteriaSync: 0,
    stampCategoriesSync: 0,
    bonusesSync: 0,
    stampCardsSync: 0,
    stampsSync: 0,
    bonusSelectionsSync: 0,
    errors: [],
  };

  if (!isSupabaseConfigured || !supabase) {
    result.success = false;
    result.errors.push('Supabase non configure');
    return result;
  }

  try {
    // Sync in dependency order: classes -> students -> rooms -> plans -> sessions -> events

    // 1. Sync classes
    result.classesSync = await syncClasses(userId);

    // 2. Sync students (depends on classes)
    result.studentsSync = await syncStudents();

    // 4. Sync rooms
    result.roomsSync = await syncRooms(userId);

    // 5. Sync class_room_plans
    result.plansSync = await syncPlans(userId);

    // 6. Sync sessions
    result.sessionsSync = await syncSessions();

    // 7. Sync events
    result.eventsSync = await syncEvents();

    // 8. Sync group sessions (depends on classes)
    result.groupSessionsSync = await syncGroupSessions();

    // 9. Sync grading criteria (depends on group_sessions)
    result.gradingCriteriaSync = await syncGradingCriteria();

    // 10. Sync session groups (depends on group_sessions)
    result.sessionGroupsSync = await syncSessionGroups();

    // 11. Sync group members (depends on session_groups and students)
    result.groupMembersSync = await syncGroupMembers();

    // 12. Sync group grades (depends on session_groups and grading_criteria)
    result.groupGradesSync = await syncGroupGrades();

    // 13. Sync TP templates
    result.tpTemplatesSync = await syncTpTemplates(userId);

    // 14. Sync TP template criteria (depends on tp_templates)
    result.tpTemplateCriteriaSync = await syncTpTemplateCriteria();

    // 15. Sync stamp categories
    result.stampCategoriesSync = await syncStampCategories(userId);

    // 16. Sync bonuses
    result.bonusesSync = await syncBonuses(userId);

    // 17. Sync stamp cards (depends on students)
    result.stampCardsSync = await syncStampCards(userId);

    // 18. Sync stamps (depends on stamp_cards and stamp_categories)
    result.stampsSync = await syncStamps(userId);

    // 19. Sync bonus selections (depends on stamp_cards and bonuses)
    result.bonusSelectionsSync = await syncBonusSelections(userId);

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
 * Sync group_sessions to Supabase
 */
async function syncGroupSessions(): Promise<number> {
  if (!supabase) return 0;

  // Only sync completed sessions to avoid showing incomplete data on the web
  const unsynced = await queryAll<{
    id: string;
    user_id: string;
    class_id: string;
    name: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    linked_session_id: string | null;
  }>(`SELECT id, user_id, class_id, name, status, created_at, completed_at, linked_session_id FROM group_sessions WHERE synced_at IS NULL AND status = 'completed'`);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((gs) => ({
    id: gs.id,
    user_id: gs.user_id,
    class_id: gs.class_id,
    name: gs.name,
    status: gs.status,
    created_at: gs.created_at,
    completed_at: gs.completed_at,
    linked_session_id: gs.linked_session_id,
  }));

  const { error } = await supabase
    .from('group_sessions')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Group sessions sync error:', error);
    throw new Error(`Group sessions: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = unsynced.map(gs => gs.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE group_sessions SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync grading_criteria to Supabase
 */
async function syncGradingCriteria(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    session_id: string;
    label: string;
    max_points: number;
    display_order: number;
  }>(`SELECT id, session_id, label, max_points, display_order FROM grading_criteria WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Filter out criteria whose session hasn't been synced yet
  const sessionIds = [...new Set(unsynced.map(c => c.session_id))];
  const { data: syncedSessions } = await supabase
    .from('group_sessions')
    .select('id')
    .in('id', sessionIds);
  const serverSessionIds = new Set((syncedSessions || []).map(s => s.id));

  const toSync = unsynced
    .filter(c => serverSessionIds.has(c.session_id))
    .map((c) => ({
      id: c.id,
      session_id: c.session_id,
      label: c.label,
      max_points: c.max_points,
      display_order: c.display_order,
    }));

  if (toSync.length === 0) return 0;

  const { error } = await supabase
    .from('grading_criteria')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Grading criteria sync error:', error);
    throw new Error(`Grading criteria: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = toSync.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE grading_criteria SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return toSync.length;
}

/**
 * Sync session_groups to Supabase
 */
async function syncSessionGroups(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    session_id: string;
    name: string;
    conduct_malus: number;
  }>(`SELECT id, session_id, name, conduct_malus FROM session_groups WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Filter out groups whose session hasn't been synced yet
  const sessionIds = [...new Set(unsynced.map(g => g.session_id))];
  const { data: syncedSessions } = await supabase
    .from('group_sessions')
    .select('id')
    .in('id', sessionIds);
  const serverSessionIds = new Set((syncedSessions || []).map(s => s.id));

  const toSync = unsynced
    .filter(g => serverSessionIds.has(g.session_id))
    .map((g) => ({
      id: g.id,
      session_id: g.session_id,
      name: g.name,
      conduct_malus: g.conduct_malus,
    }));

  if (toSync.length === 0) return 0;

  const { error } = await supabase
    .from('session_groups')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Session groups sync error:', error);
    throw new Error(`Session groups: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = toSync.map(g => g.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE session_groups SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return toSync.length;
}

/**
 * Sync session_group_members to Supabase
 */
async function syncGroupMembers(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    group_id: string;
    student_id: string;
  }>(`SELECT id, group_id, student_id FROM session_group_members WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Filter out members whose group hasn't been synced yet
  const groupIds = [...new Set(unsynced.map(m => m.group_id))];
  const { data: syncedGroups } = await supabase
    .from('session_groups')
    .select('id')
    .in('id', groupIds);
  const serverGroupIds = new Set((syncedGroups || []).map(g => g.id));

  const toSync = unsynced
    .filter(m => serverGroupIds.has(m.group_id))
    .map((m) => ({
      id: m.id,
      group_id: m.group_id,
      student_id: m.student_id,
    }));

  if (toSync.length === 0) return 0;

  const { error } = await supabase
    .from('session_group_members')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Group members sync error:', error);
    throw new Error(`Group members: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = toSync.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE session_group_members SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return toSync.length;
}

/**
 * Sync group_grades to Supabase
 */
async function syncGroupGrades(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    group_id: string;
    criteria_id: string;
    points_awarded: number;
  }>(`SELECT id, group_id, criteria_id, points_awarded FROM group_grades WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Filter out grades whose group hasn't been synced yet
  const groupIds = [...new Set(unsynced.map(gr => gr.group_id))];
  const { data: syncedGroups } = await supabase
    .from('session_groups')
    .select('id')
    .in('id', groupIds);
  const serverGroupIds = new Set((syncedGroups || []).map(g => g.id));

  // Also filter by criteria synced
  const criteriaIds = [...new Set(unsynced.map(gr => gr.criteria_id))];
  const { data: syncedCriteria } = await supabase
    .from('grading_criteria')
    .select('id')
    .in('id', criteriaIds);
  const serverCriteriaIds = new Set((syncedCriteria || []).map(c => c.id));

  const toSync = unsynced
    .filter(gr => serverGroupIds.has(gr.group_id) && serverCriteriaIds.has(gr.criteria_id))
    .map((gr) => ({
      id: gr.id,
      group_id: gr.group_id,
      criteria_id: gr.criteria_id,
      points_awarded: gr.points_awarded,
    }));

  if (toSync.length === 0) return 0;

  const { error } = await supabase
    .from('group_grades')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] Group grades sync error:', error);
    throw new Error(`Group grades: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = toSync.map(gr => gr.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE group_grades SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return toSync.length;
}

/**
 * Sync tp_templates to Supabase
 */
async function syncTpTemplates(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    name: string;
    created_at: string;
  }>(`SELECT id, name, created_at FROM tp_templates WHERE user_id = ? AND synced_at IS NULL`, [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map((t) => ({
    id: t.id,
    user_id: userId,
    name: t.name,
    created_at: t.created_at,
  }));

  const { error } = await supabase
    .from('tp_templates')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] TP templates sync error:', error);
    throw new Error(`TP templates: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = unsynced.map(t => t.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE tp_templates SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return unsynced.length;
}

/**
 * Sync tp_template_criteria to Supabase
 */
async function syncTpTemplateCriteria(): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string;
    template_id: string;
    label: string;
    max_points: number;
    display_order: number;
  }>(`SELECT id, template_id, label, max_points, display_order FROM tp_template_criteria WHERE synced_at IS NULL`);

  if (unsynced.length === 0) return 0;

  // Filter out criteria whose template hasn't been synced yet
  const templateIds = [...new Set(unsynced.map(c => c.template_id))];
  const { data: syncedTemplates } = await supabase
    .from('tp_templates')
    .select('id')
    .in('id', templateIds);
  const serverTemplateIds = new Set((syncedTemplates || []).map(t => t.id));

  const toSync = unsynced
    .filter(c => serverTemplateIds.has(c.template_id))
    .map((c) => ({
      id: c.id,
      template_id: c.template_id,
      label: c.label,
      max_points: c.max_points,
      display_order: c.display_order,
    }));

  if (toSync.length === 0) return 0;

  const { error } = await supabase
    .from('tp_template_criteria')
    .upsert(toSync, { onConflict: 'id' });

  if (error) {
    console.error('[syncService] TP template criteria sync error:', error);
    throw new Error(`TP template criteria: ${error.message}`);
  }

  // Mark as synced
  const now = new Date().toISOString();
  const ids = toSync.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(
    `UPDATE tp_template_criteria SET synced_at = ? WHERE id IN (${placeholders})`,
    [now, ...ids]
  );

  return toSync.length;
}

// ============================================
// Stamp Cards sync functions
// ============================================

async function syncStampCategories(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string; label: string; icon: string; color: string; display_order: number; is_active: number; created_at: string;
  }>('SELECT id, label, icon, color, display_order, is_active, created_at FROM stamp_categories WHERE user_id = ? AND synced_at IS NULL', [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map(c => ({
    id: c.id, user_id: userId, label: c.label, icon: c.icon, color: c.color,
    display_order: c.display_order, is_active: c.is_active === 1, created_at: c.created_at,
  }));

  const { error } = await supabase.from('stamp_categories').upsert(toSync, { onConflict: 'id' });
  if (error) { console.error('[syncService] Stamp categories sync error:', error); throw new Error(`Stamp categories: ${error.message}`); }

  const now = new Date().toISOString();
  const ids = unsynced.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE stamp_categories SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);

  return unsynced.length;
}

async function syncBonuses(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string; label: string; display_order: number; is_active: number; created_at: string;
  }>('SELECT id, label, display_order, is_active, created_at FROM bonuses WHERE user_id = ? AND synced_at IS NULL', [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map(b => ({
    id: b.id, user_id: userId, label: b.label,
    display_order: b.display_order, is_active: b.is_active === 1, created_at: b.created_at,
  }));

  const { error } = await supabase.from('bonuses').upsert(toSync, { onConflict: 'id' });
  if (error) { console.error('[syncService] Bonuses sync error:', error); throw new Error(`Bonuses: ${error.message}`); }

  const now = new Date().toISOString();
  const ids = unsynced.map(b => b.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE bonuses SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);

  return unsynced.length;
}

async function syncStampCards(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string; student_id: string; card_number: number; status: string; completed_at: string | null; created_at: string;
  }>('SELECT id, student_id, card_number, status, completed_at, created_at FROM stamp_cards WHERE user_id = ? AND synced_at IS NULL', [userId]);

  if (unsynced.length === 0) return 0;

  // Check for UUID conflicts: server may already have cards for the same (student_id, card_number)
  // created by the web app with different UUIDs
  const studentIds = [...new Set(unsynced.map(c => c.student_id))];
  const { data: serverCards } = await supabase
    .from('stamp_cards')
    .select('id, student_id, card_number')
    .in('student_id', studentIds)
    .eq('user_id', userId);

  // Build lookup: "student_id|card_number" -> server UUID
  const serverCardMap = new Map<string, string>();
  for (const sc of (serverCards || [])) {
    serverCardMap.set(`${sc.student_id}|${sc.card_number}`, sc.id);
  }

  const now = new Date().toISOString();
  const toSync: typeof unsynced = [];

  for (const card of unsynced) {
    const key = `${card.student_id}|${card.card_number}`;
    const serverId = serverCardMap.get(key);

    if (serverId && serverId !== card.id) {
      // Conflict: server has a different UUID for this card
      // Remap local references (stamps, bonus_selections) to use server UUID
      await executeSql('UPDATE stamps SET card_id = ? WHERE card_id = ?', [serverId, card.id]);
      await executeSql('UPDATE bonus_selections SET card_id = ? WHERE card_id = ?', [serverId, card.id]);
      // Update the local stamp_card id to match server
      await executeSql('DELETE FROM stamp_cards WHERE id = ?', [card.id]);
      await executeSql(
        'INSERT OR REPLACE INTO stamp_cards (id, student_id, user_id, card_number, status, completed_at, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [serverId, card.student_id, userId, card.card_number, card.status, card.completed_at, card.created_at, now]
      );
      console.log(`[syncService] Remapped stamp_card ${card.id} -> ${serverId} for student ${card.student_id}`);
    } else {
      // No conflict, sync normally
      toSync.push(card);
    }
  }

  // Upsert non-conflicting cards
  if (toSync.length > 0) {
    const payload = toSync.map(c => ({
      id: c.id, student_id: c.student_id, user_id: userId,
      card_number: c.card_number, status: c.status, completed_at: c.completed_at, created_at: c.created_at,
    }));

    const { error } = await supabase.from('stamp_cards').upsert(payload, { onConflict: 'id' });
    if (error) { console.error('[syncService] Stamp cards sync error:', error); throw new Error(`Stamp cards: ${error.message}`); }

    const ids = toSync.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');
    await executeSql(`UPDATE stamp_cards SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
  }

  return unsynced.length;
}

async function syncStamps(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string; card_id: string; student_id: string; category_id: string | null; slot_number: number; awarded_at: string;
  }>('SELECT id, card_id, student_id, category_id, slot_number, awarded_at FROM stamps WHERE user_id = ? AND synced_at IS NULL', [userId]);

  if (unsynced.length === 0) return 0;

  // Filter: only sync stamps whose card is already synced on server
  const cardIds = [...new Set(unsynced.map(s => s.card_id))];
  const { data: syncedCards } = await supabase.from('stamp_cards').select('id').in('id', cardIds);
  const serverCardIds = new Set((syncedCards || []).map(c => c.id));

  const eligible = unsynced.filter(s => serverCardIds.has(s.card_id));
  if (eligible.length === 0) return 0;

  // Check for slot_number conflicts: server may already have stamps at the same (card_id, slot_number)
  // This happens when web and mobile both award stamps to the same student
  const { data: serverStamps } = await supabase
    .from('stamps')
    .select('card_id, slot_number')
    .in('card_id', [...serverCardIds]);

  const occupiedSlots = new Set<string>();
  for (const ss of (serverStamps || [])) {
    occupiedSlots.set(`${ss.card_id}|${ss.slot_number}`);
  }

  const toSync = [];
  for (const s of eligible) {
    let slot = s.slot_number;
    const slotKey = `${s.card_id}|${slot}`;

    if (occupiedSlots.has(slotKey)) {
      // Conflict: find next available slot (max 10 per card)
      let newSlot = slot;
      while (newSlot <= 10 && occupiedSlots.has(`${s.card_id}|${newSlot}`)) {
        newSlot++;
      }
      if (newSlot > 10) {
        // Card is full, skip this stamp
        console.log(`[syncService] Card ${s.card_id} full, skipping stamp ${s.id}`);
        // Mark as synced locally to avoid retrying
        await executeSql('UPDATE stamps SET synced_at = ? WHERE id = ?', [new Date().toISOString(), s.id]);
        continue;
      }
      slot = newSlot;
      // Update local slot_number to match
      await executeSql('UPDATE stamps SET slot_number = ? WHERE id = ?', [slot, s.id]);
      console.log(`[syncService] Renumbered stamp ${s.id} slot ${s.slot_number} -> ${slot}`);
    }

    occupiedSlots.add(`${s.card_id}|${slot}`);
    toSync.push({
      id: s.id, card_id: s.card_id, student_id: s.student_id, user_id: userId,
      category_id: s.category_id, slot_number: slot, awarded_at: s.awarded_at,
    });
  }

  if (toSync.length === 0) return 0;

  const { error } = await supabase.from('stamps').upsert(toSync, { onConflict: 'id' });
  if (error) { console.error('[syncService] Stamps sync error:', error); throw new Error(`Stamps: ${error.message}`); }

  const now = new Date().toISOString();
  const ids = toSync.map(s => s.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE stamps SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);

  return toSync.length;
}

async function syncBonusSelections(userId: string): Promise<number> {
  if (!supabase) return 0;

  const unsynced = await queryAll<{
    id: string; card_id: string; bonus_id: string | null; student_id: string; selected_at: string; used_at: string | null;
  }>('SELECT id, card_id, bonus_id, student_id, selected_at, used_at FROM bonus_selections WHERE user_id = ? AND synced_at IS NULL', [userId]);

  if (unsynced.length === 0) return 0;

  const toSync = unsynced.map(bs => ({
    id: bs.id, card_id: bs.card_id, bonus_id: bs.bonus_id, student_id: bs.student_id, user_id: userId,
    selected_at: bs.selected_at, used_at: bs.used_at,
  }));

  const { error } = await supabase.from('bonus_selections').upsert(toSync, { onConflict: 'id' });
  if (error) { console.error('[syncService] Bonus selections sync error:', error); throw new Error(`Bonus selections: ${error.message}`); }

  const now = new Date().toISOString();
  const ids = unsynced.map(bs => bs.id);
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE bonus_selections SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);

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
  rooms: number;
  plans: number;
  sessions: number;
  events: number;
  tpTemplates: number;
  stampCategories: number;
  bonuses: number;
  stampCards: number;
  stamps: number;
  bonusSelections: number;
  errors: string[];
}> {
  const result = { classes: 0, students: 0, rooms: 0, plans: 0, sessions: 0, events: 0, tpTemplates: 0, stampCategories: 0, bonuses: 0, stampCards: 0, stamps: 0, bonusSelections: 0, errors: [] as string[] };

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

    // 2. Pull students from Supabase
    const { data: serverStudents, error: studentsError } = await supabase
      .from('students')
      .select('id, user_id, class_id, pseudo, created_at')
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
        try {
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM students WHERE id = ?`,
            [student.id]
          );

          if (existing.length === 0) {
            await executeSql(
              `INSERT INTO students (id, user_id, class_id, pseudo, created_at, synced_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, 0)`,
              [student.id, student.user_id, student.class_id, student.pseudo, student.created_at, now]
            );
            result.students++;
            if (__DEV__) {
              console.log('[syncService] Pulled student:', student.pseudo);
            }
          } else {
            // Student exists but might have is_deleted = 1, reset it
            await executeSql(
              `UPDATE students SET is_deleted = 0, synced_at = ? WHERE id = ?`,
              [now, student.id]
            );
            if (__DEV__) {
              console.log('[syncService] Restored student:', student.pseudo);
            }
          }
        } catch (err) {
          console.error('[syncService] Error inserting student:', student.pseudo, err);
          result.errors.push(`Student ${student.pseudo}: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    // 5. Pull sessions from Supabase
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
        result.errors.push(`Events: ${eventsError.message}`);
      } else if (serverEvents && serverEvents.length > 0) {
        let eventsInserted = 0;
        let eventsSkipped = 0;
        for (const event of serverEvents) {
          try {
            // Check if exists locally
            const existing = await queryAll<{ id: string }>(
              `SELECT id FROM events WHERE id = ?`,
              [event.id]
            );

            if (existing.length === 0) {
              // Verify student exists locally (FK constraint)
              const studentExists = await queryAll<{ id: string }>(
                `SELECT id FROM students WHERE id = ?`,
                [event.student_id]
              );

              if (studentExists.length === 0) {
                // Student doesn't exist locally, skip this event
                eventsSkipped++;
                if (__DEV__) {
                  console.warn('[syncService] Skipping event - student not found locally:', event.student_id);
                }
                continue;
              }

              // Insert new event
              await executeSql(
                `INSERT INTO events (id, session_id, student_id, type, subtype, note, photo_path, timestamp, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [event.id, event.session_id, event.student_id, event.type, event.subtype, event.note, event.photo_path, event.timestamp, now]
              );
              eventsInserted++;
            }
          } catch (err) {
            console.error('[syncService] Error inserting event:', event.id, err);
          }
        }
        result.events = eventsInserted;
        if (__DEV__) {
          console.log('[syncService] Pulled events:', eventsInserted, 'skipped:', eventsSkipped);
        }
      }
    }

    // 7. Pull TP templates from Supabase
    const { data: serverTpTemplates, error: tpTemplatesError } = await supabase
      .from('tp_templates')
      .select('id, name, created_at')
      .eq('user_id', userId);

    if (tpTemplatesError) {
      console.error('[syncService] Pull TP templates error:', tpTemplatesError);
      result.errors.push(`TP Templates: ${tpTemplatesError.message}`);
    } else if (serverTpTemplates && serverTpTemplates.length > 0) {
      for (const template of serverTpTemplates) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM tp_templates WHERE id = ?`,
          [template.id]
        );

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO tp_templates (id, user_id, name, created_at, synced_at) VALUES (?, ?, ?, ?, ?)`,
            [template.id, userId, template.name, template.created_at, now]
          );
          result.tpTemplates++;
          if (__DEV__) {
            console.log('[syncService] Pulled TP template:', template.name);
          }
        }
      }

      // 8. Pull TP template criteria
      const templateIds = serverTpTemplates.map(t => t.id);
      const { data: serverCriteria, error: criteriaError } = await supabase
        .from('tp_template_criteria')
        .select('id, template_id, label, max_points, display_order')
        .in('template_id', templateIds);

      if (criteriaError) {
        console.error('[syncService] Pull TP criteria error:', criteriaError);
        result.errors.push(`TP Criteria: ${criteriaError.message}`);
      } else if (serverCriteria && serverCriteria.length > 0) {
        for (const crit of serverCriteria) {
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM tp_template_criteria WHERE id = ?`,
            [crit.id]
          );

          if (existing.length === 0) {
            await executeSql(
              `INSERT INTO tp_template_criteria (id, template_id, label, max_points, display_order, synced_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [crit.id, crit.template_id, crit.label, crit.max_points, crit.display_order, now]
            );
            if (__DEV__) {
              console.log('[syncService] Pulled TP criteria:', crit.label);
            }
          }
        }
      }
    }

    // 9. Pull group sessions from Supabase
    const { data: serverGroupSessions, error: groupSessionsError } = await supabase
      .from('group_sessions')
      .select('id, user_id, class_id, name, status, created_at, completed_at, linked_session_id')
      .eq('user_id', userId);

    if (groupSessionsError) {
      console.error('[syncService] Pull group sessions error:', groupSessionsError);
      result.errors.push(`Group Sessions: ${groupSessionsError.message}`);
    } else if (serverGroupSessions && serverGroupSessions.length > 0) {
      for (const gs of serverGroupSessions) {
        const existing = await queryAll<{ id: string }>(
          `SELECT id FROM group_sessions WHERE id = ?`,
          [gs.id]
        );

        if (existing.length === 0) {
          await executeSql(
            `INSERT INTO group_sessions (id, user_id, class_id, name, status, created_at, completed_at, linked_session_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [gs.id, gs.user_id, gs.class_id, gs.name, gs.status, gs.created_at, gs.completed_at, gs.linked_session_id, now]
          );
          if (__DEV__) {
            console.log('[syncService] Pulled group session:', gs.name);
          }
        }
      }

      // 10. Pull grading criteria for pulled group sessions
      const gsIds = serverGroupSessions.map(gs => gs.id);
      const { data: serverCriteriaGS, error: criteriaGSError } = await supabase
        .from('grading_criteria')
        .select('id, session_id, label, max_points, display_order')
        .in('session_id', gsIds);

      if (criteriaGSError) {
        console.error('[syncService] Pull grading criteria error:', criteriaGSError);
        result.errors.push(`Grading Criteria: ${criteriaGSError.message}`);
      } else if (serverCriteriaGS && serverCriteriaGS.length > 0) {
        for (const crit of serverCriteriaGS) {
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM grading_criteria WHERE id = ?`,
            [crit.id]
          );
          if (existing.length === 0) {
            await executeSql(
              `INSERT INTO grading_criteria (id, session_id, label, max_points, display_order, synced_at) VALUES (?, ?, ?, ?, ?, ?)`,
              [crit.id, crit.session_id, crit.label, crit.max_points, crit.display_order, now]
            );
            if (__DEV__) {
              console.log('[syncService] Pulled grading criteria:', crit.label);
            }
          }
        }
      }

      // 11. Pull session groups
      const { data: serverGroups, error: groupsError } = await supabase
        .from('session_groups')
        .select('id, session_id, name, conduct_malus')
        .in('session_id', gsIds);

      if (groupsError) {
        console.error('[syncService] Pull session groups error:', groupsError);
        result.errors.push(`Session Groups: ${groupsError.message}`);
      } else if (serverGroups && serverGroups.length > 0) {
        for (const grp of serverGroups) {
          const existing = await queryAll<{ id: string }>(
            `SELECT id FROM session_groups WHERE id = ?`,
            [grp.id]
          );
          if (existing.length === 0) {
            await executeSql(
              `INSERT INTO session_groups (id, session_id, name, conduct_malus, synced_at) VALUES (?, ?, ?, ?, ?)`,
              [grp.id, grp.session_id, grp.name, grp.conduct_malus, now]
            );
            if (__DEV__) {
              console.log('[syncService] Pulled session group:', grp.name);
            }
          }
        }

        // 12. Pull group members
        const groupIds = serverGroups.map(g => g.id);
        const { data: serverMembers, error: membersError } = await supabase
          .from('session_group_members')
          .select('id, group_id, student_id')
          .in('group_id', groupIds);

        if (membersError) {
          console.error('[syncService] Pull group members error:', membersError);
          result.errors.push(`Group Members: ${membersError.message}`);
        } else if (serverMembers && serverMembers.length > 0) {
          for (const mem of serverMembers) {
            const existing = await queryAll<{ id: string }>(
              `SELECT id FROM session_group_members WHERE id = ?`,
              [mem.id]
            );
            if (existing.length === 0) {
              await executeSql(
                `INSERT INTO session_group_members (id, group_id, student_id, synced_at) VALUES (?, ?, ?, ?)`,
                [mem.id, mem.group_id, mem.student_id, now]
              );
            }
          }
          if (__DEV__) {
            console.log('[syncService] Pulled', serverMembers.length, 'group members');
          }
        }

        // 13. Pull group grades
        const { data: serverGrades, error: gradesError } = await supabase
          .from('group_grades')
          .select('id, group_id, criteria_id, points_awarded')
          .in('group_id', groupIds);

        if (gradesError) {
          console.error('[syncService] Pull group grades error:', gradesError);
          result.errors.push(`Group Grades: ${gradesError.message}`);
        } else if (serverGrades && serverGrades.length > 0) {
          for (const grade of serverGrades) {
            const existing = await queryAll<{ id: string }>(
              `SELECT id FROM group_grades WHERE id = ?`,
              [grade.id]
            );
            if (existing.length === 0) {
              await executeSql(
                `INSERT INTO group_grades (id, group_id, criteria_id, points_awarded, synced_at) VALUES (?, ?, ?, ?, ?)`,
                [grade.id, grade.group_id, grade.criteria_id, grade.points_awarded, now]
              );
            }
          }
          if (__DEV__) {
            console.log('[syncService] Pulled', serverGrades.length, 'group grades');
          }
        }
      }
    }

    // --- Pull stamp system tables ---

    // 14. Pull stamp_categories
    const { data: serverStampCategories, error: stampCatError } = await supabase
      .from('stamp_categories')
      .select('id, label, icon, color, display_order, is_active, created_at')
      .eq('user_id', userId);

    if (stampCatError) {
      console.error('[syncService] Pull stamp_categories error:', stampCatError);
      result.errors.push(`Stamp Categories: ${stampCatError.message}`);
    } else if (serverStampCategories !== null) {
      const serverIds = new Set(serverStampCategories.map(c => c.id));
      const localCats = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM stamp_categories WHERE user_id = ?`,
        [userId]
      );
      for (const local of localCats) {
        if (!serverIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM stamp_categories WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local stamp_category not on server:', local.id);
          }
        }
      }
      for (const cat of serverStampCategories) {
        await executeSql(
          `INSERT OR REPLACE INTO stamp_categories (id, user_id, label, icon, color, display_order, is_active, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cat.id, userId, cat.label, cat.icon, cat.color, cat.display_order, cat.is_active ? 1 : 0, cat.created_at, now]
        );
        result.stampCategories++;
      }
      if (__DEV__) {
        console.log('[syncService] Pulled stamp_categories:', result.stampCategories);
      }
    }

    // 15. Pull bonuses
    const { data: serverBonuses, error: bonusesError } = await supabase
      .from('bonuses')
      .select('id, label, display_order, is_active, created_at')
      .eq('user_id', userId);

    if (bonusesError) {
      console.error('[syncService] Pull bonuses error:', bonusesError);
      result.errors.push(`Bonuses: ${bonusesError.message}`);
    } else if (serverBonuses !== null) {
      const serverIds = new Set(serverBonuses.map(b => b.id));
      const localBonuses = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM bonuses WHERE user_id = ?`,
        [userId]
      );
      for (const local of localBonuses) {
        if (!serverIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM bonuses WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local bonus not on server:', local.id);
          }
        }
      }
      for (const bonus of serverBonuses) {
        await executeSql(
          `INSERT OR REPLACE INTO bonuses (id, user_id, label, display_order, is_active, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [bonus.id, userId, bonus.label, bonus.display_order, bonus.is_active ? 1 : 0, bonus.created_at, now]
        );
        result.bonuses++;
      }
      if (__DEV__) {
        console.log('[syncService] Pulled bonuses:', result.bonuses);
      }
    }

    // 16. Pull stamp_cards (CASCADE will auto-delete related stamps + bonus_selections)
    const { data: serverStampCards, error: stampCardsError } = await supabase
      .from('stamp_cards')
      .select('id, student_id, card_number, status, completed_at, created_at')
      .eq('user_id', userId);

    if (stampCardsError) {
      console.error('[syncService] Pull stamp_cards error:', stampCardsError);
      result.errors.push(`Stamp Cards: ${stampCardsError.message}`);
    } else if (serverStampCards !== null) {
      const serverIds = new Set(serverStampCards.map(c => c.id));
      const localCards = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM stamp_cards WHERE user_id = ?`,
        [userId]
      );
      for (const local of localCards) {
        if (!serverIds.has(local.id) && local.synced_at !== null) {
          // Check for unsynced child stamps before CASCADE delete
          const unsyncedChildren = await queryAll<{ id: string }>(
            `SELECT id FROM stamps WHERE card_id = ? AND synced_at IS NULL`,
            [local.id]
          );
          if (unsyncedChildren.length > 0) {
            console.warn('[syncService] Skipping stamp_card delete (has', unsyncedChildren.length, 'unsynced stamps):', local.id);
            continue; // Will be pushed on next sync, then cleaned up
          }
          // Safe to CASCADE delete — all children were synced
          await executeSql(`DELETE FROM stamp_cards WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local stamp_card not on server:', local.id);
          }
        }
      }
      for (const card of serverStampCards) {
        await executeSql(
          `INSERT OR REPLACE INTO stamp_cards (id, student_id, user_id, card_number, status, completed_at, created_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [card.id, card.student_id, userId, card.card_number, card.status, card.completed_at, card.created_at, now]
        );
        result.stampCards++;
      }
      if (__DEV__) {
        console.log('[syncService] Pulled stamp_cards:', result.stampCards);
      }
    }

    // 17. Pull stamps (after cards so FK exists — skip if cards pull failed)
    if (stampCardsError) {
      console.warn('[syncService] Skipping stamps pull because stamp_cards pull failed');
    } else {
    const { data: serverStamps, error: stampsError } = await supabase
      .from('stamps')
      .select('id, card_id, student_id, category_id, slot_number, awarded_at')
      .eq('user_id', userId);

    if (stampsError) {
      console.error('[syncService] Pull stamps error:', stampsError);
      result.errors.push(`Stamps: ${stampsError.message}`);
    } else if (serverStamps !== null) {
      const serverIds = new Set(serverStamps.map(s => s.id));
      const localStamps = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM stamps WHERE user_id = ?`,
        [userId]
      );
      for (const local of localStamps) {
        if (!serverIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM stamps WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local stamp not on server:', local.id);
          }
        }
      }
      for (const stamp of serverStamps) {
        await executeSql(
          `INSERT OR REPLACE INTO stamps (id, card_id, student_id, user_id, category_id, slot_number, awarded_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [stamp.id, stamp.card_id, stamp.student_id, userId, stamp.category_id, stamp.slot_number, stamp.awarded_at, now]
        );
        result.stamps++;
      }
      if (__DEV__) {
        console.log('[syncService] Pulled stamps:', result.stamps);
      }
    }
    } // end else (stampCardsError guard)

    // 18. Pull bonus_selections (after cards so FK exists — skip if cards pull failed)
    if (stampCardsError) {
      console.warn('[syncService] Skipping bonus_selections pull because stamp_cards pull failed');
    } else {
    const { data: serverBonusSel, error: bonusSelError } = await supabase
      .from('bonus_selections')
      .select('id, card_id, bonus_id, student_id, selected_at, used_at')
      .eq('user_id', userId);

    if (bonusSelError) {
      console.error('[syncService] Pull bonus_selections error:', bonusSelError);
      result.errors.push(`Bonus Selections: ${bonusSelError.message}`);
    } else if (serverBonusSel !== null) {
      const serverIds = new Set(serverBonusSel.map(bs => bs.id));
      const localBonusSel = await queryAll<{ id: string; synced_at: string | null }>(
        `SELECT id, synced_at FROM bonus_selections WHERE user_id = ?`,
        [userId]
      );
      for (const local of localBonusSel) {
        if (!serverIds.has(local.id) && local.synced_at !== null) {
          await executeSql(`DELETE FROM bonus_selections WHERE id = ?`, [local.id]);
          if (__DEV__) {
            console.log('[syncService] Deleted local bonus_selection not on server:', local.id);
          }
        }
      }
      for (const bs of serverBonusSel) {
        await executeSql(
          `INSERT OR REPLACE INTO bonus_selections (id, card_id, bonus_id, student_id, user_id, selected_at, used_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [bs.id, bs.card_id, bs.bonus_id, bs.student_id, userId, bs.selected_at, bs.used_at, now]
        );
        result.bonusSelections++;
      }
      if (__DEV__) {
        console.log('[syncService] Pulled bonus_selections:', result.bonusSelections);
      }
    }
    } // end else (stampCardsError guard for bonus_selections)

    if (__DEV__) {
      console.log('[syncService] Pull complete:', result);
    }
  } catch (error) {
    console.error('[syncService] Pull failed:', error);
    result.errors.push(error instanceof Error ? error.message : 'Pull failed with unknown error');
  }

  return result;
}
