import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';
import { DEFAULT_STAMP_CATEGORIES, DEFAULT_BONUSES } from './schema';

// ============================================
// Types
// ============================================

export interface StampCategory {
  id: string;
  user_id: string;
  label: string;
  icon: string;
  color: string;
  display_order: number;
  is_active: number; // SQLite boolean
  created_at: string;
  synced_at: string | null;
}

export interface Bonus {
  id: string;
  user_id: string;
  label: string;
  display_order: number;
  is_active: number;
  created_at: string;
  synced_at: string | null;
}

export interface StampCard {
  id: string;
  student_id: string;
  user_id: string;
  card_number: number;
  status: 'active' | 'completed';
  completed_at: string | null;
  created_at: string;
  synced_at: string | null;
}

export interface Stamp {
  id: string;
  card_id: string;
  student_id: string;
  user_id: string;
  category_id: string | null;
  slot_number: number;
  awarded_at: string;
  synced_at: string | null;
}

export interface BonusSelection {
  id: string;
  card_id: string;
  bonus_id: string | null;
  student_id: string;
  user_id: string;
  selected_at: string;
  used_at: string | null;
  synced_at: string | null;
}

// Computed types for UI
export interface StampWithCategory extends Stamp {
  category_label: string | null;
  category_icon: string | null;
  category_color: string | null;
}

export interface StampCardWithStamps extends StampCard {
  stamps: StampWithCategory[];
  stamp_count: number;
}

export interface CompletedCardSummary extends StampCard {
  bonus_label: string | null;
  bonus_used: boolean;
  selected_at: string | null;
  used_at: string | null;
}

// ============================================
// Seed default data
// ============================================

/**
 * Seed default stamp categories and bonuses for a user (idempotent)
 */
export async function seedDefaultStampData(userId: string): Promise<void> {
  // Check if categories already exist
  const existing = await queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM stamp_categories WHERE user_id = ?',
    [userId]
  );

  if (existing && existing.count > 0) {
    console.log('[stampRepository] Default data already seeded');
    return;
  }

  console.log('[stampRepository] Seeding default stamp categories and bonuses');
  const now = new Date().toISOString();

  // Seed categories
  for (let i = 0; i < DEFAULT_STAMP_CATEGORIES.length; i++) {
    const cat = DEFAULT_STAMP_CATEGORIES[i];
    await executeSql(
      `INSERT INTO stamp_categories (id, user_id, label, icon, color, display_order, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [Crypto.randomUUID(), userId, cat.label, cat.icon, cat.color, i, now]
    );
  }

  // Seed bonuses
  for (let i = 0; i < DEFAULT_BONUSES.length; i++) {
    await executeSql(
      `INSERT INTO bonuses (id, user_id, label, display_order, is_active, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
      [Crypto.randomUUID(), userId, DEFAULT_BONUSES[i], i, now]
    );
  }

  console.log('[stampRepository] Seeded', DEFAULT_STAMP_CATEGORIES.length, 'categories and', DEFAULT_BONUSES.length, 'bonuses');
}

// ============================================
// Stamp Categories CRUD
// ============================================

export async function getStampCategories(userId: string, activeOnly = true): Promise<StampCategory[]> {
  const where = activeOnly ? 'AND is_active = 1' : '';
  return queryAll<StampCategory>(
    `SELECT * FROM stamp_categories WHERE user_id = ? ${where} ORDER BY display_order ASC`,
    [userId]
  );
}

export async function createStampCategory(
  userId: string,
  label: string,
  icon: string,
  color: string,
  displayOrder: number
): Promise<StampCategory> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO stamp_categories (id, user_id, label, icon, color, display_order, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    [id, userId, label, icon, color, displayOrder, now]
  );

  return { id, user_id: userId, label, icon, color, display_order: displayOrder, is_active: 1, created_at: now, synced_at: null };
}

