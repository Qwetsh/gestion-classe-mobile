import { create } from 'zustand';
import {
  getOrCreatePlan,
  getPlan,
  setStudentPosition as setStudentPositionDb,
  removeStudentFromPlan as removeStudentFromPlanDb,
  clearPositions as clearPositionsDb,
  getGroupPlan,
  saveGroupPlanPositions,
  type ClassRoomPlan,
} from '../services/database';
import { keepPlacedStudents, withStudentAt, withoutStudent, type PlanPositions } from '../utils/planScope';

/**
 * Plan affiché par l'éditeur : celui de la classe entière (class_room_plans) ou celui d'un groupe de
 * classe (class_group_plans, lot 4 de PLAN_groupes_classe.md). Pour un groupe, `currentPlan` reprend
 * la forme d'un plan de salle ; il n'est écrit en base qu'au premier élève placé.
 */
export interface EditedPlan {
  class_id: string;
  room_id: string;
  positions: PlanPositions;
}

interface PlanState {
  currentPlan: ClassRoomPlan | EditedPlan | null;
  /** Groupe dont on édite le plan ; null = classe entière. */
  groupId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface PlanActions {
  loadPlan: (classId: string, roomId: string, groupId?: string | null) => Promise<void>;
  setStudentPosition: (studentId: string, row: number, col: number) => Promise<void>;
  removeStudentFromPlan: (studentId: string) => Promise<void>;
  clearAllPositions: () => Promise<void>;
  /** Plan de groupe : reprend les places des élèves donnés dans le plan de la classe entière. */
  copyFromClassPlan: (students: readonly { id: string }[]) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type PlanStore = PlanState & PlanActions;

const initialState: PlanState = {
  currentPlan: null,
  groupId: null,
  isLoading: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// Une lecture lancée avant un changement de groupe ne doit pas écraser la suivante
let loadRequest = 0;

export const usePlanStore = create<PlanStore>((set, get) => {
  /** Plan de groupe : enregistre les nouvelles positions et met l'écran à jour. */
  const saveGroupPositions = async (positions: PlanPositions, fallback: string) => {
    const { currentPlan, groupId } = get();
    if (!currentPlan || !groupId) return;
    set({ isLoading: true, error: null });
    try {
      await saveGroupPlanPositions(currentPlan.class_id, currentPlan.room_id, groupId, positions);
      set({ currentPlan: { class_id: currentPlan.class_id, room_id: currentPlan.room_id, positions }, isLoading: false });
    } catch (error) {
      console.error('[planStore] Failed to save group plan:', error);
      set({ error: errorMessage(error, fallback), isLoading: false });
    }
  };

  return {
    ...initialState,

    loadPlan: async (classId: string, roomId: string, groupId: string | null = null) => {
      const request = ++loadRequest;
      set({ isLoading: true, error: null });
      try {
        let plan: ClassRoomPlan | EditedPlan;
        if (groupId) {
          const groupPlan = await getGroupPlan(classId, roomId, groupId);
          plan = { class_id: classId, room_id: roomId, positions: groupPlan?.positions ?? {} };
        } else {
          plan = await getOrCreatePlan(classId, roomId);
        }
        if (request !== loadRequest) return;
        set({ currentPlan: plan, groupId, isLoading: false });
      } catch (error) {
        console.error('[planStore] Failed to load plan:', error);
        if (request !== loadRequest) return;
        set({ error: errorMessage(error, 'Erreur lors du chargement du plan'), isLoading: false });
      }
    },

    setStudentPosition: async (studentId: string, row: number, col: number) => {
      const { currentPlan, groupId } = get();
      if (!currentPlan) return;
      if (groupId) {
        await saveGroupPositions(withStudentAt(currentPlan.positions, studentId, row, col), 'Erreur lors du positionnement');
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const updatedPlan = await setStudentPositionDb(currentPlan.class_id, currentPlan.room_id, studentId, row, col);
        set({ currentPlan: updatedPlan, isLoading: false });
      } catch (error) {
        console.error('[planStore] Failed to set student position:', error);
        set({ error: errorMessage(error, 'Erreur lors du positionnement'), isLoading: false });
      }
    },

    removeStudentFromPlan: async (studentId: string) => {
      const { currentPlan, groupId } = get();
      if (!currentPlan) return;
      if (groupId) {
        await saveGroupPositions(withoutStudent(currentPlan.positions, studentId), 'Erreur lors du retrait');
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const updatedPlan = await removeStudentFromPlanDb(currentPlan.class_id, currentPlan.room_id, studentId);
        set({ currentPlan: updatedPlan, isLoading: false });
      } catch (error) {
        console.error('[planStore] Failed to remove student from plan:', error);
        set({ error: errorMessage(error, 'Erreur lors du retrait'), isLoading: false });
      }
    },

    clearAllPositions: async () => {
      const { currentPlan, groupId } = get();
      if (!currentPlan) return;
      if (groupId) {
        await saveGroupPositions({}, 'Erreur lors de la réinitialisation');
        return;
      }

      set({ isLoading: true, error: null });
      try {
        const updatedPlan = await clearPositionsDb(currentPlan.class_id, currentPlan.room_id);
        set({ currentPlan: updatedPlan, isLoading: false });
      } catch (error) {
        console.error('[planStore] Failed to clear positions:', error);
        set({ error: errorMessage(error, 'Erreur lors de la réinitialisation'), isLoading: false });
      }
    },

    copyFromClassPlan: async (students) => {
      const { currentPlan, groupId } = get();
      if (!currentPlan || !groupId) return;
      try {
        const classPlan = await getPlan(currentPlan.class_id, currentPlan.room_id);
        await saveGroupPositions(keepPlacedStudents(classPlan?.positions, students), 'Erreur lors de la copie du plan');
      } catch (error) {
        console.error('[planStore] Failed to copy class plan:', error);
        set({ error: errorMessage(error, 'Erreur lors de la copie du plan') });
      }
    },

    clearError: () => set({ error: null }),

    reset: () => set(initialState),
  };
});
