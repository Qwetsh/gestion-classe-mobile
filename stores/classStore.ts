import { create } from 'zustand';
import {
  createClass as dbCreateClass,
  getClassesByUserId,
  getClassById as dbGetClassById,
  updateClass as dbUpdateClass,
  deleteClass as dbDeleteClass,
} from '../services/database';
import { Class } from '../types';

interface ClassState {
  // State
  classes: Class[];
  currentClass: Class | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadClasses: (userId: string) => Promise<void>;
  loadClassById: (id: string) => Promise<Class | null>;
  addClass: (userId: string, name: string) => Promise<Class | null>;
  updateClassName: (id: string, name: string) => Promise<boolean>;
  removeClass: (id: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useClassStore = create<ClassState>((set, get) => ({
  // Initial state
  classes: [],
  currentClass: null,
  isLoading: false,
  error: null,

  // Load all classes for a user
  loadClasses: async (userId: string): Promise<void> => {
    set({ isLoading: true, error: null });

    try {
      const classes = await getClassesByUserId(userId);
      set({ classes, isLoading: false });
      console.log('[ClassStore] Loaded classes:', classes.length);
    } catch (err) {
      console.error('[ClassStore] Error loading classes:', err);
      set({
        isLoading: false,
        error: 'Erreur lors du chargement des classes',
      });
    }
  },

  // Load a single class by ID
  loadClassById: async (id: string): Promise<Class | null> => {
    try {
      // First check if we already have it in memory
      const { classes } = get();
      const existing = classes.find((c) => c.id === id);
      if (existing) {
        set({ currentClass: existing });
        return existing;
      }

      // Otherwise load from DB
      const classData = await dbGetClassById(id);
      if (classData) {
        set({ currentClass: classData });
      }
      return classData;
    } catch (err) {
      console.error('[ClassStore] Error loading class by ID:', err);
      return null;
    }
  },

  // Add a new class
  addClass: async (userId: string, name: string): Promise<Class | null> => {
    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName) {
      set({ error: 'Le nom de la classe est requis' });
      return null;
    }

    set({ isLoading: true, error: null });

    try {
      const newClass = await dbCreateClass(userId, trimmedName);

      // Add to beginning of list (most recent first)
      set((state) => ({
        classes: [newClass, ...state.classes],
        isLoading: false,
      }));

      console.log('[ClassStore] Added class:', newClass.name);
      return newClass;
    } catch (err) {
      console.error('[ClassStore] Error adding class:', err);
      set({
        isLoading: false,
        error: 'Erreur lors de la creation de la classe',
      });
      return null;
    }
  },

  // Update a class name
  updateClassName: async (id: string, name: string): Promise<boolean> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      set({ error: 'Le nom de la classe est requis' });
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const updatedClass = await dbUpdateClass(id, trimmedName);

      if (updatedClass) {
        set((state) => ({
          classes: state.classes.map((c) =>
            c.id === id ? updatedClass : c
          ),
          isLoading: false,
        }));
        console.log('[ClassStore] Updated class:', trimmedName);
        return true;
      } else {
        set({
          isLoading: false,
          error: 'Classe non trouvee',
        });
        return false;
      }
    } catch (err) {
      console.error('[ClassStore] Error updating class:', err);
      set({
        isLoading: false,
        error: 'Erreur lors de la modification de la classe',
      });
      return false;
    }
  },

  // Remove a class (soft delete)
  removeClass: async (id: string): Promise<void> => {
    set({ isLoading: true, error: null });

    try {
      await dbDeleteClass(id);

      set((state) => ({
        classes: state.classes.filter((c) => c.id !== id),
        isLoading: false,
      }));

      console.log('[ClassStore] Removed class:', id);
    } catch (err) {
      console.error('[ClassStore] Error removing class:', err);
      set({
        isLoading: false,
        error: 'Erreur lors de la suppression de la classe',
      });
    }
  },

  // Clear error
  clearError: (): void => {
    set({ error: null });
  },

  // Reset store (on logout)
  reset: (): void => {
    set({
      classes: [],
      currentClass: null,
      isLoading: false,
      error: null,
    });
  },
}));
