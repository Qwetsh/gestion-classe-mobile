import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore, useNetworkStore, useSyncStore, useSessionStore, useGroupSessionStore } from '../stores';

/**
 * Hook that handles automatic synchronization:
 * 1. When network status changes from offline to online
 * 2. When a session ends (regular or group)
 *
 * Uses refs to track state and prevent race conditions with isSyncing
 */
export function useAutoSync() {
  const { user } = useAuthStore();
  const { isConnected, isInternetReachable } = useNetworkStore();
  const { sync, isSyncing, refreshUnsyncedCount } = useSyncStore();
  const { isSessionActive } = useSessionStore();
  const groupActiveSession = useGroupSessionStore((s) => s.activeSession);

  // Track previous network state
  const wasOffline = useRef<boolean | null>(null);
  // Track previous session state
  const wasSessionActive = useRef<boolean>(false);
  // Track previous group session status
  const wasGroupSessionActive = useRef<boolean>(false);
  // Track if a sync is pending to prevent duplicate triggers
  const syncPending = useRef<boolean>(false);
  // Track active timers for cleanup
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Memoized sync function that checks isSyncing at execution time (not capture time)
  const triggerSync = useCallback(async (userId: string, reason: string) => {
    // Check isSyncing from store directly at execution time
    const currentIsSyncing = useSyncStore.getState().isSyncing;

    if (syncPending.current || currentIsSyncing) {
      if (__DEV__) {
        console.log(`[useAutoSync] Skipping ${reason} sync - already syncing`);
      }
      return;
    }

    syncPending.current = true;
    try {
      if (__DEV__) {
        console.log(`[useAutoSync] ${reason}, triggering sync`);
      }
      await sync(userId);
    } finally {
      syncPending.current = false;
    }
  }, [sync]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const isOnline = isConnected === true && isInternetReachable !== false;
    const currentlyOffline = !isOnline;

    // Check if we just came online (was offline, now online)
    if (wasOffline.current === true && !currentlyOffline && user?.id) {
      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Small delay to ensure network is stable
      timerRef.current = setTimeout(() => {
        triggerSync(user.id, 'Network restored');
      }, 1000);
    }

    wasOffline.current = currentlyOffline;
  }, [isConnected, isInternetReachable, user?.id, triggerSync]);

  // Auto-sync when session ends
  useEffect(() => {
    // Check if session just ended (was active, now not active)
    if (wasSessionActive.current && !isSessionActive && user?.id) {
      const isOnline = isConnected === true && isInternetReachable !== false;
      if (isOnline) {
        // Clear any existing timer
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        // Small delay to ensure session data is persisted
        timerRef.current = setTimeout(() => {
          triggerSync(user.id, 'Session ended');
        }, 500);
      }
    }

    wasSessionActive.current = isSessionActive;
  }, [isSessionActive, user?.id, isConnected, isInternetReachable, triggerSync]);

  // Auto-sync when group session ends (status changes from 'active' to 'completed')
  useEffect(() => {
    const isGroupActive = groupActiveSession?.session.status === 'active';

    if (wasGroupSessionActive.current && !isGroupActive && user?.id) {
      const isOnline = isConnected === true && isInternetReachable !== false;
      if (isOnline) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        timerRef.current = setTimeout(() => {
          triggerSync(user.id, 'Group session ended');
        }, 500);
      }
    }

    wasGroupSessionActive.current = isGroupActive;
  }, [groupActiveSession?.session.status, user?.id, isConnected, isInternetReachable, triggerSync]);

  // Refresh unsynced count when user changes or on mount
  useEffect(() => {
    if (user?.id) {
      refreshUnsyncedCount();
    }
  }, [user?.id, refreshUnsyncedCount]);
}
