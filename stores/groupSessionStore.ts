import { create } from 'zustand';
import {
  GroupSession,
  GradingCriteria,
  SessionGroup,
  GroupGrade,
  Student,
  GroupSessionStatus,
  GroupSessionPhoto,
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
  // TP Templates
  getTpTemplatesWithCriteria,
  getTpTemplateWithCriteria,
  type TpTemplateWithCriteria,
  // TP en groupes (v19)
  updateGroupSessionTemplate,
  updateSessionGroupPosition,
  updateSessionGroupComment,
  moveStudentToGroup,
  removeGroupMember,
  createGroupSessionPhoto,
  getPhotosBySessionId,
  updateGroupSessionPhotoGroup,
  deleteGroupSessionPhoto,
  overwriteTpTemplateCriteria,
} from '../services/database';
import { pushGroupSessionNow } from '../services/sync/syncService';
import { autoLayout, groupScore } from '../utils/tpGroups';
import { deleteLocalTpPhoto, deleteRemoteTpPhoto } from '../services/photos/tpPhotos';

// Envoi en direct (anti-rebond) des tables d'un TP en cours : un geste = une modification,
// on regroupe les gestes rapprochés en un seul envoi.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush(status: GroupSessionStatus | undefined) {
  if (status === 'draft' || status === undefined) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushGroupSessionNow();
  }, 1500);
}

// ============================================
// Derniere config de groupes par classe ("Reprendre", maquette 10c)
// ============================================

import * as SecureStore from 'expo-secure-store';

export interface LastGroupConfig {
  groups: Array<{ name: string; memberIds: string[] }>;
  criteria: Array<{ label: string; maxPoints: number }>;
  templateId: string | null;
  savedAt: string;
}

const LAST_CONFIG_PREFIX = 'group_config_';

export async function saveLastGroupConfig(classId: string, config: Omit<LastGroupConfig, 'savedAt'>): Promise<void> {
  try {
    await SecureStore.setItemAsync(
      `${LAST_CONFIG_PREFIX}${classId}`,
      JSON.stringify({ ...config, savedAt: new Date().toISOString() })
    );
  } catch {
    // Best-effort : "Reprendre" sera simplement indisponible
  }
}

export async function getLastGroupConfig(classId: string): Promise<LastGroupConfig | null> {
  try {
    const raw = await SecureStore.getItemAsync(`${LAST_CONFIG_PREFIX}${classId}`);
    return raw ? (JSON.parse(raw) as LastGroupConfig) : null;
  } catch {
    return null;
  }
}

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
  /** Photos du TP (par groupe ou pour toute la classe) */
  photos: GroupSessionPhoto[];
}

export interface DraftGroup {
  name: string;
  memberIds: string[];
  positionX?: number | null;
  positionY?: number | null;
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
  createSession: (userId: string, classId: string, name: string, linkedSessionId?: string, templateId?: string | null) => Promise<GroupSession | null>;
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

  // TP Templates
  loadTpTemplates: (userId: string) => Promise<TpTemplateWithCriteria[]>;
  applyTpTemplate: (templateId: string) => Promise<void>;

  // Group creation helpers
  copyGroupsFromPreviousSession: (classId: string) => Promise<boolean>;
  createRandomGroups: (studentIds: string[], studentsPerGroup: number) => Promise<void>;

  // TP en groupes (lot 1)
  setTemplate: (templateId: string | null, name: string) => Promise<void>;
  /** Remplace les critères de la séance (barème réglé avant de lancer le TP). */
  replaceCriteria: (criteria: Array<{ label: string; maxPoints: number }>, updateTemplateId?: string | null) => Promise<void>;
  /** Crée les groupes formés (positions auto quand absentes). */
  createGroupsFromDraft: (drafts: DraftGroup[]) => Promise<void>;
  moveStudent: (studentId: string, toGroupId: string) => Promise<void>;
  removeStudent: (studentId: string) => Promise<void>;
  setGroupPosition: (groupId: string, x: number, y: number) => Promise<void>;
  setGroupComment: (groupId: string, comment: string) => Promise<void>;
  addPhoto: (photo: { id: string; groupId: string | null; filePath: string; localUri: string; caption?: string }) => Promise<void>;
  movePhoto: (photoId: string, groupId: string | null) => Promise<void>;
  deletePhoto: (photoId: string) => Promise<void>;
  /** Envoi en direct après une modification faite hors du store (ex. événements de groupe). */
  requestPush: () => void;
}

// ============================================
// Helper Functions
// ============================================

