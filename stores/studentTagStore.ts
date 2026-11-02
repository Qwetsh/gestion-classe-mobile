/**
 * Étiquettes de surlignage des élèves (« Punition en cours », « À interroger »…).
 *
 * Le prof personnalise ses étiquettes (libellé + couleur), puis en glisse une sur un
 * élève du plan pendant la séance : la case prend la couleur. L'étiquette reste jusqu'à
 * ce qu'il la retire (glisser à nouveau la même étiquette, ou la gomme).
 *
 * Données LOCALES au téléphone : jamais synchronisées, jamais affichées sur l'écran
 * projeté /classe.
 */
import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { executeSql, queryAll } from '../services/database/client';

export interface StudentTag {
  id: string;
  user_id: string;
  label: string;
  color: string;
  sort_order: number;
}

/** Palette proposée dans l'éditeur. */
export const TAG_COLORS = [
  '#EF4444', // rouge
  '#F97316', // orange
  '#EAB308', // jaune
  '#22C55E', // vert
  '#06B6D4', // cyan
  '#3B82F6', // bleu
  '#8B5CF6', // violet
  '#EC4899', // rose
  '#64748B', // ardoise
];

const DEFAULT_TAGS: { label: string; color: string }[] = [
  { label: 'Punition en cours', color: '#EF4444' },
  { label: 'À interroger', color: '#3B82F6' },
  { label: 'À surveiller', color: '#F97316' },
  { label: 'Aide / soutien', color: '#8B5CF6' },
];

interface StudentTagState {
  tags: StudentTag[];
  /** student_id → ids d'étiquettes, dans l'ordre de pose. */
  assignments: Record<string, string[]>;
  loadedFor: string | null;

  load: (userId: string) => Promise<void>;
  /** Pose l'étiquette, ou la retire si l'élève l'a déjà. Renvoie true si posée. */
  toggle: (studentId: string, tagId: string) => Promise<boolean>;
  clearStudent: (studentId: string) => Promise<void>;
  addTag: (userId: string, label: string, color: string) => Promise<void>;
  updateTag: (tagId: string, label: string, color: string) => Promise<void>;
  deleteTag: (tagId: string) => Promise<void>;
}

export const useStudentTagStore = create<StudentTagState>((set, get) => ({
  tags: [],
  assignments: {},
  loadedFor: null,

  load: async (userId) => {
    let tags = await queryAll<StudentTag>(
      'SELECT id, user_id, label, color, sort_order FROM student_tags WHERE user_id = ? ORDER BY sort_order, created_at',
      [userId],
    );
    if (tags.length === 0 && get().loadedFor !== userId) {
      // Premier lancement : quelques étiquettes de départ, modifiables
      for (let i = 0; i < DEFAULT_TAGS.length; i++) {
        await executeSql(
          'INSERT INTO student_tags (id, user_id, label, color, sort_order) VALUES (?, ?, ?, ?, ?)',
          [Crypto.randomUUID(), userId, DEFAULT_TAGS[i].label, DEFAULT_TAGS[i].color, i],
        );
      }
      tags = await queryAll<StudentTag>(
        'SELECT id, user_id, label, color, sort_order FROM student_tags WHERE user_id = ? ORDER BY sort_order, created_at',
        [userId],
      );
    }
    const rows = await queryAll<{ student_id: string; tag_id: string }>(
      `SELECT a.student_id, a.tag_id FROM student_tag_assignments a
       JOIN student_tags t ON t.id = a.tag_id
       WHERE t.user_id = ? ORDER BY a.created_at`,
      [userId],
    );
    const assignments: Record<string, string[]> = {};
    for (const r of rows) (assignments[r.student_id] ??= []).push(r.tag_id);
    set({ tags, assignments, loadedFor: userId });
  },

  toggle: async (studentId, tagId) => {
    const current = get().assignments[studentId] ?? [];
    const has = current.includes(tagId);
    if (has) {
      await executeSql('DELETE FROM student_tag_assignments WHERE student_id = ? AND tag_id = ?', [studentId, tagId]);
    } else {
      await executeSql(
        'INSERT OR IGNORE INTO student_tag_assignments (student_id, tag_id, created_at) VALUES (?, ?, ?)',
        [studentId, tagId, new Date().toISOString()],
      );
    }
    const next = has ? current.filter((id) => id !== tagId) : [...current, tagId];
    set((s) => ({ assignments: { ...s.assignments, [studentId]: next } }));
    return !has;
  },

  clearStudent: async (studentId) => {
    await executeSql('DELETE FROM student_tag_assignments WHERE student_id = ?', [studentId]);
    set((s) => ({ assignments: { ...s.assignments, [studentId]: [] } }));
  },

  addTag: async (userId, label, color) => {
    const order = get().tags.reduce((m, t) => Math.max(m, t.sort_order), -1) + 1;
    const tag: StudentTag = { id: Crypto.randomUUID(), user_id: userId, label, color, sort_order: order };
    await executeSql(
      'INSERT INTO student_tags (id, user_id, label, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      [tag.id, userId, label, color, order],
    );
    set((s) => ({ tags: [...s.tags, tag] }));
  },

  updateTag: async (tagId, label, color) => {
    await executeSql('UPDATE student_tags SET label = ?, color = ? WHERE id = ?', [label, color, tagId]);
    set((s) => ({ tags: s.tags.map((t) => (t.id === tagId ? { ...t, label, color } : t)) }));
  },

  deleteTag: async (tagId) => {
    await executeSql('DELETE FROM student_tag_assignments WHERE tag_id = ?', [tagId]);
    await executeSql('DELETE FROM student_tags WHERE id = ?', [tagId]);
    set((s) => {
      const assignments: Record<string, string[]> = {};
      for (const [sid, ids] of Object.entries(s.assignments)) assignments[sid] = ids.filter((id) => id !== tagId);
      return { tags: s.tags.filter((t) => t.id !== tagId), assignments };
    });
  },
}));
