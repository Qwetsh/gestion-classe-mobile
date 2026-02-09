import { supabase, isSupabaseConfigured } from './client';
import type { User, Session, AuthError } from '@supabase/supabase-js';

export interface AuthResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Translate Supabase auth errors to French
 */
function translateAuthError(error: AuthError): string {
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Email ou mot de passe incorrect',
    'Email not confirmed': 'Veuillez confirmer votre email',
    'User already registered': 'Cet email est deja utilise',
    'Password should be at least 6 characters':
      'Le mot de passe doit contenir au moins 6 caracteres',
    'Unable to validate email address: invalid format':
      'Format email invalide',
    'Signup requires a valid password': 'Mot de passe requis',
    'Anonymous sign-ins are disabled': 'Connexion anonyme desactivee',
    'Email rate limit exceeded': 'Trop de tentatives, reessayez plus tard',
  };

  return errorMessages[error.message] || error.message;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(
  email: string,
  password: string
): Promise<AuthResult<AuthUser>> {
  // Check if Supabase is configured
  if (!isSupabaseConfigured || !supabase) {
    console.warn('[Auth] Supabase not configured, using demo mode');
    // Demo mode: simulate successful signup
    return {
      success: true,
      data: {
        id: 'demo-user-' + Date.now(),
        email: email,
      },
    };
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Erreur lors de la creation du compte',
      };
    }

    return {
      success: true,
      data: {
        id: data.user.id,
        email: data.user.email || email,
      },
    };
  } catch (err) {
    console.error('[Auth] signUp error:', err);
    return {
      success: false,
      error: 'Erreur de connexion au serveur',
    };
  }
}

/**
 * Sign in an existing user with email and password
 */
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult<AuthUser>> {
  if (!isSupabaseConfigured || !supabase) {
    console.warn('[Auth] Supabase not configured, using demo mode');
    return {
      success: true,
      data: {
        id: 'demo-user-' + Date.now(),
        email: email,
      },
    };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    if (!data.user) {
      return {
        success: false,
        error: 'Erreur lors de la connexion',
      };
    }

    return {
      success: true,
      data: {
        id: data.user.id,
        email: data.user.email || email,
      },
    };
  } catch (err) {
    console.error('[Auth] signIn error:', err);
    return {
      success: false,
      error: 'Erreur de connexion au serveur',
    };
  }
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<AuthResult<void>> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true };
  }

  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    return { success: true };
  } catch (err) {
    console.error('[Auth] signOut error:', err);
    return {
      success: false,
      error: 'Erreur lors de la deconnexion',
    };
  }
}

/**
 * Get the current session
 */
export async function getSession(): Promise<AuthResult<Session | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, data: null };
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    return { success: true, data: data.session };
  } catch (err) {
    console.error('[Auth] getSession error:', err);
    return {
      success: false,
      error: 'Erreur lors de la recuperation de la session',
    };
  }
}

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<AuthResult<AuthUser | null>> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: true, data: null };
  }

  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    if (!data.user) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: data.user.id,
        email: data.user.email || '',
      },
    };
  } catch (err) {
    console.error('[Auth] getCurrentUser error:', err);
    return {
      success: false,
      error: 'Erreur lors de la recuperation de l\'utilisateur',
    };
  }
}
