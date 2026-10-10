import { create } from 'zustand';
import { syncAll, getUnsyncedCount, pullFromServer, type SyncResult } from '../services/sync';
import { useStampStore } from './stampStore';

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
  /** true quand la synchro tourne en tache de fond (auto au lancement) : l'UI ne doit pas se bloquer */
  isBackgroundSync: boolean;
  lastSyncResult: SyncResult | null;
  lastSyncTime: Date | null;
  unsyncedCount: number;
  error: string | null;

  // Actions
  sync: (userId: string, options?: { background?: boolean }) => Promise<SyncResult>;
  /**
   * Push seul, en tache de fond : renvoie ce qui attend sur le telephone (tampons poses hors ligne
   * ou dont l'envoi immediat a echoue) sans refaire tout le pull. Silencieux si une synchro tourne.
   */
  pushPending: (userId: string) => Promise<void>;
  refreshUnsyncedCount: () => Promise<void>;
  clearError: () => void;
  clearLastResult: () => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  isBackgroundSync: false,
  lastSyncResult: null,
  lastSyncTime: null,
  unsyncedCount: 0,
  error: null,

  sync: async (userId: string, options?: { background?: boolean }) => {
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
        stampCategoriesSync: 0,
        bonusesSync: 0,
        stampCardsSync: 0,
        stampsSync: 0,
        bonusSelectionsSync: 0,
        errors: ['Synchronisation deja en cours'],
      };
    }

    set({ isSyncing: true, isBackgroundSync: options?.background === true, error: null });

    try {
      // 1. Pull (serveur -> mobile). Un echec ou un depassement de delai du pull ne doit JAMAIS
      // empecher le push : avant, un pull trop long (Wi-Fi du college) sautait le push, et les tampons
      // poses en classe attendaient le prochain lancement reussi de l'app (audit n°2, A3).
      let pullError: string | null = null;
      if (__DEV__) {
        console.log('[syncStore] Pulling from server...');
      }
      try {
        await withTimeout(pullFromServer(userId), SYNC_TIMEOUT_MS, 'Pull serveur');
      } catch (error) {
        pullError = error instanceof Error ? error.message : 'Pull serveur impossible';
        console.error('[syncStore] Pull failed, pushing anyway:', pullError);
      }
      // Les cartes en cache peuvent avoir change (tampons donnes depuis le web)
      useStampStore.getState().invalidateCards();
      // Categories ajoutees / desactivees / reordonnees depuis le web
      await useStampStore.getState().refreshCategories(userId);

      // 2. Push (mobile -> serveur)
      if (__DEV__) {
        console.log('[syncStore] Pushing to server...');
      }
      const result = await withTimeout(syncAll(userId), SYNC_TIMEOUT_MS, 'Push serveur');
      if (pullError) {
        result.errors.unshift(`Pull serveur : ${pullError}`);
        result.success = false;
      }

      // Le compteur reflete ce qui reste vraiment en attente (plus jamais remis a 0 d'office).
      let remaining = 0;
      try { remaining = await getUnsyncedCount(); } catch { /* compteur indicatif */ }

      set({
        isSyncing: false,
        isBackgroundSync: false,
        lastSyncResult: result,
        lastSyncTime: new Date(),
        unsyncedCount: remaining,
        error: result.success ? null : result.errors.join(', '),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de synchronisation';
      console.error('[syncStore] Sync error:', errorMessage);
      set({
        isSyncing: false,
        isBackgroundSync: false,
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
        stampCategoriesSync: 0,
        bonusesSync: 0,
        stampCardsSync: 0,
        stampsSync: 0,
        bonusSelectionsSync: 0,
        errors: [errorMessage],
      };
    }
  },

  pushPending: async (userId: string) => {
    if (get().isSyncing) return;
    let pending = 0;
    try { pending = await getUnsyncedCount(); } catch { return; }
    if (pending === 0) { set({ unsyncedCount: 0 }); return; }
    set({ isSyncing: true, isBackgroundSync: true });
    try {
      const result = await withTimeout(syncAll(userId), SYNC_TIMEOUT_MS, 'Push serveur');
      let remaining = 0;
      try { remaining = await getUnsyncedCount(); } catch { /* indicatif */ }
      set({
        lastSyncResult: result,
        lastSyncTime: new Date(),
        unsyncedCount: remaining,
        error: result.success ? get().error : result.errors.join(', '),
      });
    } catch (error) {
      console.warn('[syncStore] pushPending failed:', error instanceof Error ? error.message : error);
    } finally {
      set({ isSyncing: false, isBackgroundSync: false });
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
