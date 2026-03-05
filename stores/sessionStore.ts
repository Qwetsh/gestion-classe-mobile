import { create } from 'zustand';
import {
  Session,
  createSession,
  endSession,
  deleteSession,
  getActiveSession,
  getSessionsByUserId,
  cleanupOrphanSessions,
  Event,
  EventType,
  SortieSubtype,
  createEvent,
  deleteEvent,
  getEventsBySessionId,
  getAllStudentEventCounts,
  StudentEventCounts,
} from '../services/database';

// Track pending event creations to prevent double-tap duplicates
const pendingEvents = new Set<string>();

interface SessionState {
  // Active session
  activeSession: Session | null;
  isSessionActive: boolean;

  // Session events
  events: Event[];
  eventCountsByStudent: Record<string, StudentEventCounts>;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Actions
  startSession: (userId: string, classId: string, roomId: string, topic?: string | null) => Promise<Session>;
  endCurrentSession: () => Promise<void>;
  cancelCurrentSession: () => Promise<void>;
  loadActiveSession: (userId: string) => Promise<void>;
  loadSessionEvents: () => Promise<void>;

  // Event actions
  addEvent: (
    studentId: string,
    type: EventType,
    subtype?: SortieSubtype | null,
    note?: string | null,
    photoPath?: string | null
  ) => Promise<Event | null>;
  removeAbsence: (studentId: string) => Promise<boolean>;

  // Reset
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  isSessionActive: false,
  events: [],
  eventCountsByStudent: {},
  isLoading: false,
  error: null,

