import * as sessionRepository from '../../../services/database/sessionRepository';
import * as dbClient from '../../../services/database/client';

// Mock the database client
jest.mock('../../../services/database/client', () => ({
  executeSql: jest.fn(),
  queryAll: jest.fn(),
  queryFirst: jest.fn(),
}));

// Mock expo-crypto
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid-123'),
}));

const mockDbClient = dbClient as jest.Mocked<typeof dbClient>;

// Mock SQLiteRunResult
const mockRunResult = { changes: 1, lastInsertRowId: 1 };

describe('sessionRepository', () => {
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
    jest.clearAllMocks();
    // Reset Date mock
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-04T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createSession', () => {
    it('should create a new session with correct parameters', async () => {
      mockDbClient.executeSql.mockResolvedValue(mockRunResult);

      const result = await sessionRepository.createSession(
        mockUserId,
        mockClassId,
        mockRoomId
      );

      expect(mockDbClient.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sessions'),
        expect.arrayContaining([
          'mock-uuid-123',
          mockUserId,
          mockClassId,
          mockRoomId,
          expect.any(String), // timestamp
        ])
      );

      expect(result).toMatchObject({
        id: 'mock-uuid-123',
        user_id: mockUserId,
        class_id: mockClassId,
        room_id: mockRoomId,
        ended_at: null,
        synced_at: null,
      });
    });
  });

  describe('endSession', () => {
    it('should update session with end timestamp', async () => {
      mockDbClient.executeSql.mockResolvedValue(mockRunResult);
      mockDbClient.queryFirst.mockResolvedValue({
        ...mockSession,
        ended_at: '2026-02-04T11:00:00.000Z',
      });

      const result = await sessionRepository.endSession(mockSessionId);

      expect(mockDbClient.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sessions SET ended_at'),
        expect.arrayContaining([expect.any(String), mockSessionId])
      );

      expect(result?.ended_at).not.toBeNull();
    });
  });

  describe('getSessionById', () => {
    it('should return session when found', async () => {
      mockDbClient.queryFirst.mockResolvedValue(mockSession);

      const result = await sessionRepository.getSessionById(mockSessionId);

      expect(mockDbClient.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM sessions WHERE id = ?'),
        [mockSessionId]
      );
      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found', async () => {
      mockDbClient.queryFirst.mockResolvedValue(null);

      const result = await sessionRepository.getSessionById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getActiveSession', () => {
    it('should return active session (ended_at is null)', async () => {
      mockDbClient.queryFirst.mockResolvedValue(mockSession);

      const result = await sessionRepository.getActiveSession(mockUserId);

      expect(mockDbClient.queryFirst).toHaveBeenCalledWith(
        expect.stringContaining('ended_at IS NULL'),
        [mockUserId]
      );
      expect(result).toEqual(mockSession);
    });

    it('should return null when no active session', async () => {
      mockDbClient.queryFirst.mockResolvedValue(null);

      const result = await sessionRepository.getActiveSession(mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('getSessionsByUserId', () => {
    it('should return all sessions for user ordered by date', async () => {
      const sessions = [mockSession, { ...mockSession, id: 'session-2' }];
      mockDbClient.queryAll.mockResolvedValue(sessions);

      const result = await sessionRepository.getSessionsByUserId(mockUserId);

      expect(mockDbClient.queryAll).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY started_at DESC'),
        [mockUserId]
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getSessionsByClassId', () => {
    it('should return all sessions for a class', async () => {
      mockDbClient.queryAll.mockResolvedValue([mockSession]);

      const result = await sessionRepository.getSessionsByClassId(mockClassId);

      expect(mockDbClient.queryAll).toHaveBeenCalledWith(
        expect.stringContaining('WHERE class_id = ?'),
        [mockClassId]
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    it('should delete session and its events', async () => {
      mockDbClient.executeSql.mockResolvedValue(mockRunResult);

      await sessionRepository.deleteSession(mockSessionId);

      // Should delete events first
      expect(mockDbClient.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM events WHERE session_id'),
        [mockSessionId]
      );

      // Then delete session
      expect(mockDbClient.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM sessions WHERE id'),
        [mockSessionId]
      );
    });
  });
});
