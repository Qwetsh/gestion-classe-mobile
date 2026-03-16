import { create } from 'zustand';
import { Platform } from 'react-native';
import {
  signUp as supabaseSignUp,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  getCurrentUser,
  type AuthUser,
} from '../services/supabase';
import { supabase } from '../services/supabase';

async function getDeviceInfo(): Promise<string> {
  try {
    const Device = await import('expo-device');
    const parts = [
      Platform.OS,
      String(Platform.Version),
      Device.modelName,
      Device.manufacturer,
      Device.osName,
      Device.osVersion,
    ].filter(Boolean);
    return parts.join(' / ') || Platform.OS;
  } catch {
    return Platform.OS;
  }
}

async function trackDevice(user: AuthUser) {
  try {
    if (!supabase) return;
    const deviceInfo = await getDeviceInfo();
    supabase.rpc('track_user_activity', {
      p_user_id: user.id,
      p_user_email: user.email,
      p_device_info: deviceInfo,
    }).catch(() => {});
    supabase.rpc('log_device_connection', {
      p_user_id: user.id,
      p_user_email: user.email,
      p_device_info: deviceInfo,
      p_platform: 'mobile',
    }).catch(() => {});
  } catch {
    // Never block auth flow
  }
}

interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  user: AuthUser | null;
  error: string | null;

  // Actions
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true, // Start with loading true for initial auth check
  isInitialized: false,
  user: null,
  error: null,

  // Sign up new user
  signUp: async (email: string, password: string): Promise<boolean> => {
    set({ isLoading: true, error: null });

    const result = await supabaseSignUp(email, password);

    if (result.success && result.data) {
      set({
        isAuthenticated: true,
        user: result.data,
        isLoading: false,
        error: null,
      });
      trackDevice(result.data);
      return true;
    } else {
      set({
        isLoading: false,
        error: result.error || 'Erreur lors de l\'inscription',
      });
      return false;
    }
  },

  // Sign in existing user
  signIn: async (email: string, password: string): Promise<boolean> => {
    set({ isLoading: true, error: null });

    const result = await supabaseSignIn(email, password);

    if (result.success && result.data) {
      set({
        isAuthenticated: true,
        user: result.data,
        isLoading: false,
        error: null,
      });
      trackDevice(result.data);
      return true;
    } else {
      set({
        isLoading: false,
        error: result.error || 'Erreur lors de la connexion',
      });
      return false;
    }
  },

  // Sign out
  signOut: async (): Promise<void> => {
    set({ isLoading: true });

    await supabaseSignOut();

    set({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,
    });
  },

  // Check if user is already authenticated (on app start)
  checkAuth: async (): Promise<void> => {
    set({ isLoading: true });

    const result = await getCurrentUser();

    if (result.success && result.data) {
      set({
        isAuthenticated: true,
        user: result.data,
        isLoading: false,
        isInitialized: true,
      });
      trackDevice(result.data);
    } else {
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  // Clear error
  clearError: (): void => {
    set({ error: null });
  },
}));
