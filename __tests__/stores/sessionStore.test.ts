import { useSessionStore } from '../../stores/sessionStore';
import * as database from '../../services/database';

// Mock the database module
jest.mock('../../services/database', () => ({
  createSession: jest.fn(),
  endSession: jest.fn(),
  getActiveSession: jest.fn(),
  getSessionsByUserId: jest.fn(),
  createEvent: jest.fn(),
  getEventsBySessionId: jest.fn(),
  getAllStudentEventCounts: jest.fn(),
}));

const mockDatabase = database as jest.Mocked<typeof database>;

describe('sessionStore', () => {
  const mockUserId = 'user-123';
  const mockClassId = 'class-456';
  const mockRoomId = 'room-789';
  const mockSessionId = 'session-abc';

  const mockSession = {
    id: mockSessionId,
    user_id: mockUserId,
    class_id: mockClassId,
    room_id: mockRoomId,
    started_at: '2026-02-04T10:00:00.000Z',
    ended_at: null,
    synced_at: null,
  };

  beforeEach(() => {
    // Reset store state
    useSessionStore.setState({
      activeSession: null,
      isSessionActive: false,
      events: [],
      eventCountsByStudent: {},
      isLoading: false,
      error: null,
    });
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('startSession', () => {
    it('should create a new session and update state', async () => {
      mockDatabase.createSession.mockResolvedValue(mockSession);

      const store = useSessionStore.getState();
      const result = await store.startSession(mockUserId, mockClassId, mockRoomId);

      expect(mockDatabase.createSession).toHaveBeenCalledWith(
        mockUserId,
        mockClassId,
        mockRoomId
      );
      expect(result).toEqual(mockSession);

      const state = useSessionStore.getState();
      expect(state.activeSession).toEqual(mockSession);
      expect(state.isSessionActive).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should handle errors when starting session', async () => {
      const error = new Error('Database error');
      mockDatabase.createSession.mockRejectedValue(error);

      const store = useSessionStore.getState();

      await expect(
        store.startSession(mockUserId, mockClassId, mockRoomId)
      ).rejects.toThrow('Database error');

      const state = useSessionStore.getState();
      expect(state.error).toBe('Database error');
      expect(state.isLoading).toBe(false);
      expect(state.isSessionActive).toBe(false);
    });
  });

  describe('endCurrentSession', () => {
    it('should end the active session', async () => {
      // Set up active session
      useSessionStore.setState({
        activeSession: mockSession,
        isSessionActive: true,
      });

      mockDatabase.endSession.mockResolvedValue({
        ...mockSession,
        ended_at: '2026-02-04T11:00:00.000Z',
      });

      const store = useSessionStore.getState();
      await store.endCurrentSession();

      expect(mockDatabase.endSession).toHaveBeenCalledWith(mockSessionId);

      const state = useSessionStore.getState();
      expect(state.activeSession).toBeNull();
      expect(state.isSessionActive).toBe(false);
    });

    it('should do nothing if no active session', async () => {
      const store = useSessionStore.getState();
      await store.endCurrentSession();

      expect(mockDatabase.endSession).not.toHaveBeenCalled();
    });
  });

  describe('loadActiveSession', () => {
    it('should load an active session if one exists', async () => {
      mockDatabase.getActiveSession.mockResolvedValue(mockSession);
      mockDatabase.getEventsBySessionId.mockResolvedValue([]);
      mockDatabase.getAllStudentEventCounts.mockResolvedValue({});

      const store = useSessionStore.getState();
      await store.loadActiveSession(mockUserId);

      expect(mockDatabase.getActiveSession).toHaveBeenCalledWith(mockUserId);

      const state = useSessionStore.getState();
      expect(state.activeSession).toEqual(mockSession);
      expect(state.isSessionActive).toBe(true);
    });

    it('should set null if no active session', async () => {
      mockDatabase.getActiveSession.mockResolvedValue(null);

      const store = useSessionStore.getState();
      await store.loadActiveSession(mockUserId);

      const state = useSessionStore.getState();
      expect(state.activeSession).toBeNull();
      expect(state.isSessionActive).toBe(false);
    });
  });

  describe('addEvent', () => {
    const mockStudentId = 'student-xyz';
    const mockEvent = {
      id: 'event-123',
      session_id: mockSessionId,
      student_id: mockStudentId,
      type: 'participation' as const,
      subtype: null,
      note: null,
      photo_path: null,
      timestamp: '2026-02-04T10:30:00.000Z',
      synced_at: null,
    };

    beforeEach(() => {
      useSessionStore.setState({
        activeSession: mockSession,
        isSessionActive: true,
        events: [],
        eventCountsByStudent: {},
      });
    });

    it('should add a participation event and update counts', async () => {
      mockDatabase.createEvent.mockResolvedValue(mockEvent);

      const store = useSessionStore.getState();
      const result = await store.addEvent(mockStudentId, 'participation');

      expect(mockDatabase.createEvent).toHaveBeenCalledWith(
        mockSessionId,
        mockStudentId,
        'participation',
        undefined,
        undefined,
        undefined
      );
      expect(result).toEqual(mockEvent);

      const state = useSessionStore.getState();
      expect(state.events).toHaveLength(1);
      expect(state.eventCountsByStudent[mockStudentId].participation).toBe(1);
    });

    it('should return null if no active session', async () => {
      useSessionStore.setState({ activeSession: null, isSessionActive: false });

      const store = useSessionStore.getState();
      const result = await store.addEvent(mockStudentId, 'participation');

      expect(result).toBeNull();
      expect(mockDatabase.createEvent).not.toHaveBeenCalled();
    });
  });

  describe('clearSession', () => {
    it('should reset all session state', () => {
      useSessionStore.setState({
        activeSession: mockSession,
        isSessionActive: true,
        events: [{ id: 'event-1' } as any],
        eventCountsByStudent: { 'student-1': { participation: 2 } as any },
        error: 'some error',
      });

      const store = useSessionStore.getState();
      store.clearSession();

      const state = useSessionStore.getState();
      expect(state.activeSession).toBeNull();
      expect(state.isSessionActive).toBe(false);
      expect(state.events).toHaveLength(0);
      expect(state.eventCountsByStudent).toEqual({});
      expect(state.error).toBeNull();
    });
  });
});
