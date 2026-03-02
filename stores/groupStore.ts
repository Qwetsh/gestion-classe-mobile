import { create } from 'zustand';
import {
  SessionGroupRow,
  GroupMemberRow,
  GroupEventRow,
  createSessionGroup,
  createSessionGroups,
  getGroupsBySessionId,
  getGroupById,
  deleteSessionGroup,
  deleteGroupsBySessionId,
  getNextGroupNumber,
  addMemberToGroup,
  addMembersToGroup,
  getActiveMembers,
  getStudentGroup,
  removeMemberFromGroup,
  moveStudentToGroup,
  isStudentInAnyGroup,
  createGroupRemark,
  createGroupGrade,
  getEventsByGroupId,
  getGroupEventsBySessionId,
  createGroupGradeEventsForMembers,
} from '../services/database';
import { GroupConfig, SessionGroupWithMembers, GroupMemberWithStudent, Student } from '../types';

interface GroupState {
  // Session groups
  groups: SessionGroupWithMembers[];
  isGroupModeActive: boolean;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions - Group management
  loadGroups: (sessionId: string, students: Student[]) => Promise<void>;
  createGroup: (sessionId: string, studentIds: string[], students: Student[]) => Promise<SessionGroupRow | null>;
  createGroupsFromConfig: (sessionId: string, config: GroupConfig[], students: Student[]) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  clearAllGroups: (sessionId: string) => Promise<void>;

  // Actions - Member management
  addStudentToGroup: (groupId: string, studentId: string, students: Student[]) => Promise<void>;
  removeStudentFromGroup: (groupId: string, studentId: string) => Promise<void>;
  moveStudent: (sessionId: string, studentId: string, newGroupId: string, students: Student[]) => Promise<void>;
  getStudentGroupNumber: (sessionId: string, studentId: string) => Promise<number | null>;

  // Actions - Group events
  addGroupRemark: (groupId: string, note: string, photoPath?: string | null) => Promise<GroupEventRow | null>;
  addGroupGrade: (groupId: string, gradeValue: number, gradeMax: number, note?: string | null) => Promise<GroupEventRow | null>;

  // Mode
  enableGroupMode: () => void;
  disableGroupMode: () => void;
  toggleGroupMode: () => void;

  // Reset
  clearGroups: () => void;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  isGroupModeActive: false,
  isLoading: false,
  error: null,

