import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

// ============================================
// Types
// ============================================

export interface TpTemplate {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  syncedAt: string | null;
}

export interface TpTemplateCriteria {
  id: string;
  templateId: string;
  label: string;
  maxPoints: number;
  displayOrder: number;
  syncedAt: string | null;
}

export interface TpTemplateWithCriteria extends TpTemplate {
  criteria: TpTemplateCriteria[];
  totalPoints: number;
}

// ============================================
// TP Template CRUD
// ============================================

/**
 * Create a new TP template
 */
export async function createTpTemplate(
  userId: string,
  name: string
): Promise<TpTemplate> {
  const id = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await executeSql(
    `INSERT INTO tp_templates (id, user_id, name, created_at) VALUES (?, ?, ?, ?)`,
    [id, userId, name, createdAt]
  );

  return {
    id,
    userId,
    name,
    createdAt,
    syncedAt: null,
  };
}

/**
 * Get all TP templates for a user
 */
export async function getTpTemplatesByUserId(userId: string): Promise<TpTemplate[]> {
  const rows = await queryAll<{
    id: string;
    user_id: string;
    name: string;
    created_at: string;
    synced_at: string | null;
  }>(
    `SELECT id, user_id, name, created_at, synced_at
     FROM tp_templates
     WHERE user_id = ?
     ORDER BY name ASC`,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  }));
}

/**
 * Get a TP template by ID
 */
export async function getTpTemplateById(templateId: string): Promise<TpTemplate | null> {
  const row = await queryFirst<{
    id: string;
    user_id: string;
    name: string;
    created_at: string;
    synced_at: string | null;
  }>(
    `SELECT id, user_id, name, created_at, synced_at
     FROM tp_templates
     WHERE id = ?`,
    [templateId]
  );

  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at,
    syncedAt: row.synced_at,
  };
}

/**
 * Get a TP template with its criteria
 */
export async function getTpTemplateWithCriteria(templateId: string): Promise<TpTemplateWithCriteria | null> {
  const template = await getTpTemplateById(templateId);
  if (!template) return null;

  const criteria = await getTpTemplateCriteria(templateId);
  const totalPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);

  return {
    ...template,
    criteria,
    totalPoints,
  };
}

/**
 * Get all TP templates with their criteria for a user
 */
export async function getTpTemplatesWithCriteria(userId: string): Promise<TpTemplateWithCriteria[]> {
  const templates = await getTpTemplatesByUserId(userId);

  return Promise.all(
    templates.map(async (template) => {
      const criteria = await getTpTemplateCriteria(template.id);
      const totalPoints = criteria.reduce((sum, c) => sum + c.maxPoints, 0);
      return {
        ...template,
        criteria,
        totalPoints,
      };
    })
  );
}

/**
 * Update a TP template name
 */
export async function updateTpTemplateName(templateId: string, name: string): Promise<void> {
  await executeSql(
    `UPDATE tp_templates SET name = ?, synced_at = NULL WHERE id = ?`,
    [name, templateId]
  );
}

/**
 * Delete a TP template (cascades to criteria)
 */
export async function deleteTpTemplate(templateId: string): Promise<void> {
  // Delete criteria first (SQLite might not support CASCADE)
  await executeSql(`DELETE FROM tp_template_criteria WHERE template_id = ?`, [templateId]);
  await executeSql(`DELETE FROM tp_templates WHERE id = ?`, [templateId]);
}

// ============================================
// TP Template Criteria CRUD
// ============================================

/**
 * Create a new criteria for a template
 */
export async function createTpTemplateCriteria(
  templateId: string,
  label: string,
  maxPoints: number,
  displayOrder: number
): Promise<TpTemplateCriteria> {
  const id = Crypto.randomUUID();

  await executeSql(
    `INSERT INTO tp_template_criteria (id, template_id, label, max_points, display_order)
     VALUES (?, ?, ?, ?, ?)`,
    [id, templateId, label, maxPoints, displayOrder]
  );

  return {
    id,
    templateId,
    label,
    maxPoints,
    displayOrder,
    syncedAt: null,
  };
}

/**
 * Create multiple criteria at once
 */
export async function createTpTemplateCriteriaBatch(
  templateId: string,
  criteria: Array<{ label: string; maxPoints: number }>
): Promise<TpTemplateCriteria[]> {
  const results: TpTemplateCriteria[] = [];

  for (let i = 0; i < criteria.length; i++) {
    const c = criteria[i];
    const result = await createTpTemplateCriteria(templateId, c.label, c.maxPoints, i);
    results.push(result);
  }

  return results;
}

/**
 * Get all criteria for a template
 */
export async function getTpTemplateCriteria(templateId: string): Promise<TpTemplateCriteria[]> {
  const rows = await queryAll<{
    id: string;
    template_id: string;
    label: string;
    max_points: number;
    display_order: number;
    synced_at: string | null;
  }>(
    `SELECT id, template_id, label, max_points, display_order, synced_at
     FROM tp_template_criteria
     WHERE template_id = ?
     ORDER BY display_order ASC`,
    [templateId]
  );

  return rows.map((row) => ({
    id: row.id,
    templateId: row.template_id,
    label: row.label,
    maxPoints: row.max_points,
    displayOrder: row.display_order,
    syncedAt: row.synced_at,
  }));
}

/**
 * Update a criteria
 */
export async function updateTpTemplateCriteria(
  criteriaId: string,
  label: string,
  maxPoints: number
): Promise<void> {
  await executeSql(
    `UPDATE tp_template_criteria SET label = ?, max_points = ?, synced_at = NULL WHERE id = ?`,
    [label, maxPoints, criteriaId]
  );
}

/**
 * Delete a criteria
 */
export async function deleteTpTemplateCriteria(criteriaId: string): Promise<void> {
  await executeSql(`DELETE FROM tp_template_criteria WHERE id = ?`, [criteriaId]);
}

/**
 * Delete all criteria for a template and replace with new ones
 */
export async function replaceTpTemplateCriteria(
  templateId: string,
  criteria: Array<{ label: string; maxPoints: number }>
): Promise<TpTemplateCriteria[]> {
  // Delete existing
  await executeSql(`DELETE FROM tp_template_criteria WHERE template_id = ?`, [templateId]);

  // Mark template as needing sync
  await executeSql(`UPDATE tp_templates SET synced_at = NULL WHERE id = ?`, [templateId]);

  // Create new
  return createTpTemplateCriteriaBatch(templateId, criteria);
}
