import { create } from 'zustand';
import {
  GroupSession,
  GradingCriteria,
  SessionGroup,
  GroupGrade,
  Student,
  GroupSessionStatus,
} from '../types';
import {
  createGroupSession,
  getGroupSessionById,
  getGroupSessionsByUserId,
  getGroupSessionsByClassId,
  updateGroupSessionStatus,
  updateGroupSessionName,
  deleteGroupSession,
  createGradingCriteria,
  getCriteriaBySessionId,
  updateGradingCriteria,
  deleteGradingCriteria,
  reorderCriteria,
  createSessionGroup,
  getGroupsBySessionId,
  updateSessionGroupName,
  applyGroupMalus,
  setGroupMalus,
  deleteSessionGroup,
  addGroupMembersBatch,
  getGroupMemberIds,
  clearGroupMembers,
  setGroupGrade,
  getGradesByGroupId,
  getGradesBySessionId,
  calculateGroupScore,
  calculateMaxScore,
  getStudentGroupSessionGrades,
} from '../services/database';

// ============================================
// Types
// ============================================

export interface SessionGroupWithDetails extends SessionGroup {
  memberIds: string[];
  grades: GroupGrade[];
  totalScore: number;
}

export interface ActiveSessionState {
  session: GroupSession;
  criteria: GradingCriteria[];
  groups: SessionGroupWithDetails[];
  maxPossibleScore: number;
}

interface GroupSessionState {
  // List of all sessions
  sessions: GroupSession[];
  isLoading: boolean;
  error: string | null;

  // Currently active/editing session
  activeSession: ActiveSessionState | null;

  // Actions - Session List
  loadSessions: (userId: string) => Promise<void>;
  loadSessionsByClass: (classId: string) => Promise<void>;

  // Actions - Session CRUD
  createSession: (userId: string, classId: string, name: string) => Promise<GroupSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  updateSessionName: (name: string) => Promise<void>;
  startSession: () => Promise<void>;
  completeSession: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  clearActiveSession: () => void;

  // Actions - Criteria
  addCriteria: (label: string, maxPoints: number) => Promise<GradingCriteria | null>;
  updateCriteria: (criteriaId: string, label: string, maxPoints: number) => Promise<void>;
  removeCriteria: (criteriaId: string) => Promise<void>;
  reorderCriteria: (orderedIds: string[]) => Promise<void>;

