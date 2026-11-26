export { supabase, isSupabaseConfigured } from './client';
export {
  signUp,
  signIn,
  signOut,
  getSession,
  getCurrentUser,
  getStoredUser,
  clearStoredSession,
  validateSession,
  parseStoredUser,
  classifyAuthError,
  type SessionCheck,
  type AuthResult,
  type AuthUser,
} from './auth';
