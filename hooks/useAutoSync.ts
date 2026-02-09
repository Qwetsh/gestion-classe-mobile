import { useEffect, useRef } from 'react';
import { useAuthStore, useNetworkStore, useSyncStore, useSessionStore } from '../stores';

/**
 * Hook that handles automatic synchronization:
 * 1. When network status changes from offline to online
 * 2. When a session ends
 */
export function useAutoSync() {
  const { user } = useAuthStore();
  const { isConnected, isInternetReachable } = useNetworkStore();
  const { sync, isSyncing, refreshUnsyncedCount } = useSyncStore();
  const { isSessionActive } = useSessionStore();

  // Track previous network state
  const wasOffline = useRef<boolean | null>(null);
  // Track previous session state
  const wasSessionActive = useRef<boolean>(false);

  // Auto-sync when coming back online
  useEffect(() => {
    const isOnline = isConnected === true && isInternetReachable !== false;
    const currentlyOffline = !isOnline;

    // Check if we just came online (was offline, now online)
    if (wasOffline.current === true && !currentlyOffline) {
      console.log('[useAutoSync] Network restored, triggering sync');
      if (user?.id && !isSyncing) {
        // Small delay to ensure network is stable
        const timer = setTimeout(() => {
          sync(user.id);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }

    wasOffline.current = currentlyOffline;
  }, [isConnected, isInternetReachable, user?.id, isSyncing]);

  // Auto-sync when session ends
  useEffect(() => {
    // Check if session just ended (was active, now not active)
    if (wasSessionActive.current && !isSessionActive) {
      console.log('[useAutoSync] Session ended, triggering sync');
      const isOnline = isConnected === true && isInternetReachable !== false;
      if (user?.id && !isSyncing && isOnline) {
        // Small delay to ensure session data is persisted
        const timer = setTimeout(() => {
          sync(user.id);
        }, 500);
        return () => clearTimeout(timer);
      }
    }

    wasSessionActive.current = isSessionActive;
  }, [isSessionActive, user?.id, isSyncing, isConnected, isInternetReachable]);

  // Refresh unsynced count when user changes or on mount
  useEffect(() => {
    if (user?.id) {
      refreshUnsyncedCount();
    }
  }, [user?.id]);
}