  startSession: async (userId: string, classId: string, roomId: string, topic?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const session = await createSession(userId, classId, roomId, topic);
      set({
        activeSession: session,
        isSessionActive: true,
        events: [],
        eventCountsByStudent: {},
        isLoading: false,
      });
      console.log('[sessionStore] Session started:', session.id, 'topic:', topic);
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start session';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  endCurrentSession: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    const sessionId = activeSession.id;

    set({ isLoading: true, error: null });
    try {
      await endSession(sessionId);

      // Clear state immediately - the DB operation is synchronous in SQLite
      set({
        activeSession: null,
        isSessionActive: false,
        events: [],
        eventCountsByStudent: {},
        isLoading: false,
      });

      if (__DEV__) {
        console.log('[sessionStore] Session ended:', sessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end session';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  cancelCurrentSession: async () => {
    const { activeSession } = get();
    if (!activeSession) {
      console.log('[sessionStore] cancelCurrentSession: No active session to cancel');
      return;
    }

    const sessionId = activeSession.id;
    console.log('[sessionStore] cancelCurrentSession: Starting deletion of session:', sessionId);

    set({ isLoading: true, error: null });
    try {
      // Delete the session and all its events
      console.log('[sessionStore] Calling deleteSession...');
      await deleteSession(sessionId);
      console.log('[sessionStore] deleteSession completed successfully');

      // Verify deletion by trying to fetch the session again
      const verifySession = await getActiveSession(activeSession.user_id);
      if (verifySession && verifySession.id === sessionId) {
        console.error('[sessionStore] CRITICAL: Session still exists after deletion!');
        throw new Error('La session existe toujours apres suppression');
      }
      console.log('[sessionStore] Verification passed: session no longer exists');

      // Force clear the state
      set({
        activeSession: null,
        isSessionActive: false,
        events: [],
        eventCountsByStudent: {},
        isLoading: false,
      });
      console.log('[sessionStore] Session cancelled and deleted:', sessionId);
    } catch (error) {
      console.error('[sessionStore] cancelCurrentSession ERROR:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel session';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  loadActiveSession: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Cleanup orphan sessions (active sessions older than 4 hours)
      // This handles cases where app crashed or was force-quit without ending the session
      // 4 hours is generous - a typical class session is 1-2 hours max
      const cleanedUp = await cleanupOrphanSessions(userId, 4);
      if (cleanedUp > 0) {
        console.log(`[sessionStore] Auto-ended ${cleanedUp} orphan session(s)`);
      }

      const session = await getActiveSession(userId);

      if (__DEV__) {
        console.log('[sessionStore] loadActiveSession result:', session?.id ?? 'null', 'ended_at:', session?.ended_at ?? 'N/A');
      }

      // Double-check: only set as active if session exists AND has no ended_at
      if (session && !session.ended_at) {
        set({
          activeSession: session,
          isSessionActive: true,
          isLoading: false,
        });
        // Load events for the session
        await get().loadSessionEvents();
      } else {
        set({
          activeSession: null,
          isSessionActive: false,
          isLoading: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load session';
      set({ error: message, isLoading: false });
    }
  },

  loadSessionEvents: async () => {
    const { activeSession } = get();
    if (!activeSession) return;

    try {
      const [events, eventCountsByStudent] = await Promise.all([
        getEventsBySessionId(activeSession.id),
        getAllStudentEventCounts(activeSession.id),
      ]);
      set({ events, eventCountsByStudent });
    } catch (error) {
      console.error('[sessionStore] Failed to load events:', error);
    }
  },

  addEvent: async (
    studentId: string,
    type: EventType,
    subtype?: SortieSubtype | null,
    note?: string | null,
    photoPath?: string | null
  ) => {
    const { activeSession } = get();
    if (!activeSession) {
      if (__DEV__) console.warn('[sessionStore] No active session for event');
      return null;
    }

    // Prevent double-tap: create unique key for this event request
    const eventKey = `${studentId}-${type}-${Date.now().toString().slice(0, -2)}`;
    if (pendingEvents.has(eventKey)) {
      if (__DEV__) console.log('[sessionStore] Duplicate event prevented:', eventKey);
      return null;
    }
    pendingEvents.add(eventKey);

    try {
      const event = await createEvent(
        activeSession.id,
        studentId,
        type,
        subtype,
        note,
        photoPath
      );

      // Update local state
      set((state) => {
        const newEvents = [...state.events, event];

        // Update counts for this student
        const currentCounts = state.eventCountsByStudent[studentId] || {
          participation: 0,
          bavardage: 0,
          absence: 0,
          remarque: 0,
          sortie: 0,
        };

        const updatedCounts = { ...currentCounts };
        switch (type) {
          case 'participation':
            updatedCounts.participation++;
            break;
          case 'bavardage':
            updatedCounts.bavardage++;
            break;
          case 'absence':
            updatedCounts.absence++;
            break;
          case 'remarque':
            updatedCounts.remarque++;
            break;
          case 'sortie':
            updatedCounts.sortie++;
            break;
        }

        return {
          events: newEvents,
          eventCountsByStudent: {
            ...state.eventCountsByStudent,
            [studentId]: updatedCounts,
          },
        };
      });

      if (__DEV__) {
        console.log('[sessionStore] Event added:', type, 'for student:', studentId);
      }
      return event;
    } catch (error) {
      if (__DEV__) console.error('[sessionStore] Failed to add event:', error);
      return null;
    } finally {
      // Clean up pending event key after a short delay
      setTimeout(() => pendingEvents.delete(eventKey), 500);
    }
  },

  removeAbsence: async (studentId: string) => {
    const { activeSession, events } = get();
    if (!activeSession) {
      console.warn('[sessionStore] No active session for removing absence');
      return false;
    }

    try {
      // Find the absence event for this student in the current session
      const absenceEvent = events.find(
        (e) => e.student_id === studentId && e.type === 'absence'
      );

      if (!absenceEvent) {
        console.warn('[sessionStore] No absence event found for student:', studentId);
        return false;
      }

      // Delete the event from database
      await deleteEvent(absenceEvent.id);

      // Update local state
      set((state) => {
        const newEvents = state.events.filter((e) => e.id !== absenceEvent.id);

        // Update counts for this student
        const currentCounts = state.eventCountsByStudent[studentId];
        if (currentCounts) {
          const updatedCounts = {
            ...currentCounts,
            absence: Math.max(0, currentCounts.absence - 1),
          };

          return {
            events: newEvents,
            eventCountsByStudent: {
              ...state.eventCountsByStudent,
              [studentId]: updatedCounts,
            },
          };
        }

        return { events: newEvents };
      });

      console.log('[sessionStore] Absence removed for student:', studentId);
      return true;
    } catch (error) {
      console.error('[sessionStore] Failed to remove absence:', error);
      return false;
    }
  },

  clearSession: () => {
    set({
      activeSession: null,
      isSessionActive: false,
      events: [],
      eventCountsByStudent: {},
      error: null,
    });
  },
}));
