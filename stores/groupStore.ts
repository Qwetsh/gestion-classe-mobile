import { create } from 'zustand';
import {
  StudentGroup,
  createGroup,
  getGroupsByClassId,
  updateGroup,
  deleteGroup,
  assignStudentToGroup,
  GROUP_COLORS,
} from '../services/database';

interface GroupState {
  groups: StudentGroup[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadGroups: (classId: string) => Promise<void>;
  addGroup: (classId: string, userId: string, name: string, color?: string) => Promise<StudentGroup | null>;
  editGroup: (groupId: string, name: string, color: string) => Promise<void>;
  removeGroup: (groupId: string) => Promise<void>;
  setStudentGroup: (studentId: string, groupId: string | null) => Promise<void>;
  clearGroups: () => void;
  getNextColor: () => string;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],
  isLoading: false,
  error: null,

  loadGroups: async (classId: string) => {
    set({ isLoading: true, error: null });
    try {
      const groups = await getGroupsByClassId(classId);
      set({ groups, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load groups';
      console.error('[groupStore] Load error:', error);
      set({ error: message, isLoading: false });
    }
  },

  addGroup: async (classId: string, userId: string, name: string, color?: string) => {
    set({ isLoading: true, error: null });
    try {
      const groupColor = color || get().getNextColor();
      const newGroup = await createGroup(classId, userId, name, groupColor);
      set((state) => ({
        groups: [...state.groups, newGroup].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }));
      return newGroup;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create group';
      console.error('[groupStore] Create error:', error);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  editGroup: async (groupId: string, name: string, color: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await updateGroup(groupId, name, color);
      if (updated) {
        set((state) => ({
          groups: state.groups
            .map((g) => (g.id === groupId ? updated : g))
            .sort((a, b) => a.name.localeCompare(b.name)),
          isLoading: false,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update group';
      console.error('[groupStore] Update error:', error);
      set({ error: message, isLoading: false });
    }
  },

  removeGroup: async (groupId: string) => {
    set({ isLoading: true, error: null });
    try {
      await deleteGroup(groupId);
      set((state) => ({
        groups: state.groups.filter((g) => g.id !== groupId),
        isLoading: false,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete group';
      console.error('[groupStore] Delete error:', error);
      set({ error: message, isLoading: false });
    }
  },

  setStudentGroup: async (studentId: string, groupId: string | null) => {
    try {
      await assignStudentToGroup(studentId, groupId);
      if (__DEV__) {
        console.log('[groupStore] Student assigned to group:', studentId, '->', groupId);
      }
    } catch (error) {
      console.error('[groupStore] Assign error:', error);
    }
  },

  clearGroups: () => {
    set({ groups: [], error: null });
  },

  getNextColor: () => {
    const { groups } = get();
    const usedColors = new Set(groups.map((g) => g.color));
    // Find first unused color
    for (const color of GROUP_COLORS) {
      if (!usedColors.has(color)) {
        return color;
      }
    }
    // If all colors used, return first one
    return GROUP_COLORS[0];
  },
}));

// Re-export colors for convenience
export { GROUP_COLORS };
