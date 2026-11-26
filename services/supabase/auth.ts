import { supabase, isSupabaseConfigured, authStorage, AUTH_STORAGE_KEY } from './client';
import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js';
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
      // Hors ligne, supabase-js laisse la session en place. Le démarrage se fiant désormais
      // à la session enregistrée, on l'efface nous-mêmes : une déconnexion doit tenir.
      await clearStoredSession();
      return {
        success: false,
        error: translateAuthError(error),
      };
    }

    return { success: true };
  } catch (err) {
    console.error('[Auth] signOut error:', err);
    await clearStoredSession();
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

/**
 * Démarrage hors ligne
 * --------------------
 * Au lancement, on ne peut PAS demander à supabase-js si l'on est connecté :
 * - getUser() interroge le serveur ;
 * - getSession() attend l'initialisation du client et, dès que le jeton d'accès est expiré
 *   (il ne vit qu'une heure), tente de le rafraîchir par le réseau, avec jusqu'à 30 s de
 *   nouvelles tentatives, puis répond « pas de session ».
 * Sans réseau, les deux renvoyaient donc l'enseignant à l'écran de connexion, inutilisable
 * en classe. On lit à la place la session telle qu'elle est rangée dans le SecureStore.
 */

/**
 * Utilisateur de la session enregistrée (texte brut du SecureStore), ou null s'il n'y en a pas.
 * L'expiration du jeton d'accès est volontairement ignorée : c'est le jeton de
 * rafraîchissement qui fait foi, et lui ne se vérifie qu'auprès du serveur (validateSession).
 */
export function parseStoredUser(raw: string | null | undefined): AuthUser | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const session = parsed as { access_token?: unknown; refresh_token?: unknown; user?: unknown };
  if (typeof session.access_token !== 'string' || !session.access_token) return null;
  if (typeof session.refresh_token !== 'string' || !session.refresh_token) return null;
  if (typeof session.user !== 'object' || session.user === null) return null;
  const user = session.user as { id?: unknown; email?: unknown };
  if (typeof user.id !== 'string' || !user.id) return null;
  return { id: user.id, email: typeof user.email === 'string' ? user.email : '' };
}

/**
 * Qui est connecté d'après le téléphone seul : lecture du SecureStore, aucun appel réseau,
 * aucune attente du client Supabase. À utiliser au démarrage.
 */
export async function getStoredUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  return parseStoredUser(await authStorage.getItem(AUTH_STORAGE_KEY));
}

/** Efface la session enregistrée sur le téléphone, sans appel réseau. */
export async function clearStoredSession(): Promise<void> {
  await authStorage.removeItem(AUTH_STORAGE_KEY);
}

/**
 * Une erreur d'authentification veut-elle dire « session refusée par le serveur » (révoquée,
 * utilisateur supprimé, jeton de rafraîchissement inconnu) ou seulement « serveur injoignable » ?
 * Dans le doute (réseau coupé, délai dépassé, 5xx, 429, page d'un portail captif, erreur
 * inconnue) on répond « injoignable » : mieux vaut rester connecté à tort que perdre l'accès
 * en classe.
 */
export function classifyAuthError(error: unknown): 'revoked' | 'unreachable' {
  if (isAuthSessionMissingError(error)) return 'revoked';
  if (isAuthApiError(error) && [400, 401, 403, 404].includes(error.status)) return 'revoked';
  return 'unreachable';
}

export type SessionCheck =
  | { status: 'valid'; user: AuthUser }
  | { status: 'revoked' }
  | { status: 'unreachable' };

/**
 * Vérifie la session auprès du serveur. Peut durer (jusqu'à ~30 s sans réseau) : à lancer en
 * arrière-plan, jamais avant d'afficher l'écran. Ne lève pas d'exception.
 */
export async function validateSession(): Promise<SessionCheck> {
  if (!isSupabaseConfigured || !supabase) return { status: 'unreachable' };

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return { status: classifyAuthError(error) };
    if (!data.user) return { status: 'unreachable' };
    return { status: 'valid', user: { id: data.user.id, email: data.user.email || '' } };
  } catch (err) {
    console.warn('[Auth] validateSession error:', err);
    return { status: 'unreachable' };
  }
}
