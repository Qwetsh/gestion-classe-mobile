/**
 * Store des groupes de classe (demi-groupes durables). Distinct de groupSessionStore (TP).
 * Les donnees sont petites : chaque mutation recharge la classe depuis SQLite.
 */
import { create } from 'zustand';
import {
  createClassGroup,
  getClassGroupsByClassId,
  getMembersByClassId,
  updateClassGroup,
  deleteClassGroup,
  moveStudent as moveStudentDb,
  swapStudents as swapStudentsDb,
  replaceMembers,
  getPlan,
  type ClassGroup,
  type ClassGroupMember,
} from '../services/database';
import { autoSplit, sortClassGroups, type AutoSplitMode } from '../utils/sessionRoster';
import { nextClassGroupColorKey } from '../constants/classGroupColors';

interface StudentLike {
  id: string;
  pseudo: string;
}

interface ClassGroupState {
  groupsByClass: Record<string, ClassGroup[]>;
  membersByClass: Record<string, ClassGroupMember[]>;
  isLoading: boolean;
  error: string | null;
}

interface ClassGroupActions {
  loadForClass: (classId: string) => Promise<void>;
  createGroup: (userId: string, classId: string, name: string, color?: string | null) => Promise<ClassGroup | null>;
  updateGroup: (classId: string, groupId: string, updates: { name?: string; color?: string | null; sort_order?: number }) => Promise<void>;
  deleteGroup: (classId: string, groupId: string) => Promise<void>;
  /** Transvasement exclusif : quitte tous les groupes de la classe, rejoint toGroupId (null = non affecte). */
  moveStudent: (classId: string, studentId: string, toGroupId: string | null) => Promise<void>;
  moveStudents: (classId: string, studentIds: string[], toGroupId: string | null) => Promise<void>;
  swapStudents: (classId: string, studentA: string, groupA: string | null, studentB: string, groupB: string | null) => Promise<void>;
  /** Vide et re-remplit les groupes existants (dans l'ordre) avec les eleves donnes. */
  applyAutoSplit: (classId: string, students: StudentLike[], mode: AutoSplitMode) => Promise<void>;
  /** Cree "Groupe 1" / "Groupe 2" et repartit par ordre alphabetique. */
  createDefaultPair: (userId: string, classId: string, students: StudentLike[]) => Promise<void>;
  /** Remplit un groupe avec les eleves places dans un plan de salle existant. */
  fillGroupFromRoomPlan: (classId: string, groupId: string, roomId: string) => Promise<number>;
  /** Envoie les non-affectes vers le groupe le moins nombreux, un par un. */
  balance: (classId: string, students: StudentLike[]) => Promise<number>;
  clearError: () => void;
  reset: () => void;
}

type ClassGroupStore = ClassGroupState & ClassGroupActions;

