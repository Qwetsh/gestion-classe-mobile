/**
 * Tests for event counting logic extracted from eventRepository.
 * These test the pure counting functions with controlled event data,
 * validating that counts are accurate for all event types.
 *
 * This is critical because incorrect counts directly affect what
 * teachers see on the seating plan during class.
 */

import { EVENT_TYPES, SORTIE_SUBTYPES } from '../../../services/database/schema';

// We test the counting logic by importing the actual functions
// but mocking the database layer beneath them
import * as dbClient from '../../../services/database/client';
import {
  getStudentEventCounts,
  getAllStudentEventCounts,
  getClassStudentEventCounts,
  createEvent,
  deleteEvent,
  getEventsBySessionId,
} from '../../../services/database/eventRepository';

jest.mock('../../../services/database/client', () => ({
  executeSql: jest.fn(),
  queryAll: jest.fn(),
  queryFirst: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'evt-' + Math.random().toString(36).substr(2, 6)),
}));

const mockDb = dbClient as jest.Mocked<typeof dbClient>;

// Helper to create event fixture
function makeEvent(overrides: Partial<{
  id: string;
  session_id: string;
  student_id: string;
  type: string;
  subtype: string | null;
  note: string | null;
  photo_path: string | null;
  timestamp: string;
  synced_at: string | null;
}> = {}) {
  return {
    id: overrides.id || 'evt-1',
    session_id: overrides.session_id || 'session-1',
    student_id: overrides.student_id || 'student-1',
    type: overrides.type || 'participation',
    subtype: overrides.subtype || null,
    note: overrides.note || null,
    photo_path: overrides.photo_path || null,
    timestamp: overrides.timestamp || '2026-03-24T10:00:00.000Z',
    synced_at: overrides.synced_at || null,
  };
}

describe('getStudentEventCounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return zero counts when no events', async () => {
    mockDb.queryAll.mockResolvedValue([]);

    const counts = await getStudentEventCounts('session-1', 'student-1');

    expect(counts).toEqual({
      participation: 0,
      bavardage: 0,
      absence: 0,
      remarque: 0,
      sortie: 0,
    });
  });

  it('should correctly count each event type', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ type: 'participation' }),
      makeEvent({ type: 'participation' }),
      makeEvent({ type: 'bavardage' }),
      makeEvent({ type: 'absence' }),
      makeEvent({ type: 'remarque' }),
      makeEvent({ type: 'remarque' }),
      makeEvent({ type: 'remarque' }),
      makeEvent({ type: 'sortie', subtype: 'toilettes' }),
    ]);

    const counts = await getStudentEventCounts('session-1', 'student-1');

    expect(counts.participation).toBe(2);
    expect(counts.bavardage).toBe(1);
    expect(counts.absence).toBe(1);
    expect(counts.remarque).toBe(3);
    expect(counts.sortie).toBe(1);
  });

  it('should NOT count retour events (they are tracked separately)', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ type: 'sortie' }),
      makeEvent({ type: 'retour' }),
    ]);

    const counts = await getStudentEventCounts('session-1', 'student-1');

    expect(counts.sortie).toBe(1);
    // retour is not in StudentEventCounts — this is by design
    expect((counts as any).retour).toBeUndefined();
  });

  it('should ignore unknown event types', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ type: 'participation' }),
      makeEvent({ type: 'unknown_type' }),
    ]);

    const counts = await getStudentEventCounts('session-1', 'student-1');

    expect(counts.participation).toBe(1);
    // Total should be 1, not 2
    const total = counts.participation + counts.bavardage + counts.absence + counts.remarque + counts.sortie;
    expect(total).toBe(1);
  });
});

describe('getAllStudentEventCounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should group counts by student', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ student_id: 'student-A', type: 'participation' }),
      makeEvent({ student_id: 'student-A', type: 'bavardage' }),
      makeEvent({ student_id: 'student-B', type: 'participation' }),
      makeEvent({ student_id: 'student-B', type: 'participation' }),
      makeEvent({ student_id: 'student-B', type: 'absence' }),
    ]);

    const result = await getAllStudentEventCounts('session-1');

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['student-A'].participation).toBe(1);
    expect(result['student-A'].bavardage).toBe(1);
    expect(result['student-B'].participation).toBe(2);
    expect(result['student-B'].absence).toBe(1);
  });

  it('should return empty object when no events', async () => {
    mockDb.queryAll.mockResolvedValue([]);

    const result = await getAllStudentEventCounts('session-1');

    expect(result).toEqual({});
  });

  it('should handle many students without mixing counts', async () => {
    const events = [];
    for (let i = 0; i < 30; i++) {
      events.push(makeEvent({
        student_id: `student-${i}`,
        type: 'participation',
      }));
    }
    // Add an extra event for student-0
    events.push(makeEvent({
      student_id: 'student-0',
      type: 'bavardage',
    }));

    mockDb.queryAll.mockResolvedValue(events);

    const result = await getAllStudentEventCounts('session-1');

    expect(Object.keys(result)).toHaveLength(30);
    expect(result['student-0'].participation).toBe(1);
    expect(result['student-0'].bavardage).toBe(1);
    expect(result['student-15'].participation).toBe(1);
    expect(result['student-15'].bavardage).toBe(0);
  });
});

