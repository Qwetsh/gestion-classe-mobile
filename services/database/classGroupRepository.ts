/**
 * Groupes de classe (demi-groupes durables) : groupes, appartenance, plans par groupe.
 *
 * A ne PAS confondre avec les groupes de TP (groupSessionRepository : session_groups,
 * session_group_members) qui sont ephemeres et notes.
 *
 * Regles :
 *  - Toute ecriture locale remet synced_at a NULL (push a la prochaine synchro).
 *  - Toute suppression d'une ligne passe par pending_deletions, sinon le pull la ressuscite.
 *  - Jamais d'INSERT OR REPLACE sur class_groups : REPLACE = DELETE + INSERT et la cascade
 *    effacerait membres et plans (voir upsertLocalRow dans syncService).
 */
import * as Crypto from 'expo-crypto';
import { executeSql, executeTransaction, queryAll, queryFirst } from './client';
import type { Positions } from './classRoomPlanRepository';
import type { ClassGroup, ClassGroupMember, ClassGroupPlan } from '../../types';

export type { ClassGroup, ClassGroupMember, ClassGroupPlan };

interface ClassGroupPlanRow {
  id: string;
  class_id: string;
  room_id: string;
  group_id: string;
  positions: string; // JSON
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
}

function parsePositions(json: string): Positions {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function rowToPlan(row: ClassGroupPlanRow): ClassGroupPlan {
  return { ...row, positions: parsePositions(row.positions) };
}

async function queuePendingDeletion(table: 'class_groups' | 'class_group_members' | 'class_group_plans', recordId: string): Promise<void> {
  await executeSql(
    `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    [Crypto.randomUUID(), table, recordId, new Date().toISOString()]
  );
}

// ============================================
// Groupes
// ============================================

export async function createClassGroup(
  userId: string,
  classId: string,
  name: string,
  options: { color?: string | null; sortOrder?: number } = {}
): Promise<ClassGroup> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const trimmed = name.trim();

  let sortOrder = options.sortOrder;
  if (sortOrder === undefined) {
    const max = await queryFirst<{ m: number | null }>(
      `SELECT MAX(sort_order) as m FROM class_groups WHERE class_id = ?`,
      [classId]
    );
    sortOrder = (max?.m ?? -1) + 1;
  }

  await executeSql(
    `INSERT INTO class_groups (id, user_id, class_id, name, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, classId, trimmed, options.color ?? null, sortOrder, now]
  );

  return {
    id,
    user_id: userId,
    class_id: classId,
    name: trimmed,
    color: options.color ?? null,
    sort_order: sortOrder,
    created_at: now,
    updated_at: null,
    synced_at: null,
  };
}

export async function getClassGroupsByClassId(classId: string): Promise<ClassGroup[]> {
  return queryAll<ClassGroup>(
    `SELECT * FROM class_groups WHERE class_id = ? ORDER BY sort_order ASC, name ASC`,
    [classId]
  );
}

export async function getClassGroupsByUserId(userId: string): Promise<ClassGroup[]> {
  return queryAll<ClassGroup>(
    `SELECT * FROM class_groups WHERE user_id = ? ORDER BY class_id, sort_order ASC, name ASC`,
    [userId]
  );
}

export async function getClassGroupById(id: string): Promise<ClassGroup | null> {
  return queryFirst<ClassGroup>(`SELECT * FROM class_groups WHERE id = ?`, [id]);
}

export async function updateClassGroup(
  id: string,
  updates: { name?: string; color?: string | null; sort_order?: number }
): Promise<ClassGroup | null> {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name.trim()); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(updates.sort_order); }
  if (fields.length === 0) return getClassGroupById(id);

  fields.push('updated_at = ?', 'synced_at = NULL');
  values.push(new Date().toISOString(), id);

  await executeSql(`UPDATE class_groups SET ${fields.join(', ')} WHERE id = ?`, values);
  return getClassGroupById(id);
}

