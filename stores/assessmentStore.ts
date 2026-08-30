import { create } from 'zustand';
import { getStudentsByClassId } from '../services/database';
import {
  listAssessments,
  createAssessment as createAssessmentApi,
  updateAssessment as updateAssessmentApi,
  softDeleteAssessment,
  purgeAssessment as purgeAssessmentApi,
  getPageCountsByStudent,
  type CreateAssessmentInput,
} from '../services/copies/assessments';
import {
  getPendingCountsByStudent,
  removeQueuedForAssessment,
} from '../services/copies/uploadQueue';
import type { WrittenAssessment, StudentScanStatus } from '../types';

interface AssessmentState {
  assessments: WrittenAssessment[];
  currentAssessment: WrittenAssessment | null;
  scanStatuses: StudentScanStatus[]; // élèves de la classe + nb pages scannées
  isLoading: boolean;
  error: string | null;
}

interface AssessmentActions {
  loadAssessments: (userId: string, classId?: string) => Promise<void>;
  addAssessment: (input: CreateAssessmentInput) => Promise<WrittenAssessment>;
  editAssessment: (
    id: string,
    patch: Partial<Pick<WrittenAssessment, 'name' | 'subject' | 'date' | 'bareme_total'>>
  ) => Promise<void>;
  removeAssessment: (id: string) => Promise<void>;
  purgeAssessment: (id: string) => Promise<number>; // renvoie le nb de fichiers Storage supprimés
  setCurrentAssessment: (assessment: WrittenAssessment | null) => void;
  loadScanStatuses: (assessmentId: string, classId: string) => Promise<void>;
  bumpPageCount: (studentId: string, delta?: number) => void;
  bumpPendingCount: (studentId: string, delta?: number) => void;
  clearError: () => void;
  reset: () => void;
}

type AssessmentStore = AssessmentState & AssessmentActions;

const initialState: AssessmentState = {
  assessments: [],
  currentAssessment: null,
  scanStatuses: [],
  isLoading: false,
  error: null,
};

const OFFLINE_CREATE_ERROR =
  'Impossible de créer l’évaluation (connexion requise). Réessaie une fois en ligne.';

export const useAssessmentStore = create<AssessmentStore>((set, get) => ({
  ...initialState,

  loadAssessments: async (userId: string, classId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const assessments = await listAssessments(userId, classId);
      set({ assessments, isLoading: false });
    } catch (error) {
      console.error('[assessmentStore] Failed to load assessments:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement des évaluations',
        isLoading: false,
      });
    }
  },

  addAssessment: async (input: CreateAssessmentInput) => {
    set({ isLoading: true, error: null });
    try {
      const created = await createAssessmentApi(input);
      if (!created) {
        // cloud-direct : un null = pas de connexion / RLS / insert refusé
        set({ error: OFFLINE_CREATE_ERROR, isLoading: false });
        throw new Error(OFFLINE_CREATE_ERROR);
      }
      set((state) => ({
        assessments: [created, ...state.assessments],
        currentAssessment: created,
        isLoading: false,
      }));
      return created;
    } catch (error) {
      if (!get().error) {
        set({
          error: error instanceof Error ? error.message : 'Erreur lors de la création de l’évaluation',
          isLoading: false,
        });
      }
      throw error;
    }
  },

  editAssessment: async (id, patch) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await updateAssessmentApi(id, patch);
      if (updated) {
        set((state) => ({
          assessments: state.assessments.map((a) => (a.id === id ? updated : a)),
          currentAssessment:
            state.currentAssessment?.id === id ? updated : state.currentAssessment,
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[assessmentStore] Failed to edit assessment:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la modification',
        isLoading: false,
      });
      throw error;
    }
  },

  removeAssessment: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const ok = await softDeleteAssessment(id);
      if (ok) {
        set((state) => ({
          assessments: state.assessments.filter((a) => a.id !== id),
          currentAssessment:
            state.currentAssessment?.id === id ? null : state.currentAssessment,
          isLoading: false,
        }));
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[assessmentStore] Failed to remove assessment:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la suppression',
        isLoading: false,
      });
      throw error;
    }
  },

  purgeAssessment: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      // Nettoie la file offline locale d'abord (évite de ré-uploader des copies effacées)
      await removeQueuedForAssessment(id);
      const result = await purgeAssessmentApi(id);
      if (!result.success) {
        set({
          error: result.error ?? 'Échec de la suppression',
          isLoading: false,
        });
        throw new Error(result.error ?? 'Échec de la suppression');
      }
      set((state) => ({
        assessments: state.assessments.filter((a) => a.id !== id),
        currentAssessment: state.currentAssessment?.id === id ? null : state.currentAssessment,
        isLoading: false,
      }));
      return result.filesDeleted;
    } catch (error) {
      if (!get().error) {
        set({
          error: error instanceof Error ? error.message : 'Erreur lors de la suppression',
          isLoading: false,
        });
      }
      throw error;
    }
  },

  setCurrentAssessment: (assessment) => set({ currentAssessment: assessment }),

  loadScanStatuses: async (assessmentId: string, classId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Élèves depuis SQLite local (offline-first) + compteurs serveur + file offline.
      const [students, counts, pending] = await Promise.all([
        getStudentsByClassId(classId),
        getPageCountsByStudent(assessmentId),
        getPendingCountsByStudent(assessmentId),
      ]);
      const scanStatuses: StudentScanStatus[] = students.map((student) => ({
        student,
        pageCount: counts[student.id] ?? 0,
        pendingCount: pending[student.id] ?? 0,
      }));
      set({ scanStatuses, isLoading: false });
    } catch (error) {
      console.error('[assessmentStore] Failed to load scan statuses:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement des élèves',
        isLoading: false,
      });
    }
  },

  // Mise à jour optimiste du compteur uploadé après un scan (delta +1 par défaut)
  bumpPageCount: (studentId: string, delta = 1) => {
    set((state) => ({
      scanStatuses: state.scanStatuses.map((s) =>
        s.student.id === studentId
          ? { ...s, pageCount: Math.max(0, s.pageCount + delta) }
          : s
      ),
    }));
  },

  // Mise à jour optimiste du compteur "en attente" (file offline)
  bumpPendingCount: (studentId: string, delta = 1) => {
    set((state) => ({
      scanStatuses: state.scanStatuses.map((s) =>
        s.student.id === studentId
          ? { ...s, pendingCount: Math.max(0, s.pendingCount + delta) }
          : s
      ),
    }));
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