const initialState: ClassGroupState = {
  groupsByClass: {},
  membersByClass: {},
  isLoading: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const useClassGroupStore = create<ClassGroupStore>((set, get) => ({
  ...initialState,

  loadForClass: async (classId) => {
    set({ isLoading: true, error: null });
    try {
      const [groups, members] = await Promise.all([
        getClassGroupsByClassId(classId),
        getMembersByClassId(classId),
      ]);
      set(state => ({
        groupsByClass: { ...state.groupsByClass, [classId]: sortClassGroups(groups) },
        membersByClass: { ...state.membersByClass, [classId]: members },
        isLoading: false,
      }));
    } catch (error) {
      console.error('[classGroupStore] loadForClass failed:', error);
      set({ error: errorMessage(error, 'Erreur lors du chargement des groupes'), isLoading: false });
    }
  },

  createGroup: async (userId, classId, name, color) => {
    try {
      const existing = get().groupsByClass[classId] ?? [];
      const colorKey = color ?? nextClassGroupColorKey(existing.map(g => g.color));
      const group = await createClassGroup(userId, classId, name, { color: colorKey });
      await get().loadForClass(classId);
      return group;
    } catch (error) {
      console.error('[classGroupStore] createGroup failed:', error);
      set({ error: errorMessage(error, 'Erreur lors de la creation du groupe') });
      return null;
    }
  },

  updateGroup: async (classId, groupId, updates) => {
    try {
      await updateClassGroup(groupId, updates);
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] updateGroup failed:', error);
      set({ error: errorMessage(error, 'Erreur lors de la modification du groupe') });
    }
  },

  deleteGroup: async (classId, groupId) => {
    try {
      await deleteClassGroup(groupId);
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] deleteGroup failed:', error);
      set({ error: errorMessage(error, 'Erreur lors de la suppression du groupe') });
    }
  },

  moveStudent: async (classId, studentId, toGroupId) => {
    try {
      await moveStudentDb(classId, studentId, toGroupId);
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] moveStudent failed:', error);
      set({ error: errorMessage(error, 'Erreur lors du deplacement') });
    }
  },

  moveStudents: async (classId, studentIds, toGroupId) => {
    try {
      for (const sid of studentIds) {
        await moveStudentDb(classId, sid, toGroupId);
      }
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] moveStudents failed:', error);
      set({ error: errorMessage(error, 'Erreur lors du deplacement') });
    }
  },

  swapStudents: async (classId, studentA, groupA, studentB, groupB) => {
    try {
      await swapStudentsDb(classId, studentA, groupA, studentB, groupB);
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] swapStudents failed:', error);
      set({ error: errorMessage(error, "Erreur lors de l'echange") });
    }
  },

  applyAutoSplit: async (classId, students, mode) => {
    const groups = get().groupsByClass[classId] ?? [];
    if (groups.length === 0) return;
    try {
      const buckets = autoSplit(students, groups.length, mode);
      for (let i = 0; i < groups.length; i++) {
        await replaceMembers(groups[i].id, buckets[i]);
      }
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] applyAutoSplit failed:', error);
      set({ error: errorMessage(error, 'Erreur lors de la repartition') });
    }
  },

  createDefaultPair: async (userId, classId, students) => {
    try {
      const g1 = await createClassGroup(userId, classId, 'Groupe 1', { color: 'indigo', sortOrder: 0 });
      const g2 = await createClassGroup(userId, classId, 'Groupe 2', { color: 'emerald', sortOrder: 1 });
      const [b1, b2] = autoSplit(students, 2, 'alphabetical');
      await replaceMembers(g1.id, b1);
      await replaceMembers(g2.id, b2);
      await get().loadForClass(classId);
    } catch (error) {
      console.error('[classGroupStore] createDefaultPair failed:', error);
      set({ error: errorMessage(error, 'Erreur lors de la creation des demi-groupes') });
    }
  },

  fillGroupFromRoomPlan: async (classId, groupId, roomId) => {
    try {
      const plan = await getPlan(classId, roomId);
      const studentIds = plan ? [...new Set(Object.values(plan.positions))] : [];
      // Exclusif : ces eleves quittent leurs autres groupes
      for (const sid of studentIds) {
        await moveStudentDb(classId, sid, groupId);
      }
      await get().loadForClass(classId);
      return studentIds.length;
    } catch (error) {
      console.error('[classGroupStore] fillGroupFromRoomPlan failed:', error);
      set({ error: errorMessage(error, "Erreur lors de l'import depuis le plan") });
      return 0;
    }
  },

  balance: async (classId, students) => {
    const groups = get().groupsByClass[classId] ?? [];
    if (groups.length === 0) return 0;
    const members = get().membersByClass[classId] ?? [];
    const assigned = new Set(members.map(m => m.student_id));
    const counts = new Map(groups.map(g => [g.id, 0]));
    for (const m of members) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
    const unassigned = students.filter(s => !assigned.has(s.id)).sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));
    try {
      for (const s of unassigned) {
        let target = groups[0].id;
        for (const g of groups) {
          if ((counts.get(g.id) ?? 0) < (counts.get(target) ?? 0)) target = g.id;
        }
        await moveStudentDb(classId, s.id, target);
        counts.set(target, (counts.get(target) ?? 0) + 1);
      }
      await get().loadForClass(classId);
      return unassigned.length;
    } catch (error) {
      console.error('[classGroupStore] balance failed:', error);
      set({ error: errorMessage(error, "Erreur lors de l'equilibrage") });
      return 0;
    }
  },

  clearError: () => set({ error: null }),
  reset: () => set(initialState),
}));
