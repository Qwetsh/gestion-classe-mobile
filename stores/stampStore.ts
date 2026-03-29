import { create } from 'zustand';
import {
  seedDefaultStampData,
  getStampCategories,
  cleanupDuplicateCategories,
  getActiveCardWithStamps,
  getCompletedCards,
  awardStamp,
  removeLastStamp,
  getPendingBonusSelections,
  markBonusUsed,
  type StampCategory,
  type StampCardWithStamps,
  type CompletedCardSummary,
} from '../services/database';

interface StampState {
  // Data
  categories: StampCategory[];
  categoriesLoaded: boolean;

  // Per-student cache
  activeCards: Record<string, StampCardWithStamps>;

  // Loading
  isLoading: boolean;
  error: string | null;

  // Actions
  loadCategories: (userId: string) => Promise<void>;
  loadActiveCard: (userId: string, studentId: string) => Promise<StampCardWithStamps | null>;
  getCompletedCardsForStudent: (studentId: string) => Promise<CompletedCardSummary[]>;
  doAwardStamp: (userId: string, studentId: string, categoryId: string) => Promise<{ stampCount: number; cardComplete: boolean; cardNumber: number }>;
  doRemoveLastStamp: (studentId: string) => Promise<void>;
  doMarkBonusUsed: (selectionId: string) => Promise<void>;
  reset: () => void;
}

export const useStampStore = create<StampState>((set, get) => ({
  categories: [],
  categoriesLoaded: false,
  activeCards: {},
  isLoading: false,
  error: null,

  loadCategories: async (userId: string) => {
    if (get().categoriesLoaded) return;
    try {
      // Seed defaults if needed
      await seedDefaultStampData(userId);
      // Clean up duplicates created by sync
      await cleanupDuplicateCategories(userId);
      const categories = await getStampCategories(userId, true);
      set({ categories, categoriesLoaded: true });
    } catch (error) {
      console.error('[stampStore] Failed to load categories:', error);
      set({ error: error instanceof Error ? error.message : 'Erreur' });
    }
  },

  loadActiveCard: async (userId: string, studentId: string) => {
    try {
      const card = await getActiveCardWithStamps(userId, studentId);
      if (card) {
        set(state => ({
          activeCards: { ...state.activeCards, [studentId]: card },
        }));
      }
      return card;
    } catch (error) {
      console.error('[stampStore] Failed to load active card:', error);
      return null;
    }
  },

  getCompletedCardsForStudent: async (studentId: string) => {
    try {
      return await getCompletedCards(studentId);
    } catch (error) {
      console.error('[stampStore] Failed to load completed cards:', error);
      return [];
    }
  },

  doAwardStamp: async (userId: string, studentId: string, categoryId: string) => {
    const result = await awardStamp(userId, studentId, categoryId);

    // Refresh active card cache
    const card = await getActiveCardWithStamps(userId, studentId);
    if (card) {
      set(state => ({
        activeCards: { ...state.activeCards, [studentId]: card },
      }));
    }

    return result;
  },

  doRemoveLastStamp: async (studentId: string) => {
    await removeLastStamp(studentId);
    // Remove from cache so it reloads
    set(state => {
      const { [studentId]: _, ...rest } = state.activeCards;
      return { activeCards: rest };
    });
  },

  doMarkBonusUsed: async (selectionId: string) => {
    await markBonusUsed(selectionId);
  },

  reset: () => set({
    categories: [],
    categoriesLoaded: false,
    activeCards: {},
    isLoading: false,
    error: null,
  }),
}));