describe('getClassStudentEventCounts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should count retour events (unlike session-level counts)', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ student_id: 'student-1', type: 'sortie' }),
      makeEvent({ student_id: 'student-1', type: 'retour' }),
    ]);

    const result = await getClassStudentEventCounts('class-1');

    expect(result['student-1'].sortie).toBe(1);
    expect(result['student-1'].retour).toBe(1);
  });

  it('should aggregate across multiple sessions', async () => {
    mockDb.queryAll.mockResolvedValue([
      makeEvent({ student_id: 'student-1', session_id: 'sess-1', type: 'participation' }),
      makeEvent({ student_id: 'student-1', session_id: 'sess-2', type: 'participation' }),
      makeEvent({ student_id: 'student-1', session_id: 'sess-2', type: 'bavardage' }),
    ]);

    const result = await getClassStudentEventCounts('class-1');

    expect(result['student-1'].participation).toBe(2);
    expect(result['student-1'].bavardage).toBe(1);
  });
});

describe('createEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create event with correct fields', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const event = await createEvent('session-1', 'student-1', 'participation');

    expect(event.session_id).toBe('session-1');
    expect(event.student_id).toBe('student-1');
    expect(event.type).toBe('participation');
    expect(event.subtype).toBeNull();
    expect(event.note).toBeNull();
    expect(event.synced_at).toBeNull();
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeTruthy();
  });

  it('should store sortie subtype', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const event = await createEvent('session-1', 'student-1', 'sortie', 'infirmerie');

    expect(event.type).toBe('sortie');
    expect(event.subtype).toBe('infirmerie');
  });

  it('should store note for remarque', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const event = await createEvent('session-1', 'student-1', 'remarque', null, 'Très bon travail');

    expect(event.type).toBe('remarque');
    expect(event.note).toBe('Très bon travail');
  });

  it('should normalize null-ish values', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    const event = await createEvent('session-1', 'student-1', 'participation', undefined, undefined, undefined);

    expect(event.subtype).toBeNull();
    expect(event.note).toBeNull();
    expect(event.photo_path).toBeNull();
  });

  it('should pass correct SQL params', async () => {
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });

    await createEvent('session-1', 'student-1', 'bavardage');

    expect(mockDb.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO events'),
      expect.arrayContaining(['session-1', 'student-1', 'bavardage'])
    );
  });
});

describe('EVENT_TYPES and SORTIE_SUBTYPES constants', () => {
  it('should define all expected event types', () => {
    expect(EVENT_TYPES.PARTICIPATION).toBe('participation');
    expect(EVENT_TYPES.BAVARDAGE).toBe('bavardage');
    expect(EVENT_TYPES.ABSENCE).toBe('absence');
    expect(EVENT_TYPES.REMARQUE).toBe('remarque');
    expect(EVENT_TYPES.SORTIE).toBe('sortie');
    expect(EVENT_TYPES.RETOUR).toBe('retour');
  });

  it('should define all expected sortie subtypes', () => {
    expect(SORTIE_SUBTYPES.INFIRMERIE).toBe('infirmerie');
    expect(SORTIE_SUBTYPES.TOILETTES).toBe('toilettes');
    expect(SORTIE_SUBTYPES.CONVOCATION).toBe('convocation');
    expect(SORTIE_SUBTYPES.EXCLUSION).toBe('exclusion');
  });

  it('should have matching values between menu items and event types', () => {
    // This ensures the UI menu IDs match what gets stored in the DB
    const menuActionIds = ['participation', 'bavardage', 'absence', 'remarque', 'sortie'];
    const eventTypeValues = Object.values(EVENT_TYPES).filter(v => v !== 'retour');

    for (const id of menuActionIds) {
      expect(eventTypeValues).toContain(id);
    }
  });
});