async function loadFullSessionState(sessionId: string): Promise<ActiveSessionState | null> {
  const session = await getGroupSessionById(sessionId);
  if (!session) return null;

  const [criteria, groups, maxScore, photos] = await Promise.all([
    getCriteriaBySessionId(sessionId),
    getGroupsBySessionId(sessionId),
    calculateMaxScore(sessionId),
    getPhotosBySessionId(sessionId),
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
    photos,
  };
}

function rescore(g: SessionGroupWithDetails): SessionGroupWithDetails {
  return { ...g, totalScore: groupScore(g.grades.map((gr) => gr.pointsAwarded), g.conductMalus) };
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

  createSession: async (userId: string, classId: string, name: string, linkedSessionId?: string, templateId?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const session = await createGroupSession(userId, classId, name, linkedSessionId, templateId);

      // Set as active session
      set({
        activeSession: {
          session,
          criteria: [],
          groups: [],
          maxPossibleScore: 0,
          photos: [],
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
      schedulePush('active');
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
      schedulePush(activeSession.session.status);

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
      schedulePush(activeSession.session.status);

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

  // ============================================
  // TP Templates
  // ============================================

  loadTpTemplates: async (userId: string) => {
    try {
      return await getTpTemplatesWithCriteria(userId);
    } catch (error) {
      console.error('[groupSessionStore] Load templates error:', error);
      return [];
    }
  },

  applyTpTemplate: async (templateId: string) => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const template = await getTpTemplateWithCriteria(templateId);
      if (!template) return;

      // Add each criteria from the template to the session
      for (let i = 0; i < template.criteria.length; i++) {
        const tc = template.criteria[i];
        const criteria = await createGradingCriteria(
          activeSession.session.id,
          tc.label,
          tc.maxPoints,
          i
        );

        // Update local state
        const currentState = get().activeSession;
        if (currentState) {
          set({
            activeSession: {
              ...currentState,
              criteria: [...currentState.criteria, criteria],
              maxPossibleScore: currentState.maxPossibleScore + tc.maxPoints,
            },
          });
        }
      }
    } catch (error) {
      console.error('[groupSessionStore] Apply template error:', error);
    }
  },

  // ============================================
  // Group Creation Helpers
  // ============================================

  copyGroupsFromPreviousSession: async (classId: string) => {
    const { activeSession } = get();
    if (!activeSession) return false;

    try {
      // Find the most recent completed session for this class
      const previousSessions = await getGroupSessionsByClassId(classId);
      const previousSession = previousSessions
        .filter(s => s.status === 'completed' && s.id !== activeSession.session.id)
        .sort((a, b) => {
          const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
          const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
          return dateB - dateA;
        })[0];

      if (!previousSession) return false;

      // Get groups and members from previous session
      const previousGroups = await getGroupsBySessionId(previousSession.id);
      if (previousGroups.length === 0) return false;

      // Copy each group
      for (const pg of previousGroups) {
        const memberIds = await getGroupMemberIds(pg.id);

        // Create new group
        const newGroup = await createSessionGroup(activeSession.session.id, pg.name);

        // Add members
        if (memberIds.length > 0) {
          await addGroupMembersBatch(newGroup.id, memberIds);
        }

        // Update local state
        const currentState = get().activeSession;
        if (currentState) {
          const groupWithDetails: SessionGroupWithDetails = {
            ...newGroup,
            memberIds,
            grades: [],
            totalScore: 0,
          };
          set({
            activeSession: {
              ...currentState,
              groups: [...currentState.groups, groupWithDetails],
            },
          });
        }
      }

      return true;
    } catch (error) {
      console.error('[groupSessionStore] Copy groups error:', error);
      return false;
    }
  },

  createRandomGroups: async (studentIds: string[], studentsPerGroup: number) => {
    const { activeSession } = get();
    if (!activeSession || studentIds.length === 0 || studentsPerGroup < 1) return;

    try {
      // Shuffle students
      const shuffled = [...studentIds].sort(() => Math.random() - 0.5);

      // Calculate number of groups
      const numGroups = Math.ceil(shuffled.length / studentsPerGroup);

      // Create groups
      for (let i = 0; i < numGroups; i++) {
        const groupName = `Groupe ${activeSession.groups.length + i + 1}`;
        const startIdx = i * studentsPerGroup;
        const endIdx = Math.min(startIdx + studentsPerGroup, shuffled.length);
        const memberIds = shuffled.slice(startIdx, endIdx);

        // Create group
        const newGroup = await createSessionGroup(activeSession.session.id, groupName);

        // Add members
        if (memberIds.length > 0) {
          await addGroupMembersBatch(newGroup.id, memberIds);
        }

        // Update local state
        const currentState = get().activeSession;
        if (currentState) {
          const groupWithDetails: SessionGroupWithDetails = {
            ...newGroup,
            memberIds,
            grades: [],
            totalScore: 0,
          };
          set({
            activeSession: {
              ...currentState,
              groups: [...currentState.groups, groupWithDetails],
            },
          });
        }
      }
    } catch (error) {
      console.error('[groupSessionStore] Random groups error:', error);
    }
  },

  // ============================================
  // TP en groupes (lot 1)
  // ============================================


  setTemplate: async (templateId, name) => {
    const a = get().activeSession;
    if (!a) return;
    await updateGroupSessionTemplate(a.session.id, templateId, name);
    set({
      activeSession: { ...a, session: { ...a.session, templateId, name: name.trim() } },
    });
  },

  replaceCriteria: async (criteria, updateTemplateId) => {
    const a = get().activeSession;
    if (!a) return;
    for (const c of a.criteria) await deleteGradingCriteria(c.id);
    const created: GradingCriteria[] = [];
    for (let i = 0; i < criteria.length; i++) {
      created.push(await createGradingCriteria(a.session.id, criteria[i].label, criteria[i].maxPoints, i));
    }
    if (updateTemplateId) await overwriteTpTemplateCriteria(updateTemplateId, criteria);
    const current = get().activeSession ?? a;
    set({
      activeSession: {
        ...current,
        criteria: created,
        maxPossibleScore: created.reduce((s, c) => s + c.maxPoints, 0),
        groups: current.groups.map((g) => rescore({ ...g, grades: [] })),
      },
    });
    schedulePush(current.session.status);
  },

  createGroupsFromDraft: async (drafts) => {
    const a = get().activeSession;
    if (!a) return;
    const layout = autoLayout(drafts.length);
    const startOrder = a.groups.reduce((m, g) => Math.max(m, g.displayOrder + 1), 0);
    const added: SessionGroupWithDetails[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const hasPos = d.positionX != null && d.positionY != null;
      const group = await createSessionGroup(
        a.session.id,
        d.name,
        startOrder + i,
        hasPos ? { x: d.positionX as number, y: d.positionY as number } : layout[i]
      );
      for (const studentId of d.memberIds) await moveStudentToGroup(a.session.id, studentId, group.id);
      added.push({ ...group, memberIds: [...d.memberIds], grades: [], totalScore: 0 });
    }
    const current = get().activeSession ?? a;
    const movedIds = new Set(drafts.flatMap((d) => d.memberIds));
    set({
      activeSession: {
        ...current,
        groups: [
          ...current.groups.map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => !movedIds.has(id)) })),
          ...added,
        ],
      },
    });
    schedulePush(current.session.status);
  },

  moveStudent: async (studentId, toGroupId) => {
    const a = get().activeSession;
    if (!a) return;
    await moveStudentToGroup(a.session.id, studentId, toGroupId);
    set({
      activeSession: {
        ...a,
        groups: a.groups.map((g) => {
          const without = g.memberIds.filter((id) => id !== studentId);
          return g.id === toGroupId ? { ...g, memberIds: [...without, studentId] } : { ...g, memberIds: without };
        }),
      },
    });
    schedulePush(a.session.status);
  },

  removeStudent: async (studentId) => {
    const a = get().activeSession;
    if (!a) return;
    const group = a.groups.find((g) => g.memberIds.includes(studentId));
    if (!group) return;
    await removeGroupMember(group.id, studentId);
    set({
      activeSession: {
        ...a,
        groups: a.groups.map((g) => (g.id === group.id ? { ...g, memberIds: g.memberIds.filter((id) => id !== studentId) } : g)),
      },
    });
    schedulePush(a.session.status);
  },

  setGroupPosition: async (groupId, x, y) => {
    const a = get().activeSession;
    if (!a) return;
    await updateSessionGroupPosition(groupId, x, y);
    set({
      activeSession: {
        ...a,
        groups: a.groups.map((g) => (g.id === groupId ? { ...g, positionX: x, positionY: y } : g)),
      },
    });
    schedulePush(a.session.status);
  },

  setGroupComment: async (groupId, comment) => {
    const a = get().activeSession;
    if (!a) return;
    await updateSessionGroupComment(groupId, comment);
    const trimmed = comment.trim();
    set({
      activeSession: {
        ...a,
        groups: a.groups.map((g) => (g.id === groupId ? { ...g, comment: trimmed.length > 0 ? trimmed : null } : g)),
      },
    });
    schedulePush(a.session.status);
  },

  addPhoto: async (photo) => {
    const a = get().activeSession;
    if (!a) return;
    const created = await createGroupSessionPhoto({ ...photo, sessionId: a.session.id });
    const current = get().activeSession ?? a;
    set({ activeSession: { ...current, photos: [...current.photos, created] } });
    schedulePush(current.session.status);
  },

  movePhoto: async (photoId, groupId) => {
    const a = get().activeSession;
    if (!a) return;
    await updateGroupSessionPhotoGroup(photoId, groupId);
    set({
      activeSession: { ...a, photos: a.photos.map((p) => (p.id === photoId ? { ...p, groupId } : p)) },
    });
    schedulePush(a.session.status);
  },

  deletePhoto: async (photoId) => {
    const a = get().activeSession;
    if (!a) return;
    const removed = await deleteGroupSessionPhoto(photoId);
    set({
      activeSession: { ...a, photos: a.photos.filter((p) => p.id !== photoId) },
    });
    if (removed) {
      await deleteLocalTpPhoto(removed.localUri);
      if (removed.uploaded) void deleteRemoteTpPhoto(removed.filePath);
    }
    schedulePush(a.session.status);
  },

  requestPush: () => {
    schedulePush(get().activeSession?.session.status);
  },
}));