  // Actions - Groups
  addGroup: (name: string) => Promise<SessionGroup | null>;
  updateGroupName: (groupId: string, name: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  setGroupMembers: (groupId: string, studentIds: string[]) => Promise<void>;
  applyMalus: (groupId: string, amount: number) => Promise<void>;
  resetMalus: (groupId: string) => Promise<void>;

  // Actions - Grading
  setGrade: (groupId: string, criteriaId: string, points: number) => Promise<void>;

  // Computed
  getGroupScore: (groupId: string) => number;
  getMaxScore: () => number;

  // For student history
  getStudentGrades: (studentId: string) => Promise<Array<{
    sessionId: string;
    sessionName: string;
    classId: string;
    completedAt: string;
    score: number;
    maxScore: number;
  }>>;
}

// ============================================
// Helper Functions
// ============================================

async function loadGroupDetails(groupId: string): Promise<SessionGroupWithDetails> {
  const [memberIds, grades, score] = await Promise.all([
    getGroupMemberIds(groupId),
    getGradesByGroupId(groupId),
    calculateGroupScore(groupId),
  ]);

  // We need the base group info
  const groups = await getGroupsBySessionId(''); // This won't work, need different approach

  return {
    id: groupId,
    sessionId: '',
    name: '',
    conductMalus: 0,
    syncedAt: null,
    memberIds,
    grades,
    totalScore: score,
  };
}

async function loadFullSessionState(sessionId: string): Promise<ActiveSessionState | null> {
  const session = await getGroupSessionById(sessionId);
  if (!session) return null;

  const [criteria, groups, maxScore] = await Promise.all([
    getCriteriaBySessionId(sessionId),
    getGroupsBySessionId(sessionId),
    calculateMaxScore(sessionId),
  ]);

  // Load details for each group
  const groupsWithDetails: SessionGroupWithDetails[] = await Promise.all(
    groups.map(async (group) => {
      const [memberIds, grades, score] = await Promise.all([
        getGroupMemberIds(group.id),
        getGradesByGroupId(group.id),
        calculateGroupScore(group.id),
      ]);
      return {
        ...group,
        memberIds,
        grades,
        totalScore: score,
      };
    })
  );

  return {
    session,
    criteria,
    groups: groupsWithDetails,
    maxPossibleScore: maxScore,
  };
}

// ============================================
// Store
// ============================================

export const useGroupSessionStore = create<GroupSessionState>((set, get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  activeSession: null,

  // ============================================
  // Session List Actions
  // ============================================

  loadSessions: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await getGroupSessionsByUserId(userId);
      set({ sessions, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement';
      console.error('[groupSessionStore] Load error:', error);
      set({ error: message, isLoading: false });
    }
  },

  loadSessionsByClass: async (classId: string) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await getGroupSessionsByClassId(classId);
      set({ sessions, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement';
      console.error('[groupSessionStore] Load by class error:', error);
      set({ error: message, isLoading: false });
    }
  },

  // ============================================
  // Session CRUD Actions
  // ============================================

  createSession: async (userId: string, classId: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const session = await createGroupSession(userId, classId, name);

      // Set as active session
      set({
        activeSession: {
          session,
          criteria: [],
          groups: [],
          maxPossibleScore: 0,
        },
        sessions: [session, ...get().sessions],
        isLoading: false,
      });

      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création';
      console.error('[groupSessionStore] Create error:', error);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  loadSession: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const activeSession = await loadFullSessionState(sessionId);
      if (!activeSession) {
        set({ error: 'Session non trouvée', isLoading: false });
        return;
      }
      set({ activeSession, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement';
      console.error('[groupSessionStore] Load session error:', error);
      set({ error: message, isLoading: false });
    }
  },

  updateSessionName: async (name: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await updateGroupSessionName(activeSession.session.id, name);
      set({
        activeSession: {
          ...activeSession,
          session: { ...activeSession.session, name },
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Update name error:', error);
    }
  },

  startSession: async () => {
    const { activeSession } = get();
    if (!activeSession || activeSession.session.status !== 'draft') return;

    try {
      await updateGroupSessionStatus(activeSession.session.id, 'active');
      set({
        activeSession: {
          ...activeSession,
          session: { ...activeSession.session, status: 'active' },
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Start error:', error);
    }
  },

  completeSession: async () => {
    const { activeSession, sessions } = get();
    if (!activeSession || activeSession.session.status !== 'active') return;

    try {
      await updateGroupSessionStatus(activeSession.session.id, 'completed');
      const completedAt = new Date().toISOString();

      const updatedSession = {
        ...activeSession.session,
        status: 'completed' as GroupSessionStatus,
        completedAt,
      };

      set({
        activeSession: {
          ...activeSession,
          session: updatedSession,
        },
        sessions: sessions.map((s) =>
          s.id === updatedSession.id ? updatedSession : s
        ),
      });
    } catch (error) {
      console.error('[groupSessionStore] Complete error:', error);
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await deleteGroupSession(sessionId);
      const { activeSession, sessions } = get();

      set({
        sessions: sessions.filter((s) => s.id !== sessionId),
        activeSession: activeSession?.session.id === sessionId ? null : activeSession,
      });
    } catch (error) {
      console.error('[groupSessionStore] Delete error:', error);
    }
  },

  clearActiveSession: () => {
    set({ activeSession: null });
  },

  // ============================================
  // Criteria Actions
  // ============================================

  addCriteria: async (label: string, maxPoints: number) => {
    const { activeSession } = get();
    if (!activeSession) return null;

    try {
      const displayOrder = activeSession.criteria.length;
      const criteria = await createGradingCriteria(
        activeSession.session.id,
        label,
        maxPoints,
        displayOrder
      );

      const newMaxScore = activeSession.maxPossibleScore + maxPoints;

      set({
        activeSession: {
          ...activeSession,
          criteria: [...activeSession.criteria, criteria],
          maxPossibleScore: newMaxScore,
        },
      });

      return criteria;
    } catch (error) {
      console.error('[groupSessionStore] Add criteria error:', error);
      return null;
    }
  },

  updateCriteria: async (criteriaId: string, label: string, maxPoints: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await updateGradingCriteria(criteriaId, label, maxPoints);

      const updatedCriteria = activeSession.criteria.map((c) =>
        c.id === criteriaId ? { ...c, label, maxPoints } : c
      );
      const newMaxScore = updatedCriteria.reduce((sum, c) => sum + c.maxPoints, 0);

      set({
        activeSession: {
          ...activeSession,
          criteria: updatedCriteria,
          maxPossibleScore: newMaxScore,
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Update criteria error:', error);
    }
  },

  removeCriteria: async (criteriaId: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await deleteGradingCriteria(criteriaId);

      const updatedCriteria = activeSession.criteria.filter((c) => c.id !== criteriaId);
      const newMaxScore = updatedCriteria.reduce((sum, c) => sum + c.maxPoints, 0);

      // Also remove this criteria's grades from groups
      const updatedGroups = activeSession.groups.map((group) => ({
        ...group,
        grades: group.grades.filter((g) => g.criteriaId !== criteriaId),
        totalScore: group.grades
          .filter((g) => g.criteriaId !== criteriaId)
          .reduce((sum, g) => sum + g.pointsAwarded, 0) - group.conductMalus,
      }));

      set({
        activeSession: {
          ...activeSession,
          criteria: updatedCriteria,
          groups: updatedGroups,
          maxPossibleScore: newMaxScore,
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Remove criteria error:', error);
    }
  },

  reorderCriteria: async (orderedIds: string[]) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const reordered = orderedIds.map((id, index) => ({
        id,
        displayOrder: index,
      }));
      await reorderCriteria(reordered);

      const criteriaMap = new Map(activeSession.criteria.map((c) => [c.id, c]));
      const updatedCriteria = orderedIds
        .map((id, index) => {
          const c = criteriaMap.get(id);
          return c ? { ...c, displayOrder: index } : null;
        })
        .filter((c): c is GradingCriteria => c !== null);

      set({
        activeSession: {
          ...activeSession,
          criteria: updatedCriteria,
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Reorder criteria error:', error);
    }
  },

  // ============================================
  // Group Actions
  // ============================================

  addGroup: async (name: string) => {
    const { activeSession } = get();
    if (!activeSession) return null;

    try {
      const group = await createSessionGroup(activeSession.session.id, name);

      const groupWithDetails: SessionGroupWithDetails = {
        ...group,
        memberIds: [],
        grades: [],
        totalScore: 0,
      };

      set({
        activeSession: {
          ...activeSession,
          groups: [...activeSession.groups, groupWithDetails],
        },
      });

      return group;
    } catch (error) {
      console.error('[groupSessionStore] Add group error:', error);
      return null;
    }
  },

  updateGroupName: async (groupId: string, name: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await updateSessionGroupName(groupId, name);

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.map((g) =>
            g.id === groupId ? { ...g, name } : g
          ),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Update group name error:', error);
    }
  },

  removeGroup: async (groupId: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await deleteSessionGroup(groupId);

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.filter((g) => g.id !== groupId),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Remove group error:', error);
    }
  },

  setGroupMembers: async (groupId: string, studentIds: string[]) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      // Clear existing and add new
      await clearGroupMembers(groupId);
      if (studentIds.length > 0) {
        await addGroupMembersBatch(groupId, studentIds);
      }

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.map((g) =>
            g.id === groupId ? { ...g, memberIds: studentIds } : g
          ),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Set members error:', error);
    }
  },

  applyMalus: async (groupId: string, amount: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await applyGroupMalus(groupId, amount);

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.map((g) => {
            if (g.id !== groupId) return g;
            const newMalus = g.conductMalus + amount;
            return {
              ...g,
              conductMalus: newMalus,
              totalScore: g.grades.reduce((sum, grade) => sum + grade.pointsAwarded, 0) - newMalus,
            };
          }),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Apply malus error:', error);
    }
  },

  resetMalus: async (groupId: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      await setGroupMalus(groupId, 0);

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.map((g) => {
            if (g.id !== groupId) return g;
            // Malus reset to 0, so total score is just sum of grades
            return {
              ...g,
              conductMalus: 0,
              totalScore: g.grades.reduce((sum, grade) => sum + grade.pointsAwarded, 0),
            };
          }),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Reset malus error:', error);
    }
  },

  // ============================================
  // Grading Actions
  // ============================================

  setGrade: async (groupId: string, criteriaId: string, points: number) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const grade = await setGroupGrade(groupId, criteriaId, points);

      set({
        activeSession: {
          ...activeSession,
          groups: activeSession.groups.map((g) => {
            if (g.id !== groupId) return g;

            // Update or add grade
            const existingIndex = g.grades.findIndex((gr) => gr.criteriaId === criteriaId);
            let newGrades: GroupGrade[];
            if (existingIndex >= 0) {
              newGrades = [...g.grades];
              newGrades[existingIndex] = grade;
            } else {
              newGrades = [...g.grades, grade];
            }

            const newScore = newGrades.reduce((sum, gr) => sum + gr.pointsAwarded, 0) - g.conductMalus;

            return {
              ...g,
              grades: newGrades,
              totalScore: newScore,
            };
          }),
        },
      });
    } catch (error) {
      console.error('[groupSessionStore] Set grade error:', error);
    }
  },

  // ============================================
  // Computed Values
  // ============================================

  getGroupScore: (groupId: string) => {
    const { activeSession } = get();
    if (!activeSession) return 0;

    const group = activeSession.groups.find((g) => g.id === groupId);
    return group?.totalScore || 0;
  },

  getMaxScore: () => {
    const { activeSession } = get();
    return activeSession?.maxPossibleScore || 0;
  },

  // ============================================
  // Student History
  // ============================================

  getStudentGrades: async (studentId: string) => {
    return getStudentGroupSessionGrades(studentId);
  },
}));
