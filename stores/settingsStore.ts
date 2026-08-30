import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'session_settings_v1';

export interface SessionSettings {
  /** Mode expert : un flick rapide valide l'action sans afficher le menu radial. */
  flickMode: boolean;
  /** Signatures haptiques differenciees par action. */
  distinctHaptics: boolean;
  /** Grille compacte du plan de classe (gap 3px, cellules <= 60px). */
  compactGrid: boolean;
}

const DEFAULT_SETTINGS: SessionSettings = {
  flickMode: false,
  distinctHaptics: true,
  compactGrid: true,
};

interface SettingsState extends SessionSettings {
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setSetting: <K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) => void;
}

async function persist(settings: SessionSettings) {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Persistance best-effort : les valeurs par defaut restent utilisables
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SessionSettings>;
        set({ ...DEFAULT_SETTINGS, ...parsed, isLoaded: true });
        return;
      }
    } catch {
      // Valeurs par defaut en cas d'erreur de lecture
    }
    set({ isLoaded: true });
  },

  setSetting: (key, value) => {
    set({ [key]: value } as Pick<SettingsState, typeof key>);
    const { flickMode, distinctHaptics, compactGrid } = get();
    persist({ flickMode, distinctHaptics, compactGrid });
  },
}));
