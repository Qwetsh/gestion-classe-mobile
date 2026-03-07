import { create } from 'zustand';
import {
  Session,
  createSession,
  endSession,
  deleteSession,
  getActiveSession,
  getSessionsByUserId,
  cleanupOrphanSessions,
  updateSessionNotes,
  Event,
  EventType,
  SortieSubtype,
  createEvent,
  deleteEvent,
  getEventsBySessionId,
  getAllStudentEventCounts,
  StudentEventCounts,
} from '../services/database';

// Orphan session cleanup threshold (in hours)
// Sessions older than this and still "active" are auto-ended
// A typical class is 1-2 hours, so 4 hours is generous
const ORPHAN_SESSION_TIMEOUT_HOURS = 4;

// Active sortie info
interface ActiveSortie {
  eventId: string;
  timestamp: string;
  subtype: SortieSubtype | null;
}

interface SessionState {
  // Active session
  activeSession: Session | null;
  isSessionActive: boolean;

  // Session events
  events: Event[];
  eventCountsByStudent: Record<string, StudentEventCounts>;

  // Active sorties (students currently out)
  activeSorties: Record<string, ActiveSortie>;

  // Loading states
  isLoading: boolean;
  error: string | null;

  // Internal: track pending events to prevent double-tap (managed inside store)
  _pendingEventKeys: Set<string>;

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
  markReturn: (studentId: string) => Promise<boolean>;
  isStudentOut: (studentId: string) => boolean;
  getActiveSortie: (studentId: string) => ActiveSortie | null;

  // Session notes
  updateNotes: (notes: string | null) => Promise<void>;

  // Reset
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSession: null,
  isSessionActive: false,
  events: [],
  eventCountsByStudent: {},
  activeSorties: {},
  isLoading: false,
  error: null,
  _pendingEventKeys: new Set<string>(),

