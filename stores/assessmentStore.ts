import { create } from 'zustand';
import { getStudentsByClassId } from '../services/database';
import {
  listAssessments,
  fetchScanSnapshot,
  purgeAssessmentCopies,
} from '../services/copies/assessments';
import {
  readOutbox,
  subscribeOutbox,
  drainOutbox,
  enqueueCreateAssessment,
  enqueueCopyInfo,
  enqueuePages,
  enqueueDeletePage,
  removeQueuedForAssessment,
} from '../services/copies/outbox';
import {
  EMPTY_SNAPSHOT,
  applyToSnapshot,
  mergeStudentState,
  pendingCreations,
  type CopyInfo,
  type OutboxOp,
  type ScanSnapshot,
  type StudentCopyState,
  type CreateAssessmentOp,
} from '../services/copies/outboxLogic';
import {
  getCachedAssessments,
  setCachedAssessments,
  getCachedSnapshot,
  setCachedSnapshot,
} from '../services/copies/localCache';
import type { Student, WrittenAssessment } from '../types';

/** Élève de la classe + état de sa copie pour l'éval ouverte. */
export interface StudentScanStatus extends StudentCopyState {
  student: Student;
}

interface AssessmentState {
  /** Évals scannables de la classe ouverte (serveur ou cache + créées hors ligne). */
  assessments: WrittenAssessment[];
  assessmentsClassId: string | null;
  /** Éval ouverte sur l'écran de scan. */
  assessmentId: string | null;
  students: Student[];
  snapshot: ScanSnapshot;
  /** File d'envoi complète (toutes évals), tenue à jour par abonnement. */
  ops: OutboxOp[];
  /** false : l'instantané vient du cache (pas de réseau au chargement). */
  snapshotFresh: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AssessmentActions {
  loadAssessments: (userId: string, classId: string) => Promise<void>;
  createAssessment: (input: {
    userId: string;
    classId: string;
    name: string;
    baremeTotal: number;
    sessionId: string | null;
  }) => Promise<WrittenAssessment>;
  openAssessment: (assessmentId: string, classId: string) => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  saveCopy: (input: {
    userId: string;
    studentId: string;
    firstOrder: number;
    pageUris: string[];
    info: CopyInfo;
  }) => Promise<void>;
  setAbsent: (userId: string, studentId: string, absent: boolean) => Promise<void>;
  deletePage: (userId: string, studentId: string, pageId: string, storagePath: string) => Promise<void>;
  /** Efface les scans d'une éval (fichiers + index). L'éval et ses notes restent. */
  purgeCopies: (assessmentId: string) => Promise<number>;
  retryNow: () => Promise<void>;
  clearError: () => void;
}

type AssessmentStore = AssessmentState & AssessmentActions;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Une éval créée hors ligne, telle que l'écran l'affiche en attendant le serveur. */
function pendingToAssessment(op: CreateAssessmentOp): WrittenAssessment {
  return {
    id: op.assessmentId,
    user_id: op.userId,
    class_id: op.classId,
    name: op.name,
    subject: null,
    date: op.date,
    bareme_total: op.baremeTotal,
    created_at: op.createdAt,
    updated_at: null,
    is_deleted: false,
    session_id: op.sessionId,
    period: null,
    kind: 'ecrit',
    published_to_students: false,
    series_name: null,
    is_pending: true,
  };
}

function withPending(list: WrittenAssessment[], ops: OutboxOp[], classId: string): WrittenAssessment[] {
  const known = new Set(list.map((a) => a.id));
  const pending = pendingCreations(ops)
    .filter((op) => op.classId === classId && !known.has(op.assessmentId))
    .map(pendingToAssessment);
  return [...pending, ...list];
}

/** Statuts de toute la classe pour l'éval ouverte (calcul pur, à mémoïser côté écran). */
export function buildScanStatuses(
  students: Student[],
  snapshot: ScanSnapshot,
  ops: OutboxOp[],
  assessmentId: string | null
): StudentScanStatus[] {
  if (!assessmentId) return [];
  const scoped = ops.filter((op) => op.assessmentId === assessmentId);
  return students.map((student) => ({
    student,
    ...mergeStudentState(student.id, snapshot, scoped),
  }));
}

export const useAssessmentStore = create<AssessmentStore>((set, get) => {
  // La file vit hors du store (disque) : on s'y abonne une fois pour toutes.
  void readOutbox().then((ops) => set({ ops }));
  subscribeOutbox((ops, completed) => {
    const { assessmentId, snapshot, assessments, assessmentsClassId } = get();
    const patch: Partial<AssessmentState> = { ops };
    if (completed && completed.assessmentId === assessmentId) {
      const next = applyToSnapshot(snapshot, completed);
      patch.snapshot = next;
      if (assessmentId) void setCachedSnapshot(assessmentId, next);
    }
    if (completed?.kind === 'create_assessment') {
      patch.assessments = assessments.map((a) =>
        a.id === completed.assessmentId ? { ...a, is_pending: false } : a
      );
      if (assessmentsClassId) void setCachedAssessments(assessmentsClassId, patch.assessments);
    }
    set(patch);
  });

  return {
    assessments: [],
    assessmentsClassId: null,
    assessmentId: null,
    students: [],
    snapshot: EMPTY_SNAPSHOT,
    ops: [],
    snapshotFresh: false,
    isLoading: false,
    error: null,

    loadAssessments: async (userId, classId) => {
      set({ isLoading: true, error: null, assessmentsClassId: classId });
      const ops = await readOutbox();
      const cached = await getCachedAssessments(classId);
      if (get().assessmentsClassId === classId) {
        set({ assessments: withPending(cached, ops, classId) });
      }
      const fresh = await listAssessments(userId, classId);
      if (get().assessmentsClassId !== classId) return;
      if (fresh) {
        await setCachedAssessments(classId, fresh);
        set({ assessments: withPending(fresh, get().ops, classId), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    },

    createAssessment: async ({ userId, classId, name, baremeTotal, sessionId }) => {
      const op = await enqueueCreateAssessment({
        userId,
        classId,
        name,
        date: todayIso(),
        baremeTotal,
        sessionId,
      });
      const created = pendingToAssessment(op);
      set((s) => ({ assessments: [created, ...s.assessments.filter((a) => a.id !== created.id)] }));
      void drainOutbox();
      return created;
    },

    openAssessment: async (assessmentId, classId) => {
      set({
        assessmentId,
        isLoading: true,
        error: null,
        snapshot: (await getCachedSnapshot(assessmentId)) ?? EMPTY_SNAPSHOT,
        snapshotFresh: false,
      });
      try {
        const students = await getStudentsByClassId(classId);
        if (get().assessmentId !== assessmentId) return;
        set({ students });
      } catch (error) {
        console.error('[assessmentStore] students load failed:', error);
        set({ error: 'Élèves introuvables sur le téléphone. Synchronise d’abord.' });
      }
      await get().refreshSnapshot();
      set({ isLoading: false });
      void drainOutbox();
    },

    refreshSnapshot: async () => {
      const assessmentId = get().assessmentId;
      if (!assessmentId) return;
      const fresh = await fetchScanSnapshot(assessmentId);
      if (!fresh || get().assessmentId !== assessmentId) return;
      await setCachedSnapshot(assessmentId, fresh);
      set({ snapshot: fresh, snapshotFresh: true });
    },

    saveCopy: async ({ userId, studentId, firstOrder, pageUris, info }) => {
      const assessmentId = get().assessmentId;
      if (!assessmentId) return;
      if (pageUris.length > 0) {
        await enqueuePages({ userId, assessmentId, studentId, firstOrder, sourceUris: pageUris });
      }
      if (Object.keys(info).length > 0) {
        await enqueueCopyInfo({ userId, assessmentId, studentId, info });
      }
      void drainOutbox();
    },

    setAbsent: async (userId, studentId, absent) => {
      const assessmentId = get().assessmentId;
      if (!assessmentId) return;
      await enqueueCopyInfo({
        userId,
        assessmentId,
        studentId,
        info: { status: absent ? 'absent' : 'noted' },
      });
      void drainOutbox();
    },

    deletePage: async (userId, studentId, pageId, storagePath) => {
      const assessmentId = get().assessmentId;
      if (!assessmentId) return;
      await enqueueDeletePage({ userId, assessmentId, studentId, pageId, storagePath });
      void drainOutbox();
    },

    purgeCopies: async (assessmentId) => {
      // La file locale d'abord : on ne ré-enverra pas des copies qu'on vient d'effacer.
      await removeQueuedForAssessment(assessmentId);
      const result = await purgeAssessmentCopies(assessmentId);
      if (!result.success) {
        const message = result.error ?? 'Échec de la suppression';
        set({ error: message });
        throw new Error(message);
      }
      await setCachedSnapshot(assessmentId, { ...EMPTY_SNAPSHOT, fetchedAt: new Date().toISOString() });
      if (get().assessmentId === assessmentId) await get().refreshSnapshot();
      return result.filesDeleted;
    },

    retryNow: async () => {
      await drainOutbox(true);
      await get().refreshSnapshot();
    },

    clearError: () => set({ error: null }),
  };
});
