/**
 * Tests for session lifecycle logic.
 * Focuses on business rules that matter:
 * - Session can only be active if not ended
 * - Ending a session resets synced_at for re-sync
 * - Orphan cleanup auto-ends stale sessions
 * - Deleting a session also deletes its events (FK integrity)
 * - Notes update resets synced_at
 */

import * as dbClient from '../../../services/database/client';
import {
  createSession,
  endSession,
  getActiveSession,
  getSessionsByDateRange,
  cleanupOrphanSessions,
  updateSessionNotes,
  deleteSession,
} from '../../../services/database/sessionRepository';

jest.mock('../../../services/database/client', () => ({
  executeSql: jest.fn(),
  queryAll: jest.fn(),
  queryFirst: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'session-uuid-test'),
}));

const mockDb = dbClient as jest.Mocked<typeof dbClient>;

describe('createSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return session with synced_at=null (needs sync)', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const session = await createSession('user-1', 'class-1', 'room-1');

    expect(session.synced_at).toBeNull();
    expect(session.ended_at).toBeNull();
    expect(session.user_id).toBe('user-1');
    expect(session.class_id).toBe('class-1');
    expect(session.room_id).toBe('room-1');
  });

  it('should trim topic whitespace', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const session = await createSession('user-1', 'class-1', 'room-1', '  Fractions  ');

    expect(session.topic).toBe('Fractions');
  });

  it('should set null topic for empty string', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const session = await createSession('user-1', 'class-1', 'room-1', '   ');

    expect(session.topic).toBeNull();
  });
});

describe('endSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should set synced_at to NULL in SQL (forces re-sync)', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue({
      id: 'session-1',
      ended_at: '2026-03-24T11:00:00.000Z',
      synced_at: null,
    });

    await endSession('session-1');

    // Verify the SQL resets synced_at
    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('synced_at = NULL'),
      expect.arrayContaining(['session-1'])
    );
  });

  it('should return the updated session', async () => {
    const endedSession = {
      id: 'session-1',
      user_id: 'user-1',
      class_id: 'class-1',
      room_id: 'room-1',
      topic: null,
      notes: null,
      started_at: '2026-03-24T10:00:00.000Z',
      ended_at: '2026-03-24T11:00:00.000Z',
      synced_at: null,
    };

    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue(endedSession);

    const result = await endSession('session-1');

    expect(result).toEqual(endedSession);
    expect(result!.ended_at).not.toBeNull();
  });
});

describe('updateSessionNotes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should reset synced_at to NULL (forces re-sync)', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue({ id: 'session-1', notes: 'Test note' });

    await updateSessionNotes('session-1', 'Test note');

    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('synced_at = NULL'),
      expect.arrayContaining(['Test note', 'session-1'])
    );
  });

  it('should trim notes whitespace', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue({ id: 'session-1', notes: 'Note' });

    await updateSessionNotes('session-1', '  Note  ');

    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining(['Note', 'session-1'])
    );
  });

  it('should set null for empty notes', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue({ id: 'session-1', notes: null });

    await updateSessionNotes('session-1', '   ');

    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([null, 'session-1'])
    );
  });
});

describe('cleanupOrphanSessions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should auto-end sessions older than maxHours', async () => {
    const oldSession = {
      id: 'orphan-1',
      user_id: 'user-1',
      started_at: '2026-03-23T08:00:00.000Z', // yesterday
      ended_at: null,
    };

    mockDb.queryAll.mockResolvedValue([oldSession]);
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const count = await cleanupOrphanSessions('user-1', 12);

    expect(count).toBe(1);
    // Should UPDATE, not DELETE (preserve event data)
    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE sessions SET ended_at'),
      expect.arrayContaining(['orphan-1'])
    );
  });

  it('should return 0 when no orphans', async () => {
    mockDb.queryAll.mockResolvedValue([]);

    const count = await cleanupOrphanSessions('user-1');

    expect(count).toBe(0);
    // Should NOT call executeSql for updates
    expect(mockDb.executeSql).not.toHaveBeenCalled();
  });

  it('should reset synced_at on auto-ended sessions', async () => {
    mockDb.queryAll.mockResolvedValue([{
      id: 'orphan-1',
      user_id: 'user-1',
      started_at: '2026-03-22T08:00:00.000Z',
      ended_at: null,
    }]);
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    await cleanupOrphanSessions('user-1');

    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('synced_at = NULL'),
      expect.anything()
    );
  });
});

describe('deleteSession', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should delete events BEFORE session (FK constraint)', async () => {
    await deleteSession('session-1');

    // Atomic deletion: single transaction with events first, session last
    expect(mockDb.executeTransaction).toHaveBeenCalledTimes(1);

    const statements = mockDb.executeTransaction.mock.calls[0][0];
    const sqls = statements.map((s: { sql: string }) => s.sql);

    expect(sqls[0]).toContain('DELETE FROM events');
    expect(sqls[sqls.length - 1]).toContain('DELETE FROM sessions');
  });
});

describe('getSessionsByDateRange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should query with correct date bounds', async () => {
    mockDb.queryAll.mockResolvedValue([]);

    await getSessionsByDateRange('user-1', '2026-03-01', '2026-03-31');

    expect(mockDb.queryAll).toHaveBeenCalledWith(
      expect.stringContaining('started_at >= ?'),
      ['user-1', '2026-03-01', '2026-03-31']
    );
  });
});
