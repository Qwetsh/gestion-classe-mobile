import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';
import { GroupConfig } from '../../types';

export interface GroupTemplateRow {
  id: string;
  user_id: string;
  class_id: string;
  name: string;
  groups_config: string; // JSON string
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  is_deleted: number;
}

/**
 * Create a new group template
 */
export async function createGroupTemplate(
  userId: string,
  classId: string,
  name: string,
  groupsConfig: GroupConfig[]
): Promise<GroupTemplateRow> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  const configJson = JSON.stringify(groupsConfig);

  await executeSql(
    `INSERT INTO group_templates (id, user_id, class_id, name, groups_config, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, classId, name, configJson, now]
  );

  if (__DEV__) {
    console.log('[groupTemplateRepository] Created template:', id, name);
  }

  return {
    id,
    user_id: userId,
    class_id: classId,
    name,
    groups_config: configJson,
    created_at: now,
    updated_at: null,
    synced_at: null,
    is_deleted: 0,
  };
}

/**
 * Get all templates for a class
 */
export async function getTemplatesByClassId(classId: string): Promise<GroupTemplateRow[]> {
  return queryAll<GroupTemplateRow>(
    `SELECT * FROM group_templates
     WHERE class_id = ? AND is_deleted = 0
     ORDER BY created_at DESC`,
    [classId]
  );
}

/**
 * Get a template by ID
 */
export async function getTemplateById(id: string): Promise<GroupTemplateRow | null> {
  return queryFirst<GroupTemplateRow>(
    `SELECT * FROM group_templates WHERE id = ? AND is_deleted = 0`,
    [id]
  );
}

/**
 * Update a template
 */
export async function updateGroupTemplate(
  id: string,
  name: string,
  groupsConfig: GroupConfig[]
): Promise<GroupTemplateRow | null> {
  const now = new Date().toISOString();
  const configJson = JSON.stringify(groupsConfig);

  await executeSql(
    `UPDATE group_templates
     SET name = ?, groups_config = ?, updated_at = ?, synced_at = NULL
     WHERE id = ?`,
    [name, configJson, now, id]
  );

  if (__DEV__) {
    console.log('[groupTemplateRepository] Updated template:', id);
  }

  return getTemplateById(id);
}

/**
 * Soft delete a template
 */
export async function deleteGroupTemplate(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE group_templates
     SET is_deleted = 1, updated_at = ?, synced_at = NULL
     WHERE id = ?`,
    [now, id]
  );

  if (__DEV__) {
    console.log('[groupTemplateRepository] Deleted template:', id);
  }
}

/**
 * Get unsynced templates
 */
export async function getUnsyncedTemplates(userId: string): Promise<GroupTemplateRow[]> {
  return queryAll<GroupTemplateRow>(
    `SELECT * FROM group_templates
     WHERE user_id = ? AND synced_at IS NULL`,
    [userId]
  );
}

/**
 * Mark template as synced
 */
export async function markTemplateSynced(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE group_templates SET synced_at = ? WHERE id = ?`,
    [now, id]
  );
}
