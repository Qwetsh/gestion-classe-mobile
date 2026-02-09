import { create } from 'zustand';
import {
  getOrCreatePlan,
  setStudentPosition as setStudentPositionDb,
  removeStudentFromPlan as removeStudentFromPlanDb,
  clearPositions as clearPositionsDb,
  type ClassRoomPlan,
  type Positions,
} from '../services/database';

interface PlanState {
  currentPlan: ClassRoomPlan | null;
  isLoading: boolean;
  error: string | null;
}

interface PlanActions {
  loadPlan: (classId: string, roomId: string) => Promise<void>;
  setStudentPosition: (studentId: string, row: number, col: number) => Promise<void>;
  removeStudentFromPlan: (studentId: string) => Promise<void>;
  clearAllPositions: () => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

type PlanStore = PlanState & PlanActions;

const initialState: PlanState = {
  currentPlan: null,
  isLoading: false,
  error: null,
};

export const usePlanStore = create<PlanStore>((set, get) => ({
  ...initialState,

  loadPlan: async (classId: string, roomId: string) => {
    set({ isLoading: true, error: null });
    try {
      const plan = await getOrCreatePlan(classId, roomId);
      set({ currentPlan: plan, isLoading: false });
    } catch (error) {
      console.error('[planStore] Failed to load plan:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement du plan',
        isLoading: false,
      });
    }
  },

  setStudentPosition: async (studentId: string, row: number, col: number) => {
    const { currentPlan } = get();
    if (!currentPlan) return;

    set({ isLoading: true, error: null });
    try {
      const updatedPlan = await setStudentPositionDb(
        currentPlan.class_id,
        currentPlan.room_id,
        studentId,
        row,
        col
      );
      set({ currentPlan: updatedPlan, isLoading: false });
    } catch (error) {
      console.error('[planStore] Failed to set student position:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du positionnement',
        isLoading: false,
      });
    }
  },

  removeStudentFromPlan: async (studentId: string) => {
    const { currentPlan } = get();
    if (!currentPlan) return;

    set({ isLoading: true, error: null });
    try {
      const updatedPlan = await removeStudentFromPlanDb(
        currentPlan.class_id,
        currentPlan.room_id,
        studentId
      );
      set({ currentPlan: updatedPlan, isLoading: false });
    } catch (error) {
      console.error('[planStore] Failed to remove student from plan:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du retrait',
        isLoading: false,
      });
    }
  },

  clearAllPositions: async () => {
    const { currentPlan } = get();
    if (!currentPlan) return;

    set({ isLoading: true, error: null });
    try {
      const updatedPlan = await clearPositionsDb(
        currentPlan.class_id,
        currentPlan.room_id
      );
      set({ currentPlan: updatedPlan, isLoading: false });
    } catch (error) {
      console.error('[planStore] Failed to clear positions:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la reinitialisation',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