  startSession: async (userId: string, classId: string, roomId: string, topic?: string | null) => {
    set({ isLoading: true, error: null });
    try {
      const session = await createSession(userId, classId, roomId, topic);
      set({
        activeSession: session,
        isSessionActive: true,
        events: [],
        eventCountsByStudent: {},
        activeSorties: {},
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

    // Set loading state but keep session data until DB confirms
    set({ isLoading: true, error: null });

    try {
      // CRITICAL: Complete DB operation FIRST
      // This ensures we don't clear UI state if DB fails
      await endSession(sessionId);

      // Only clear state after DB success
      set({
        activeSession: null,
        isSessionActive: false,
        events: [],
        eventCountsByStudent: {},
        activeSorties: {},
        isLoading: false,
        error: null,
        _pendingEventKeys: new Set<string>(),
      });

      if (__DEV__) {
        console.log('[sessionStore] Session ended:', sessionId);
      }
    } catch (error) {
      // DB operation failed - keep session state so user can retry
      // The orphan cleanup mechanism will handle truly stuck sessions
      const message = error instanceof Error ? error.message : 'Failed to end session';
      console.error('[sessionStore] endSession DB error:', message);
      set({ error: message, isLoading: false });
      // Re-throw so caller knows it failed
      throw error;
    }
  },

  cancelCurrentSession: async () => {
    const { activeSession } = get();
    if (!activeSession) {
      if (__DEV__) {
        console.log('[sessionStore] cancelCurrentSession: No active session to cancel');
      }
      return;
    }

    const sessionId = activeSession.id;
    const userId = activeSession.user_id;

    if (__DEV__) {
      console.log('[sessionStore] cancelCurrentSession: Starting deletion of session:', sessionId);
    }

    // Set loading state but keep session data until DB confirms
    set({ isLoading: true, error: null });

    try {
      // CRITICAL: Complete DB operation FIRST
      await deleteSession(sessionId);

      // Verify deletion
      const verifySession = await getActiveSession(userId);
      if (verifySession && verifySession.id === sessionId) {
        console.error('[sessionStore] CRITICAL: Session still exists after deletion!');
        throw new Error('Session deletion verification failed');
      }

      // Only clear state after DB success
      set({
        activeSession: null,
        isSessionActive: false,
        events: [],
        eventCountsByStudent: {},
        activeSorties: {},
        isLoading: false,
        error: null,
        _pendingEventKeys: new Set<string>(),
      });

      if (__DEV__) {
        console.log('[sessionStore] Session cancelled and deleted:', sessionId);
      }
    } catch (error) {
      // DB operation failed - keep session state so user can retry
      console.error('[sessionStore] cancelCurrentSession DB error:', error);
      const message = error instanceof Error ? error.message : 'Failed to cancel session';
      set({ error: message, isLoading: false });
      // Re-throw so caller knows it failed
      throw error;
    }
  },

  loadActiveSession: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      // Cleanup orphan sessions (active sessions older than configured threshold)
      // This handles cases where app crashed or was force-quit without ending the session
      const cleanedUp = await cleanupOrphanSessions(userId, ORPHAN_SESSION_TIMEOUT_HOURS);
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
          // Keep isLoading true until events are loaded
        });
        // Load events for the session, then set loading to false
        await get().loadSessionEvents();
        set({ isLoading: false });
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

      // Compute active sorties from events
      // A student is "out" if their last sortie/retour event is a sortie
      const activeSorties: Record<string, ActiveSortie> = {};
      const sortedEvents = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      for (const event of sortedEvents) {
        if (event.type === 'sortie') {
          activeSorties[event.student_id] = {
            eventId: event.id,
            timestamp: event.timestamp,
            subtype: event.subtype as SortieSubtype | null,
          };
        } else if (event.type === 'retour') {
          delete activeSorties[event.student_id];
        }
      }

      set({ events, eventCountsByStudent, activeSorties });
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
    const { activeSession, _pendingEventKeys } = get();
    if (!activeSession) {
      if (__DEV__) console.warn('[sessionStore] No active session for event');
      return null;
    }

    // Prevent double-tap: create unique key for this event request
    // Using 100ms time bucket to catch rapid taps
    const eventKey = `${studentId}-${type}-${Math.floor(Date.now() / 100)}`;
    if (_pendingEventKeys.has(eventKey)) {
      if (__DEV__) console.log('[sessionStore] Duplicate event prevented:', eventKey);
      return null;
    }

    // Add to pending set (immutable update)
    const newPendingKeys = new Set(_pendingEventKeys);
    newPendingKeys.add(eventKey);
    set({ _pendingEventKeys: newPendingKeys });

    try {
      const event = await createEvent(
        activeSession.id,
        studentId,
        type,
        subtype,
        note,
        photoPath
      );

      // Update local state and clean up pending key
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
          // 'retour' doesn't increment any count
        }

        // Remove from pending (cleanup)
        const cleanedPendingKeys = new Set(state._pendingEventKeys);
        cleanedPendingKeys.delete(eventKey);

        // Update active sorties
        const newActiveSorties = { ...state.activeSorties };
        if (type === 'sortie') {
          newActiveSorties[studentId] = {
            eventId: event.id,
            timestamp: event.timestamp,
            subtype: subtype || null,
          };
        } else if (type === 'retour') {
          delete newActiveSorties[studentId];
        }

        return {
          events: newEvents,
          eventCountsByStudent: {
            ...state.eventCountsByStudent,
            [studentId]: updatedCounts,
          },
          activeSorties: newActiveSorties,
          _pendingEventKeys: cleanedPendingKeys,
        };
      });

      if (__DEV__) {
        console.log('[sessionStore] Event added:', type, 'for student:', studentId);
      }
      return event;
    } catch (error) {
      // Clean up pending key on error
      set((state) => {
        const cleanedPendingKeys = new Set(state._pendingEventKeys);
        cleanedPendingKeys.delete(eventKey);
        return { _pendingEventKeys: cleanedPendingKeys };
      });
      if (__DEV__) console.error('[sessionStore] Failed to add event:', error);
      return null;
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

  markReturn: async (studentId: string) => {
    const { activeSession, activeSorties, addEvent } = get();
    if (!activeSession) {
      console.warn('[sessionStore] No active session for marking return');
      return false;
    }

    // Check if student is actually out
    if (!activeSorties[studentId]) {
      console.warn('[sessionStore] Student is not currently out:', studentId);
      return false;
    }

    try {
      // Add a 'retour' event
      const event = await addEvent(studentId, 'retour' as EventType);
      if (event) {
        console.log('[sessionStore] Return marked for student:', studentId);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[sessionStore] Failed to mark return:', error);
      return false;
    }
  },

  isStudentOut: (studentId: string) => {
    return !!get().activeSorties[studentId];
  },

  getActiveSortie: (studentId: string) => {
    return get().activeSorties[studentId] || null;
  },

  updateNotes: async (notes: string | null) => {
    const { activeSession } = get();
    if (!activeSession) {
      console.warn('[sessionStore] No active session to update notes');
      return;
    }

    try {
      const updatedSession = await updateSessionNotes(activeSession.id, notes);
      if (updatedSession) {
        set({ activeSession: updatedSession });
        if (__DEV__) {
          console.log('[sessionStore] Session notes updated');
        }
      }
    } catch (error) {
      console.error('[sessionStore] Failed to update session notes:', error);
    }
  },

  clearSession: () => {
    set({
      activeSession: null,
      isSessionActive: false,
      events: [],
      eventCountsByStudent: {},
      activeSorties: {},
      error: null,
      _pendingEventKeys: new Set<string>(),
    });
  },
}));
