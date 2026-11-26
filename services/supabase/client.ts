import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// Hardcoded values - anon key is public and safe to include in client code
const supabaseUrl = 'https://djodkjysovalpufgevrr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqb2Rranlzb3ZhbHB1ZmdldnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNTIwNTAsImV4cCI6MjA4NTcyODA1MH0._nUF3GtZLogIGRJqs4V9Eze0CArIz3dP15n-Y-N6rps';

/**
 * Clé sous laquelle la session est rangée dans le SecureStore. C'est exactement la clé par
 * défaut de supabase-js (« sb-<référence du projet>-auth-token ») : la donner explicitement
 * au client ne change donc rien aux sessions déjà enregistrées, mais permet de relire la
 * session au démarrage sans passer par le client (voir getStoredUser dans auth.ts).
 * Verrouillée par __tests__/services/authOffline.test.ts.
 */
export const AUTH_STORAGE_KEY = `sb-${supabaseUrl.replace(/^https?:\/\//, '').split('.')[0]}-auth-token`;

// Custom storage adapter using Expo SecureStore
export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('[Supabase] SecureStore setItem error:', error);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('[Supabase] SecureStore removeItem error:', error);
    }
  },
};

// Check if Supabase is configured
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Create Supabase client (or null if not configured)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: authStorage,
        storageKey: AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Log configuration status
if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env'
  );
}
