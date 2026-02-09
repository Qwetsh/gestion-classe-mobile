import { create } from 'zustand';
import NetInfo, { NetInfoState, NetInfoSubscription } from '@react-native-community/netinfo';

interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string | null;

  // Actions
  initialize: () => () => void;
  updateStatus: (state: NetInfoState) => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: null,
  isInternetReachable: null,
  connectionType: null,

  initialize: () => {
    // Fetch initial state
    NetInfo.fetch().then((state) => {
      get().updateStatus(state);
    });

    // Subscribe to changes
    const unsubscribe: NetInfoSubscription = NetInfo.addEventListener((state) => {
      get().updateStatus(state);
    });

    // Return cleanup function
    return unsubscribe;
  },

  updateStatus: (state: NetInfoState) => {
    const { isConnected, isInternetReachable } = get();

    // Only update if status changed
    if (state.isConnected !== isConnected || state.isInternetReachable !== isInternetReachable) {
      console.log('[networkStore] Status changed:', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });

      set({
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      });
    }
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