export async function updateStampCategory(
  id: string,
  updates: { label?: string; icon?: string; color?: string; display_order?: number; is_active?: number }
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label); }
  if (updates.icon !== undefined) { fields.push('icon = ?'); values.push(updates.icon); }
  if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color); }
  if (updates.display_order !== undefined) { fields.push('display_order = ?'); values.push(updates.display_order); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }

  fields.push('synced_at = NULL');
  values.push(id);

  await executeSql(
    `UPDATE stamp_categories SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function deleteStampCategory(id: string): Promise<void> {
  await executeSql('DELETE FROM stamp_categories WHERE id = ?', [id]);
}

// ============================================
// Bonuses CRUD
// ============================================

export async function getBonuses(userId: string, activeOnly = true): Promise<Bonus[]> {
  const where = activeOnly ? 'AND is_active = 1' : '';
  return queryAll<Bonus>(
    `SELECT * FROM bonuses WHERE user_id = ? ${where} ORDER BY display_order ASC`,
    [userId]
  );
}

export async function createBonus(userId: string, label: string, displayOrder: number): Promise<Bonus> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO bonuses (id, user_id, label, display_order, is_active, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
    [id, userId, label, displayOrder, now]
  );

  return { id, user_id: userId, label, display_order: displayOrder, is_active: 1, created_at: now, synced_at: null };
}

export async function updateBonus(
  id: string,
  updates: { label?: string; display_order?: number; is_active?: number }
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.label !== undefined) { fields.push('label = ?'); values.push(updates.label); }
  if (updates.display_order !== undefined) { fields.push('display_order = ?'); values.push(updates.display_order); }
  if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active); }

  fields.push('synced_at = NULL');
  values.push(id);

  await executeSql(
    `UPDATE bonuses SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

export async function deleteBonus(id: string): Promise<void> {
  await executeSql('DELETE FROM bonuses WHERE id = ?', [id]);
}

// ============================================
// Stamp Cards CRUD
// ============================================

/**
 * Get or create the active stamp card for a student
 */
export async function getOrCreateActiveCard(userId: string, studentId: string): Promise<StampCard> {
  let card = await queryFirst<StampCard>(
    `SELECT * FROM stamp_cards WHERE student_id = ? AND status = 'active' LIMIT 1`,
    [studentId]
  );

  if (!card) {
    // Get the next card number
    const last = await queryFirst<{ max_num: number | null }>(
      'SELECT MAX(card_number) as max_num FROM stamp_cards WHERE student_id = ?',
      [studentId]
    );
    const cardNumber = (last?.max_num || 0) + 1;

    const id = Crypto.randomUUID();
    const now = new Date().toISOString();

    await executeSql(
      `INSERT INTO stamp_cards (id, student_id, user_id, card_number, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [id, studentId, userId, cardNumber, now]
    );

    card = { id, student_id: studentId, user_id: userId, card_number: cardNumber, status: 'active', completed_at: null, created_at: now, synced_at: null };
    console.log('[stampRepository] Created card #' + cardNumber + ' for student:', studentId);
  }

  return card;
}

/**
 * Get active card with stamps for a student
 */
export async function getActiveCardWithStamps(userId: string, studentId: string): Promise<StampCardWithStamps | null> {
  const card = await getOrCreateActiveCard(userId, studentId);

  const stamps = await queryAll<StampWithCategory>(
    `SELECT s.*, sc.label as category_label, sc.icon as category_icon, sc.color as category_color
     FROM stamps s
     LEFT JOIN stamp_categories sc ON sc.id = s.category_id
     WHERE s.card_id = ?
     ORDER BY s.slot_number ASC`,
    [card.id]
  );

  return {
    ...card,
    stamps,
    stamp_count: stamps.length,
  };
}

/**
 * Get completed cards for a student (history)
 */
export async function getCompletedCards(studentId: string): Promise<CompletedCardSummary[]> {
  return queryAll<CompletedCardSummary>(
    `SELECT sc.*, b.label as bonus_label,
            CASE WHEN bs.used_at IS NOT NULL THEN 1 ELSE 0 END as bonus_used,
            bs.selected_at, bs.used_at
     FROM stamp_cards sc
     LEFT JOIN bonus_selections bs ON bs.card_id = sc.id
     LEFT JOIN bonuses b ON b.id = bs.bonus_id
     WHERE sc.student_id = ? AND sc.status = 'completed'
     ORDER BY sc.card_number DESC`,
    [studentId]
  );
}

/**
 * Get all active cards for a user's students (overview)
 */
export async function getAllActiveCards(userId: string): Promise<(StampCard & { stamp_count: number })[]> {
  return queryAll<StampCard & { stamp_count: number }>(
    `SELECT sc.*, (SELECT COUNT(*) FROM stamps WHERE card_id = sc.id) as stamp_count
     FROM stamp_cards sc
     WHERE sc.user_id = ? AND sc.status = 'active'
     ORDER BY sc.student_id`,
    [userId]
  );
}

// ============================================
// Stamps (attribution)
// ============================================

/**
 * Award a stamp to a student
 * Returns the stamp and whether the card is now complete
 */
export async function awardStamp(
  userId: string,
  studentId: string,
  categoryId: string
): Promise<{ stamp: Stamp; stampCount: number; cardComplete: boolean; cardNumber: number }> {
  const card = await getOrCreateActiveCard(userId, studentId);

  // Count current stamps
  const countResult = await queryFirst<{ count: number }>(
    'SELECT COUNT(*) as count FROM stamps WHERE card_id = ?',
    [card.id]
  );
  const currentCount = countResult?.count || 0;

  if (currentCount >= 10) {
    throw new Error('Carte déjà complète');
  }

  const slotNumber = currentCount + 1;
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO stamps (id, card_id, student_id, user_id, category_id, slot_number, awarded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, card.id, studentId, userId, categoryId, slotNumber, now]
  );

  const stamp: Stamp = {
    id, card_id: card.id, student_id: studentId, user_id: userId,
    category_id: categoryId, slot_number: slotNumber, awarded_at: now, synced_at: null,
  };

  const cardComplete = slotNumber === 10;
  console.log('[stampRepository] Awarded stamp', slotNumber + '/10 to student:', studentId);

  return { stamp, stampCount: slotNumber, cardComplete, cardNumber: card.card_number };
}

/**
 * Remove the last stamp from a student's active card (undo)
 */
export async function removeLastStamp(studentId: string): Promise<void> {
  const card = await queryFirst<StampCard>(
    `SELECT * FROM stamp_cards WHERE student_id = ? AND status = 'active' LIMIT 1`,
    [studentId]
  );
  if (!card) return;

  await executeSql(
    `DELETE FROM stamps WHERE card_id = ? AND slot_number = (
      SELECT MAX(slot_number) FROM stamps WHERE card_id = ?
    )`,
    [card.id, card.id]
  );
  console.log('[stampRepository] Removed last stamp for student:', studentId);
}

// ============================================
// Bonus Selections
// ============================================

/**
 * Select a bonus for a completed card (called by student via web)
 * This is synced from Supabase — the student interacts via RPC
 */
export async function selectBonus(
  cardId: string,
  bonusId: string,
  studentId: string,
  userId: string
): Promise<BonusSelection> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  // Mark card as completed
  await executeSql(
    `UPDATE stamp_cards SET status = 'completed', completed_at = ?, synced_at = NULL WHERE id = ?`,
    [now, cardId]
  );

  // Insert bonus selection
  await executeSql(
    `INSERT INTO bonus_selections (id, card_id, bonus_id, student_id, user_id, selected_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, cardId, bonusId, studentId, userId, now]
  );

  console.log('[stampRepository] Bonus selected for card:', cardId);

  return { id, card_id: cardId, bonus_id: bonusId, student_id: studentId, user_id: userId, selected_at: now, used_at: null, synced_at: null };
}

/**
 * Mark a bonus as used (teacher validates)
 */
export async function markBonusUsed(selectionId: string): Promise<void> {
  const now = new Date().toISOString();
  await executeSql(
    `UPDATE bonus_selections SET used_at = ?, synced_at = NULL WHERE id = ?`,
    [now, selectionId]
  );
  console.log('[stampRepository] Bonus marked as used:', selectionId);
}

/**
 * Get pending bonus selections for a user (teacher view)
 */
export async function getPendingBonusSelections(userId: string): Promise<(BonusSelection & { bonus_label: string; student_pseudo: string; card_number: number })[]> {
  return queryAll(
    `SELECT bs.*, b.label as bonus_label, st.pseudo as student_pseudo, sc.card_number
     FROM bonus_selections bs
     LEFT JOIN bonuses b ON b.id = bs.bonus_id
     LEFT JOIN students st ON st.id = bs.student_id
     LEFT JOIN stamp_cards sc ON sc.id = bs.card_id
     WHERE bs.user_id = ? AND bs.used_at IS NULL
     ORDER BY bs.selected_at ASC`,
    [userId]
  );
}

// ============================================
// Sync helpers
// ============================================

export async function getUnsyncedStampCategories(): Promise<StampCategory[]> {
  return queryAll<StampCategory>('SELECT * FROM stamp_categories WHERE synced_at IS NULL');
}

export async function getUnsyncedBonuses(): Promise<Bonus[]> {
  return queryAll<Bonus>('SELECT * FROM bonuses WHERE synced_at IS NULL');
}

export async function getUnsyncedStampCards(): Promise<StampCard[]> {
  return queryAll<StampCard>('SELECT * FROM stamp_cards WHERE synced_at IS NULL');
}

export async function getUnsyncedStamps(): Promise<Stamp[]> {
  return queryAll<Stamp>('SELECT * FROM stamps WHERE synced_at IS NULL');
}

export async function getUnsyncedBonusSelections(): Promise<BonusSelection[]> {
  return queryAll<BonusSelection>('SELECT * FROM bonus_selections WHERE synced_at IS NULL');
}

export async function markStampCategoriesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE stamp_categories SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
}

export async function markBonusesSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE bonuses SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
}

export async function markStampCardsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE stamp_cards SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
}

export async function markStampsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE stamps SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
}

export async function markBonusSelectionsSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  await executeSql(`UPDATE bonus_selections SET synced_at = ? WHERE id IN (${placeholders})`, [now, ...ids]);
}
