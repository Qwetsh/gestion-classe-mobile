import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst, executeTransaction } from './client';
import { DEFAULT_STAMP_CATEGORIES, DEFAULT_BONUSES } from './schema';
import { supabase, isSupabaseConfigured } from '../supabase';
import { firstFreeSlot, CARD_SLOTS } from '../../utils/stampSlots';

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
  const all = await queryAll<StampCategory>(
    `SELECT * FROM stamp_categories WHERE user_id = ? ${where} ORDER BY display_order ASC`,
    [userId]
  );
  // Deduplicate by label (keep first = lowest display_order)
  const seen = new Set<string>();
  return all.filter(cat => {
    if (seen.has(cat.label)) return false;
    seen.add(cat.label);
    return true;
  });
}

/**
 * Fusionne les categories locales en double (meme libelle) vers la premiere.
 * Ne supprime que les doublons jamais pousses au serveur : un doublon deja sur le
 * serveur reviendrait au pull suivant (il est dedoublonne a l'affichage). Les tampons
 * qui referencaient un doublon sont reaffectes avant, sinon la FK fait echouer le DELETE
 * et la liste des categories reste vide.
 */
export async function cleanupDuplicateCategories(userId: string): Promise<number> {
  const all = await queryAll<StampCategory>(
    'SELECT * FROM stamp_categories WHERE user_id = ? ORDER BY display_order ASC, created_at ASC',
    [userId]
  );
  const keeperByLabel = new Map<string, string>();
  let merged = 0;
  for (const cat of all) {
    const keeper = keeperByLabel.get(cat.label);
    if (!keeper) {
      keeperByLabel.set(cat.label, cat.id);
      continue;
    }
    if (cat.synced_at !== null) continue;
    await executeSql('UPDATE stamps SET category_id = ? WHERE category_id = ?', [keeper, cat.id]);
    await executeSql('DELETE FROM stamp_categories WHERE id = ?', [cat.id]);
    merged++;
  }
  if (merged > 0) {
    console.log('[stampRepository] Merged', merged, 'duplicate local categories');
  }
  return merged;
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
  await executeSql(
    `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    [Crypto.randomUUID(), 'stamp_categories', id, new Date().toISOString()]
  );
  await executeSql('UPDATE stamps SET category_id = NULL WHERE category_id = ?', [id]);
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
  await executeSql(
    `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    [Crypto.randomUUID(), 'bonuses', id, new Date().toISOString()]
  );
  await executeSql('UPDATE bonus_selections SET bonus_id = NULL WHERE bonus_id = ?', [id]);
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
    `SELECT * FROM stamp_cards WHERE student_id = ? AND status = 'active' ORDER BY card_number DESC LIMIT 1`,
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

    // Use INSERT OR IGNORE to handle concurrent calls safely
    await executeSql(
      `INSERT OR IGNORE INTO stamp_cards (id, student_id, user_id, card_number, status, created_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [id, studentId, userId, cardNumber, now]
    );

    // Re-fetch to handle case where another call won the race
    card = await queryFirst<StampCard>(
      `SELECT * FROM stamp_cards WHERE student_id = ? AND status = 'active' ORDER BY card_number DESC LIMIT 1`,
      [studentId]
    );

    if (!card) {
      throw new Error('Failed to create active card for student: ' + studentId);
    }
    console.log('[stampRepository] Created card #' + card.card_number + ' for student:', studentId);
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
     INNER JOIN bonus_selections bs ON bs.card_id = sc.id
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

  // Find used slots and pick the first free one
  const usedSlots = await queryAll<{ slot_number: number }>(
    'SELECT slot_number FROM stamps WHERE card_id = ?',
    [card.id]
  );
  const currentCount = usedSlots.length;

  const slotNumber = firstFreeSlot(usedSlots.map(s => s.slot_number));

  if (slotNumber === null) {
    // Card is full locally — check if bonus was already selected on web (RPC completed it)
    // If so, pull the new card from Supabase and retry
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: serverActive } = await supabase
          .from('stamp_cards')
          .select('id, card_number, status, completed_at, created_at')
          .eq('student_id', studentId)
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('card_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (serverActive && serverActive.id !== card.id) {
          // A newer active card exists on server — pull it locally.
          // Jamais d'INSERT OR REPLACE ici : sur stamp_cards, REPLACE = DELETE + INSERT
          // et le DELETE cascade sur les tampons de la carte.
          const now2 = new Date().toISOString();
          await executeSql(
            `UPDATE stamp_cards SET status = 'completed', completed_at = COALESCE(completed_at, ?), synced_at = ? WHERE id = ?`,
            [now2, now2, card.id]
          );
          const localNext = await queryFirst<{ id: string }>('SELECT id FROM stamp_cards WHERE id = ?', [serverActive.id]);
          if (localNext) {
            await executeSql(
              `UPDATE stamp_cards SET status = 'active', completed_at = NULL, synced_at = ? WHERE id = ?`,
              [now2, serverActive.id]
            );
          } else {
            await executeSql(
              `INSERT INTO stamp_cards (id, student_id, user_id, card_number, status, completed_at, created_at, synced_at) VALUES (?, ?, ?, ?, 'active', NULL, ?, ?)`,
              [serverActive.id, studentId, userId, serverActive.card_number, serverActive.created_at, now2]
            );
          }
          // Retry with the new card
          return awardStamp(userId, studentId, categoryId);
        }
      } catch {
        // Network error — fall through to original error
      }
    }
    throw new Error('Carte déjà complète — choisissez le bonus depuis la fiche de l\'élève (ou l\'élève depuis son espace)');
  }

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert stamp — card stays 'active' even at 10/10.
  // Completion is handled by the select_student_bonus RPC when the student picks a bonus.
  const isComplete = currentCount + 1 >= CARD_SLOTS;
  await executeSql(
    `INSERT INTO stamps (id, card_id, student_id, user_id, category_id, slot_number, awarded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, card.id, studentId, userId, categoryId, slotNumber, now]
  );

  const stamp: Stamp = {
    id, card_id: card.id, student_id: studentId, user_id: userId,
    category_id: categoryId, slot_number: slotNumber, awarded_at: now, synced_at: null,
  };

  console.log('[stampRepository] Awarded stamp', slotNumber + '/10 to student:', studentId);

  // Push to Supabase immediately for real-time sync.
  // La carte d'abord (le tampon la reference par FK), en creation seule :
  // status / completed_at sont pilotes par le serveur (RPC de choix du bonus),
  // un upsert complet remettrait 'active' une carte deja terminee.
  if (isSupabaseConfigured && supabase) {
    try {
      let cardOnServer = card.synced_at !== null;
      if (!cardOnServer) {
        const { error: cardErr } = await supabase.from('stamp_cards').upsert({
          id: card.id, student_id: studentId, user_id: userId,
          card_number: card.card_number, status: 'active',
          completed_at: null, created_at: card.created_at,
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (cardErr) {
          // Ex. : la meme carte (eleve, numero) existe deja cote web avec un autre UUID ;
          // la synchro complete fera le remapping.
          console.warn('[stampRepository] Failed to push card to Supabase:', cardErr.message);
        } else {
          await executeSql('UPDATE stamp_cards SET synced_at = ? WHERE id = ?', [now, card.id]);
          cardOnServer = true;
        }
      }

      if (cardOnServer) {
        const { error: stampErr } = await supabase.from('stamps').upsert({
          id, card_id: card.id, student_id: studentId, user_id: userId,
          category_id: categoryId, slot_number: slotNumber, awarded_at: now,
        }, { onConflict: 'id' });
        if (stampErr) {
          console.warn('[stampRepository] Failed to push stamp to Supabase:', stampErr.message);
        } else {
          await executeSql('UPDATE stamps SET synced_at = ? WHERE id = ?', [now, id]);
        }
      }
    } catch (err) {
      console.warn('[stampRepository] Supabase award stamp sync error:', err);
    }
  }

  return { stamp, stampCount: currentCount + 1, cardComplete: isComplete, cardNumber: card.card_number };
}

/**
 * Delete a specific stamp by ID
 */
export async function deleteStamp(stampId: string): Promise<void> {
  await deleteStampEverywhere(stampId);
}

/**
 * Supprime un tampon en local, puis sur le serveur.
 * La suppression distante est d'abord mise en attente (pending_deletions) :
 * hors ligne, la synchro la propagera et le pull ne fera pas revenir le tampon.
 * On la met toujours en attente, meme pour un tampon marque non synchronise,
 * car il peut deja etre arrive sur le serveur (timeout apres ecriture).
 */
async function deleteStampEverywhere(stampId: string): Promise<void> {
  await executeSql(
    `INSERT OR IGNORE INTO pending_deletions (id, table_name, record_id, created_at) VALUES (?, ?, ?, ?)`,
    [Crypto.randomUUID(), 'stamps', stampId, new Date().toISOString()]
  );
  await executeSql('DELETE FROM stamps WHERE id = ?', [stampId]);
  console.log('[stampRepository] Deleted stamp locally:', stampId);

  // Tentative immediate pour que l'eleve le voie tout de suite
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from('stamps').delete().eq('id', stampId);
      if (error) {
        console.warn('[stampRepository] Failed to delete stamp on Supabase (will retry at sync):', error.message);
      } else {
        await executeSql(`DELETE FROM pending_deletions WHERE table_name = 'stamps' AND record_id = ?`, [stampId]);
      }
    } catch (err) {
      console.warn('[stampRepository] Supabase delete stamp error (will retry at sync):', err);
    }
  }
}

