import { create } from 'zustand';
import {
  type Session,
  getSessionsByUserId,
  getSessionsByClassId,
  getSessionById,
  type Event,
  getEventsBySessionId,
  getEventsByStudentId,
} from '../services/database';

interface HistoryState {
  // Session history
  sessions: Session[];
  selectedSession: Session | null;
  sessionEvents: Event[];

  // Student history
  studentEvents: Event[];

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSessionHistory: (userId: string) => Promise<void>;
  loadSessionsByClass: (classId: string) => Promise<void>;
  loadSessionDetail: (sessionId: string) => Promise<void>;
  loadStudentHistory: (studentId: string) => Promise<void>;
  clearHistory: () => void;
  clearError: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],
  selectedSession: null,
  sessionEvents: [],
  studentEvents: [],
  isLoading: false,
  error: null,

  loadSessionHistory: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await getSessionsByUserId(userId);
      // Filter only ended sessions (ended_at is not null)
      const endedSessions = sessions.filter((s: Session) => s.ended_at !== null);
      set({ sessions: endedSessions, isLoading: false });
    } catch (error) {
      console.error('[historyStore] Failed to load session history:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoading: false,
      });
    }
  },

  loadSessionsByClass: async (classId: string) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await getSessionsByClassId(classId);
      // Filter only ended sessions
      const endedSessions = sessions.filter((s: Session) => s.ended_at !== null);
      set({ sessions: endedSessions, isLoading: false });
    } catch (error) {
      console.error('[historyStore] Failed to load sessions by class:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoading: false,
      });
    }
  },

  loadSessionDetail: async (sessionId: string) => {
    set({ isLoading: true, error: null });
    try {
      const [session, events] = await Promise.all([
        getSessionById(sessionId),
        getEventsBySessionId(sessionId),
      ]);
      set({
        selectedSession: session,
        sessionEvents: events,
        isLoading: false,
      });
    } catch (error) {
      console.error('[historyStore] Failed to load session detail:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoading: false,
      });
    }
  },

  loadStudentHistory: async (studentId: string) => {
    set({ isLoading: true, error: null });
    try {
      const events = await getEventsByStudentId(studentId);
      set({ studentEvents: events, isLoading: false });
    } catch (error) {
      console.error('[historyStore] Failed to load student history:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoading: false,
      });
    }
  },

  clearHistory: () => {
    set({
      sessions: [],
      selectedSession: null,
      sessionEvents: [],
      studentEvents: [],
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
