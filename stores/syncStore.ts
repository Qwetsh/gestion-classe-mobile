import { create } from 'zustand';
import { syncAll, getUnsyncedCount, pullFromServer, type SyncResult } from '../services/sync';

interface SyncState {
  isSyncing: boolean;
  lastSyncResult: SyncResult | null;
  lastSyncTime: Date | null;
  unsyncedCount: number;
  error: string | null;

  // Actions
  sync: (userId: string) => Promise<SyncResult>;
  refreshUnsyncedCount: () => Promise<void>;
  clearError: () => void;
  clearLastResult: () => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  lastSyncResult: null,
  lastSyncTime: null,
  unsyncedCount: 0,
  error: null,

  sync: async (userId: string) => {
    if (get().isSyncing) {
      return {
        success: false,
        sessionsSync: 0,
        eventsSync: 0,
        classesSync: 0,
        studentsSync: 0,
        roomsSync: 0,
        plansSync: 0,
        errors: ['Synchronisation deja en cours'],
      };
    }

    set({ isSyncing: true, error: null });

    try {
      // First, pull data from server (server -> mobile)
      console.log('[syncStore] Pulling from server...');
      await pullFromServer(userId);

      // Then, push local data to server (mobile -> server)
      console.log('[syncStore] Pushing to server...');
      const result = await syncAll(userId);

      set({
        isSyncing: false,
        lastSyncResult: result,
        lastSyncTime: new Date(),
        unsyncedCount: 0,
        error: result.success ? null : result.errors.join(', '),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de synchronisation';
      set({
        isSyncing: false,
        error: errorMessage,
      });

      return {
        success: false,
        sessionsSync: 0,
        eventsSync: 0,
        classesSync: 0,
        studentsSync: 0,
        roomsSync: 0,
        plansSync: 0,
        errors: [errorMessage],
      };
    }
  },

  refreshUnsyncedCount: async () => {
    try {
      const count = await getUnsyncedCount();
      set({ unsyncedCount: count });
    } catch (error) {
      console.error('[syncStore] Failed to get unsynced count:', error);
    }
  },

  clearError: () => set({ error: null }),

  clearLastResult: () => set({ lastSyncResult: null }),
}));
