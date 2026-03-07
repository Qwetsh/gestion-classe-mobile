import { create } from 'zustand';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

// Debounce delay to prevent rapid state changes (WiFi dropout/reconnect)
const DEBOUNCE_DELAY = 500; // ms

interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string | null;

  // Actions
  initialize: () => () => void;
  updateStatus: (state: NetInfoState) => void;
}

// Debounce timer stored outside Zustand to avoid re-renders
let debounceTimer: NodeJS.Timeout | null = null;
let pendingState: NetInfoState | null = null;

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: null,
  isInternetReachable: null,
  connectionType: null,

  initialize: () => {
    // Fetch initial state (no debounce for initial)
    NetInfo.fetch().then((state) => {
      // Directly set initial state without debounce
      set({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      });
    });

    // Subscribe to changes with debouncing
    const unsubscribe: NetInfoSubscription = NetInfo.addEventListener((state) => {
      get().updateStatus(state);
    });

    // Return cleanup function
    return () => {
      unsubscribe();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    };
  },

  updateStatus: (state: NetInfoState) => {
    const { isConnected, isInternetReachable } = get();

    // Only process if status actually changed
    if (state.isConnected === isConnected && state.isInternetReachable === isInternetReachable) {
      return;
    }

    // Store pending state and debounce
    pendingState = state;

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new debounced update
    debounceTimer = setTimeout(() => {
      if (!pendingState) return;

      if (__DEV__) {
        console.log('[networkStore] Status changed (debounced):', {
          isConnected: pendingState.isConnected,
          isInternetReachable: pendingState.isInternetReachable,
          type: pendingState.type,
        });
      }

      set({
        isConnected: pendingState.isConnected,
        isInternetReachable: pendingState.isInternetReachable,
        connectionType: pendingState.type,
      });

      pendingState = null;
      debounceTimer = null;
    }, DEBOUNCE_DELAY);
  },
}));

// Convenience hook
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkStore();

  // If we haven't determined status yet, assume online
  if (isConnected === null) return false;

  // Offline if not connected or internet not reachable
  return !isConnected || isInternetReachable === false;
}