/**
 * Supprime un groupe. Membres et plans de groupe partent en CASCADE (local et serveur).
 * Les seances passees du groupe redeviennent "classe entiere" (SET NULL cote serveur,
 * reflete ici pour rester coherent hors ligne).
 */
export async function deleteClassGroup(id: string): Promise<void> {
  await queuePendingDeletion('class_groups', id);
  await executeSql(`UPDATE sessions SET group_id = NULL WHERE group_id = ?`, [id]);
  await executeSql(`DELETE FROM class_groups WHERE id = ?`, [id]);
}

// ============================================
// Appartenance
// ============================================

export async function getMembersByClassId(classId: string): Promise<ClassGroupMember[]> {
  return queryAll<ClassGroupMember>(
    `SELECT m.* FROM class_group_members m
     JOIN class_groups g ON g.id = m.group_id
     WHERE g.class_id = ?`,
    [classId]
  );
}

export async function getMemberIds(groupId: string): Promise<string[]> {
  const rows = await queryAll<{ student_id: string }>(
    `SELECT student_id FROM class_group_members WHERE group_id = ?`,
    [groupId]
  );
  return rows.map(r => r.student_id);
}

/** Groupes (de la classe) auxquels appartient un eleve. */
export async function getGroupIdsForStudent(classId: string, studentId: string): Promise<string[]> {
  const rows = await queryAll<{ group_id: string }>(
    `SELECT m.group_id FROM class_group_members m
     JOIN class_groups g ON g.id = m.group_id
     WHERE g.class_id = ? AND m.student_id = ?`,
    [classId, studentId]
  );
  return rows.map(r => r.group_id);
}

export async function addMember(groupId: string, studentId: string): Promise<ClassGroupMember> {
  const existing = await queryFirst<ClassGroupMember>(
    `SELECT * FROM class_group_members WHERE group_id = ? AND student_id = ?`,
    [groupId, studentId]
  );
  if (existing) return existing;

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await executeSql(
    `INSERT INTO class_group_members (id, group_id, student_id, created_at) VALUES (?, ?, ?, ?)`,
    [id, groupId, studentId, now]
  );
  // Une suppression en attente du meme couple (retire puis remis hors ligne) ne doit pas
  // annuler cet ajout au prochain flush : l'id est neuf, rien a nettoyer.
  return { id, group_id: groupId, student_id: studentId, created_at: now, synced_at: null };
}

export async function removeMember(groupId: string, studentId: string): Promise<void> {
  const existing = await queryFirst<{ id: string; synced_at: string | null }>(
    `SELECT id, synced_at FROM class_group_members WHERE group_id = ? AND student_id = ?`,
    [groupId, studentId]
  );
  if (!existing) return;
  if (existing.synced_at !== null) {
    await queuePendingDeletion('class_group_members', existing.id);
  }
  await executeSql(`DELETE FROM class_group_members WHERE id = ?`, [existing.id]);
}

/**
 * Transvasement EXCLUSIF : l'eleve quitte tous les groupes de la classe et rejoint
 * `toGroupId` (null = "non affecte"). C'est LE geste de la vue Repartition.
 */
export async function moveStudent(
  classId: string,
  studentId: string,
  toGroupId: string | null
): Promise<void> {
  const current = await getGroupIdsForStudent(classId, studentId);
  for (const gid of current) {
    if (gid !== toGroupId) await removeMember(gid, studentId);
  }
  if (toGroupId && !current.includes(toGroupId)) {
    await addMember(toGroupId, studentId);
  }
}

/** Echange 1 <-> 1 : A prend la place de B et inversement (exclusif). */
export async function swapStudents(
  classId: string,
  studentA: string,
  groupA: string | null,
  studentB: string,
  groupB: string | null
): Promise<void> {
  await moveStudent(classId, studentA, groupB);
  await moveStudent(classId, studentB, groupA);
}

/**
 * Remplace l'effectif d'un groupe (repartition automatique, import depuis un plan de salle).
 * Ajoute les manquants, retire les autres, ne touche pas a ceux deja presents.
 */