  loadGroups: async (sessionId: string, students: Student[]) => {
    set({ isLoading: true, error: null });
    try {
      const groupRows = await getGroupsBySessionId(sessionId);
      const groupsWithMembers: SessionGroupWithMembers[] = [];

      for (const groupRow of groupRows) {
        const memberRows = await getActiveMembers(groupRow.id);
        const events = await getEventsByGroupId(groupRow.id);

        const members: GroupMemberWithStudent[] = memberRows.map((memberRow) => {
          const student = students.find((s) => s.id === memberRow.student_id);
          return {
            ...memberRow,
            id: memberRow.id,
            sessionGroupId: memberRow.session_group_id,
            studentId: memberRow.student_id,
            joinedAt: memberRow.joined_at,
            leftAt: memberRow.left_at,
            syncedAt: memberRow.synced_at,
            student: student || {
              id: memberRow.student_id,
              pseudo: 'Inconnu',
              classId: '',
              createdAt: '',
            },
          };
        });

        groupsWithMembers.push({
          id: groupRow.id,
          sessionId: groupRow.session_id,
          groupNumber: groupRow.group_number,
          createdAt: groupRow.created_at,
          syncedAt: groupRow.synced_at,
          members,
          events: events.map((e) => ({
            id: e.id,
            sessionGroupId: e.session_group_id,
            type: e.type as 'remarque' | 'note',
            note: e.note,
            photoPath: e.photo_path,
            gradeValue: e.grade_value,
            gradeMax: e.grade_max,
            timestamp: e.timestamp,
            syncedAt: e.synced_at,
          })),
        });
      }

      set({
        groups: groupsWithMembers,
        isGroupModeActive: groupsWithMembers.length > 0,
        isLoading: false,
      });

      if (__DEV__) {
        console.log('[groupStore] Loaded', groupsWithMembers.length, 'groups');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement des groupes';
      set({ error: message, isLoading: false });
    }
  },

  createGroup: async (sessionId: string, studentIds: string[], students: Student[]) => {
    set({ isLoading: true, error: null });
    try {
      const groupNumber = await getNextGroupNumber(sessionId);
      const groupRow = await createSessionGroup(sessionId, groupNumber);

      // Add members
      if (studentIds.length > 0) {
        await addMembersToGroup(groupRow.id, studentIds);
      }

      // Reload groups to get fresh state
      await get().loadGroups(sessionId, students);

      if (__DEV__) {
        console.log('[groupStore] Created group', groupNumber, 'with', studentIds.length, 'members');
      }

      return groupRow;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création du groupe';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  createGroupsFromConfig: async (sessionId: string, config: GroupConfig[], students: Student[]) => {
    set({ isLoading: true, error: null });
    try {
      // Clear existing groups first
      await deleteGroupsBySessionId(sessionId);

      // Create groups from config
      for (const groupConfig of config) {
        const groupRow = await createSessionGroup(sessionId, groupConfig.number);
        if (groupConfig.studentIds.length > 0) {
          await addMembersToGroup(groupRow.id, groupConfig.studentIds);
        }
      }

      // Reload groups
      await get().loadGroups(sessionId, students);

      if (__DEV__) {
        console.log('[groupStore] Created', config.length, 'groups from config');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création des groupes';
      set({ error: message, isLoading: false });
    }
  },

  deleteGroup: async (groupId: string) => {
    try {
      await deleteSessionGroup(groupId);

      set((state) => ({
        groups: state.groups.filter((g) => g.id !== groupId),
      }));

      if (__DEV__) {
        console.log('[groupStore] Deleted group:', groupId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de suppression du groupe';
      set({ error: message });
    }
  },

  clearAllGroups: async (sessionId: string) => {
    try {
      await deleteGroupsBySessionId(sessionId);

      set({
        groups: [],
        isGroupModeActive: false,
      });

      if (__DEV__) {
        console.log('[groupStore] Cleared all groups for session:', sessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de suppression des groupes';
      set({ error: message });
    }
  },

  addStudentToGroup: async (groupId: string, studentId: string, students: Student[]) => {
    try {
      await addMemberToGroup(groupId, studentId);

      // Update local state
      const student = students.find((s) => s.id === studentId);
      if (student) {
        set((state) => ({
          groups: state.groups.map((g) => {
            if (g.id === groupId) {
              return {
                ...g,
                members: [
                  ...g.members,
                  {
                    id: '', // Will be updated on next load
                    sessionGroupId: groupId,
                    studentId,
                    joinedAt: new Date().toISOString(),
                    leftAt: null,
                    syncedAt: null,
                    student,
                    session_group_id: groupId,
                    student_id: studentId,
                    joined_at: new Date().toISOString(),
                    left_at: null,
                    synced_at: null,
                  },
                ],
              };
            }
            return g;
          }),
        }));
      }

      if (__DEV__) {
        console.log('[groupStore] Added student', studentId, 'to group', groupId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur d'ajout de l'élève";
      set({ error: message });
    }
  },

  removeStudentFromGroup: async (groupId: string, studentId: string) => {
    try {
      await removeMemberFromGroup(groupId, studentId);

      set((state) => ({
        groups: state.groups.map((g) => {
          if (g.id === groupId) {
            return {
              ...g,
              members: g.members.filter((m) => m.studentId !== studentId),
            };
          }
          return g;
        }),
      }));

      if (__DEV__) {
        console.log('[groupStore] Removed student', studentId, 'from group', groupId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de retrait de l'élève";
      set({ error: message });
    }
  },

  moveStudent: async (sessionId: string, studentId: string, newGroupId: string, students: Student[]) => {
    try {
      await moveStudentToGroup(sessionId, studentId, newGroupId);

      // Reload to get fresh state
      await get().loadGroups(sessionId, students);

      if (__DEV__) {
        console.log('[groupStore] Moved student', studentId, 'to group', newGroupId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de déplacement de l'élève";
      set({ error: message });
    }
  },

  getStudentGroupNumber: async (sessionId: string, studentId: string) => {
    const result = await getStudentGroup(sessionId, studentId);
    return result?.groupNumber ?? null;
  },

  addGroupRemark: async (groupId: string, note: string, photoPath?: string | null) => {
    try {
      const event = await createGroupRemark(groupId, note, photoPath);

      // Update local state
      set((state) => ({
        groups: state.groups.map((g) => {
          if (g.id === groupId) {
            return {
              ...g,
              events: [
                ...g.events,
                {
                  id: event.id,
                  sessionGroupId: event.session_group_id,
                  type: 'remarque' as const,
                  note: event.note,
                  photoPath: event.photo_path,
                  gradeValue: null,
                  gradeMax: null,
                  timestamp: event.timestamp,
                  syncedAt: event.synced_at,
                },
              ],
            };
          }
          return g;
        }),
      }));

      if (__DEV__) {
        console.log('[groupStore] Added remark to group', groupId);
      }

      return event;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création de la remarque';
      set({ error: message });
      return null;
    }
  },

  addGroupGrade: async (groupId: string, gradeValue: number, gradeMax: number, note?: string | null) => {
    try {
      const event = await createGroupGrade(groupId, gradeValue, gradeMax, note);

      // Find the group to get sessionId and members
      const { groups } = get();
      const group = groups.find((g) => g.id === groupId);

      // Propagate grade to individual students
      if (group && group.members.length > 0) {
        const studentIds = group.members.map((m) => m.studentId);
        await createGroupGradeEventsForMembers(
          group.sessionId,
          studentIds,
          gradeValue,
          gradeMax,
          group.groupNumber,
          note
        );

        if (__DEV__) {
          console.log('[groupStore] Propagated grade to', studentIds.length, 'students');
        }
      }

      // Update local state
      set((state) => ({
        groups: state.groups.map((g) => {
          if (g.id === groupId) {
            return {
              ...g,
              events: [
                ...g.events,
                {
                  id: event.id,
                  sessionGroupId: event.session_group_id,
                  type: 'note' as const,
                  note: event.note,
                  photoPath: null,
                  gradeValue: event.grade_value,
                  gradeMax: event.grade_max,
                  timestamp: event.timestamp,
                  syncedAt: event.synced_at,
                },
              ],
            };
          }
          return g;
        }),
      }));

      if (__DEV__) {
        console.log('[groupStore] Added grade', gradeValue + '/' + gradeMax, 'to group', groupId);
      }

      return event;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création de la note';
      set({ error: message });
      return null;
    }
  },

  enableGroupMode: () => set({ isGroupModeActive: true }),
  disableGroupMode: () => set({ isGroupModeActive: false }),
  toggleGroupMode: () => set((state) => ({ isGroupModeActive: !state.isGroupModeActive })),

  clearGroups: () => {
    set({
      groups: [],
      isGroupModeActive: false,
      error: null,
    });
  },
}));
