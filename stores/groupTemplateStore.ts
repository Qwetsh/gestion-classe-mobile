import { create } from 'zustand';
import {
  GroupTemplateRow,
  createGroupTemplate,
  getTemplatesByClassId,
  getTemplateById,
  updateGroupTemplate,
  deleteGroupTemplate,
} from '../services/database';
import { GroupTemplate, GroupConfig } from '../types';

interface GroupTemplateState {
  // Templates
  templates: GroupTemplate[];

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTemplates: (classId: string) => Promise<void>;
  createTemplate: (userId: string, classId: string, name: string, groupsConfig: GroupConfig[]) => Promise<GroupTemplate | null>;
  updateTemplate: (id: string, name: string, groupsConfig: GroupConfig[]) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateConfig: (id: string) => Promise<GroupConfig[] | null>;

  // Reset
  clearTemplates: () => void;
}

/**
 * Convert DB row to GroupTemplate type
 */
function rowToTemplate(row: GroupTemplateRow): GroupTemplate {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    name: row.name,
    groupsConfig: JSON.parse(row.groups_config) as GroupConfig[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncedAt: row.synced_at,
    isDeleted: row.is_deleted === 1,
  };
}

export const useGroupTemplateStore = create<GroupTemplateState>((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,

  loadTemplates: async (classId: string) => {
    set({ isLoading: true, error: null });
    try {
      const rows = await getTemplatesByClassId(classId);
      const templates = rows.map(rowToTemplate);

      set({
        templates,
        isLoading: false,
      });

      if (__DEV__) {
        console.log('[groupTemplateStore] Loaded', templates.length, 'templates for class:', classId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de chargement des templates';
      set({ error: message, isLoading: false });
    }
  },

  createTemplate: async (userId: string, classId: string, name: string, groupsConfig: GroupConfig[]) => {
    set({ isLoading: true, error: null });
    try {
      const row = await createGroupTemplate(userId, classId, name, groupsConfig);
      const template = rowToTemplate(row);

      set((state) => ({
        templates: [template, ...state.templates],
        isLoading: false,
      }));

      if (__DEV__) {
        console.log('[groupTemplateStore] Created template:', name);
      }

      return template;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de création du template';
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateTemplate: async (id: string, name: string, groupsConfig: GroupConfig[]) => {
    set({ isLoading: true, error: null });
    try {
      const row = await updateGroupTemplate(id, name, groupsConfig);
      if (row) {
        const template = rowToTemplate(row);

        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? template : t)),
          isLoading: false,
        }));

        if (__DEV__) {
          console.log('[groupTemplateStore] Updated template:', id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de mise à jour du template';
      set({ error: message, isLoading: false });
    }
  },

  deleteTemplate: async (id: string) => {
    try {
      await deleteGroupTemplate(id);

      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
      }));

      if (__DEV__) {
        console.log('[groupTemplateStore] Deleted template:', id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de suppression du template';
      set({ error: message });
    }
  },

  getTemplateConfig: async (id: string) => {
    try {
      const row = await getTemplateById(id);
      if (row) {
        return JSON.parse(row.groups_config) as GroupConfig[];
      }
      return null;
    } catch (error) {
      console.error('[groupTemplateStore] Error getting template config:', error);
      return null;
    }
  },

  clearTemplates: () => {
    set({
      templates: [],
      error: null,
    });
  },
}));
