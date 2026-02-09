import { create } from 'zustand';
import {
  signUp as supabaseSignUp,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  getCurrentUser,
  type AuthUser,
} from '../services/supabase';

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