export async function replaceMembers(groupId: string, studentIds: string[]): Promise<void> {
  const wanted = new Set(studentIds);
  const current = await getMemberIds(groupId);
  for (const sid of current) {
    if (!wanted.has(sid)) await removeMember(groupId, sid);
  }
  for (const sid of wanted) {
    if (!current.includes(sid)) await addMember(groupId, sid);
  }
}

// ============================================
// Plans par groupe
// ============================================

export async function getGroupPlan(
  classId: string,
  roomId: string,
  groupId: string
): Promise<ClassGroupPlan | null> {
  const row = await queryFirst<ClassGroupPlanRow>(
    `SELECT * FROM class_group_plans WHERE class_id = ? AND room_id = ? AND group_id = ?`,
    [classId, roomId, groupId]
  );
  return row ? rowToPlan(row) : null;
}

export async function getGroupPlansByClassId(classId: string): Promise<ClassGroupPlan[]> {
  const rows = await queryAll<ClassGroupPlanRow>(
    `SELECT * FROM class_group_plans WHERE class_id = ?`,
    [classId]
  );
  return rows.map(rowToPlan);
}

/** Cree ou met a jour le plan (classe, salle, groupe). */
export async function saveGroupPlanPositions(
  classId: string,
  roomId: string,
  groupId: string,
  positions: Positions
): Promise<ClassGroupPlan> {
  const now = new Date().toISOString();
  const json = JSON.stringify(positions);
  const existing = await getGroupPlan(classId, roomId, groupId);

  if (existing) {
    await executeSql(
      `UPDATE class_group_plans SET positions = ?, updated_at = ?, synced_at = NULL WHERE id = ?`,
      [json, now, existing.id]
    );
    return { ...existing, positions, updated_at: now, synced_at: null };
  }

  const id = Crypto.randomUUID();
  await executeSql(
    `INSERT INTO class_group_plans (id, class_id, room_id, group_id, positions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, classId, roomId, groupId, json, now, now]
  );
  return { id, class_id: classId, room_id: roomId, group_id: groupId, positions, created_at: now, updated_at: now, synced_at: null };
}

export async function deleteGroupPlan(classId: string, roomId: string, groupId: string): Promise<void> {
  const existing = await getGroupPlan(classId, roomId, groupId);
  if (!existing) return;
  if (existing.synced_at !== null) {
    await queuePendingDeletion('class_group_plans', existing.id);
  }
  await executeSql(`DELETE FROM class_group_plans WHERE id = ?`, [existing.id]);
}

// ============================================
// Sync helpers
// ============================================

export async function getUnsyncedClassGroups(): Promise<ClassGroup[]> {
  return queryAll<ClassGroup>(`SELECT * FROM class_groups WHERE synced_at IS NULL`);
}

export async function getUnsyncedClassGroupMembers(): Promise<ClassGroupMember[]> {
  return queryAll<ClassGroupMember>(`SELECT * FROM class_group_members WHERE synced_at IS NULL`);
}

export async function getUnsyncedClassGroupPlans(): Promise<ClassGroupPlan[]> {
  const rows = await queryAll<ClassGroupPlanRow>(`SELECT * FROM class_group_plans WHERE synced_at IS NULL`);
  return rows.map(rowToPlan);
}

export async function markSynced(
  table: 'class_groups' | 'class_group_members' | 'class_group_plans',
  ids: string[],
  syncedAt: string
): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE ${table} SET synced_at = ? WHERE id IN (${placeholders})`, [syncedAt, ...ids]);
}

/**
 * Fait pointer un membre local vers l'id serveur (meme couple (groupe, eleve) cree des deux
 * cotes). UPDATE en place, pas de DELETE : rien a purger dans pending_deletions.
 */
export async function remapMemberId(localId: string, serverId: string): Promise<void> {
  await executeTransaction([
    { sql: 'PRAGMA defer_foreign_keys = ON' },
    { sql: 'UPDATE class_group_members SET id = ? WHERE id = ?', params: [serverId, localId] },
  ]);
}