/**
 * Remove the last stamp from a student's active card (undo)
 */
export async function removeLastStamp(studentId: string): Promise<void> {
  const card = await queryFirst<StampCard>(
    `SELECT * FROM stamp_cards WHERE student_id = ? AND status = 'active' ORDER BY card_number DESC LIMIT 1`,
    [studentId]
  );
  if (!card) return;

  // Le dernier tampon attribue (pas le slot le plus haut : un trou comble a un slot bas)
  const lastStamp = await queryFirst<{ id: string }>(
    `SELECT id FROM stamps WHERE card_id = ? ORDER BY awarded_at DESC, slot_number DESC LIMIT 1`,
    [card.id]
  );
  if (!lastStamp) return;

  await deleteStampEverywhere(lastStamp.id);
  console.log('[stampRepository] Removed last stamp for student:', studentId);
}

// ============================================
// Bonus Selections
// ============================================

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

  // Sync to Supabase immediately so student sees "✓" in real-time
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('bonus_selections')
        .update({ used_at: now })
        .eq('id', selectionId);
      if (error) {
        console.warn('[stampRepository] Failed to sync markBonusUsed:', error.message);
      } else {
        await executeSql('UPDATE bonus_selections SET synced_at = ? WHERE id = ?', [now, selectionId]);
      }
    } catch (err) {
      console.warn('[stampRepository] Supabase markBonusUsed error:', err);
    }
  }
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
