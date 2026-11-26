import { create } from 'zustand';
import { Platform } from 'react-native';
import {
  signUp as supabaseSignUp,
  signIn as supabaseSignIn,
  signOut as supabaseSignOut,
  getStoredUser,
  validateSession,
  clearStoredSession,
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
    }).then(undefined, () => {});
    supabase.rpc('log_device_connection', {
      p_user_id: user.id,
      p_user_email: user.email,
      p_device_info: deviceInfo,
      p_platform: 'mobile',
    }).then(undefined, () => {});
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
  /**
   * Le serveur a refusé la session enregistrée (révoquée, compte supprimé) lors de la
   * vérification d'arrière-plan : app/(main)/_layout.tsx renvoie alors à la connexion.
   */
  sessionRevoked: boolean;

  // Actions
  signUp: (email: string, password: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  isLoading: true, // Start with loading true for initial auth check
  isInitialized: false,
  user: null,
  error: null,
  sessionRevoked: false,

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
        sessionRevoked: false,
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
        sessionRevoked: false,
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

  // Au démarrage : « connecté ou non » se décide sur la session enregistrée dans le téléphone,
  // sans réseau, pour que l'app s'ouvre en classe même hors ligne. Le serveur n'est consulté
  // qu'ensuite, en arrière-plan, et ne déconnecte que s'il refuse vraiment la session.
  checkAuth: async (): Promise<void> => {
    set({ isLoading: true });

    let stored: AuthUser | null = null;
    try {
      stored = await getStoredUser();
    } catch {
      stored = null;
    }

    if (!stored) {
      set({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }

    set({
      isAuthenticated: true,
      user: stored,
      isLoading: false,
      isInitialized: true,
      sessionRevoked: false,
    });

    // Volontairement pas de « await » : l'écran n'attend pas le serveur.
    const storedId = stored.id;
    void (async () => {
      let check: Awaited<ReturnType<typeof validateSession>>;
      try {
        check = await validateSession();
      } catch {
        return; // imprévu : on reste connecté
      }

      // Entre-temps, déconnexion manuelle ou autre compte : cette réponse ne concerne plus personne.
      const current = get();
      if (!current.isAuthenticated || current.user?.id !== storedId) return;

      if (check.status === 'valid') {
        if (check.user.email && check.user.email !== current.user.email) {
          set({ user: check.user });
        }
        trackDevice(check.user);
      } else if (check.status === 'revoked') {
        try {
          await clearStoredSession();
        } catch {
          // sans gravité : la session est de toute façon refusée par le serveur
        }
        set({
          isAuthenticated: false,
          user: null,
          sessionRevoked: true,
          error: "Votre session n'est plus valide. Reconnectez-vous.",
        });
      }
      // 'unreachable' (pas de réseau, délai dépassé, serveur en panne) : on reste connecté.
    })();
  },

  // Clear error
  clearError: (): void => {
    set({ error: null });
  },
}));
