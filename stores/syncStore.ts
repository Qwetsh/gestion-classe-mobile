import { create } from 'zustand';
import { syncAll, getUnsyncedCount, pullFromServer, type SyncResult } from '../services/sync';

// Sync operation timeout (2 minutes - generous for large datasets)
const SYNC_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Wraps a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timeout apres ${timeoutMs / 1000}s`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

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
        groupSessionsSync: 0,
        gradingCriteriaSync: 0,
        sessionGroupsSync: 0,
        groupMembersSync: 0,
        groupGradesSync: 0,
        tpTemplatesSync: 0,
        tpTemplateCriteriaSync: 0,
        errors: ['Synchronisation deja en cours'],
      };
    }

    set({ isSyncing: true, error: null });

    try {
      // First, pull data from server (server -> mobile) with timeout
      if (__DEV__) {
        console.log('[syncStore] Pulling from server...');
      }
      await withTimeout(
        pullFromServer(userId),
        SYNC_TIMEOUT_MS,
        'Pull serveur'
      );

      // Then, push local data to server (mobile -> server) with timeout
      if (__DEV__) {
        console.log('[syncStore] Pushing to server...');
      }
      const result = await withTimeout(
        syncAll(userId),
        SYNC_TIMEOUT_MS,
        'Push serveur'
      );

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
      console.error('[syncStore] Sync error:', errorMessage);
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
        groupSessionsSync: 0,
        gradingCriteriaSync: 0,
        sessionGroupsSync: 0,
        groupMembersSync: 0,
        groupGradesSync: 0,
        tpTemplatesSync: 0,
        tpTemplateCriteriaSync: 0,
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
