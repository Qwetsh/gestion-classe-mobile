/**
 * Tests for the copy outbox PURE logic.
 *
 * The outbox is what guarantees "never lose a scanned copy": the screen state is the
 * server snapshot + queued operations, and the drain must replay them in order
 * (an assessment created offline before its pages, a page uploaded before its deletion).
 */

import {
  EMPTY_SNAPSHOT,
  applyToSnapshot,
  cancelPendingUpload,
  isNetworkError,
  markFailed,
  mergeStudentState,
  migrateLegacyQueue,
  nextPageOrder,
  nextRetryDelayMs,
  normalizePositions,
  pickNext,
  placeStudent,
  summarize,
  unseatStudent,
  type OutboxOp,
  type ScanSnapshot,
  type UploadPageOp,
} from '../../services/copies/outboxLogic';

const T0 = '2026-11-01T08:00:00.000Z';

function upload(over: Partial<UploadPageOp> = {}): UploadPageOp {
  return {
    kind: 'upload_page',
    id: 'op-up',
    userId: 'u',
    assessmentId: 'a',
    studentId: 's',
    pageId: 'p-new',
    pageOrder: 3,
    localPath: 'file:///q/p-new.jpg',
    storagePath: 'u/a/s/p-new.jpg',
    createdAt: T0,
    attempts: 0,
    ...over,
  };
}

function info(studentId: string, values: object, id = 'op-info'): OutboxOp {
  return {
    kind: 'copy_info',
    id,
    userId: 'u',
    assessmentId: 'a',
    studentId,
    info: values,
    createdAt: T0,
    attempts: 0,
  };
}

const snapshot: ScanSnapshot = {
  pages: [
    { id: 'p1', student_id: 's', page_order: 1, storage_path: 'u/a/s/p1.jpg' },
    { id: 'p2', student_id: 's', page_order: 2, storage_path: 'u/a/s/p2.jpg' },
    { id: 'px', student_id: 'other', page_order: 1, storage_path: 'u/a/other/px.jpg' },
  ],
  infos: [
    { student_id: 's', status: 'noted', subject_version: 'v4', is_adapted: false, copy_annotated: false },
    { student_id: 'abs', status: 'absent', subject_version: null, is_adapted: false, copy_annotated: false },
  ],
  fetchedAt: T0,
};

describe('mergeStudentState', () => {
  it('lists server pages then queued pages, in page order', () => {
    const st = mergeStudentState('s', snapshot, [upload()]);
    expect(st.pages.map((p) => [p.pageId, p.uploaded])).toEqual([
      ['p1', true],
      ['p2', true],
      ['p-new', false],
    ]);
    expect(st.uploadedCount).toBe(2);
    expect(st.pendingCount).toBe(1);
    expect(st.state).toBe('done');
  });

  it('hides a page whose deletion is queued', () => {
    const del: OutboxOp = {
      kind: 'delete_page',
      id: 'op-del',
      userId: 'u',
      assessmentId: 'a',
      studentId: 's',
      pageId: 'p1',
      storagePath: 'u/a/s/p1.jpg',
      createdAt: T0,
      attempts: 0,
    };
    expect(mergeStudentState('s', snapshot, [del]).pages.map((p) => p.pageId)).toEqual(['p2']);
  });

  it('applies queued copy info over the server values, latest wins', () => {
    const st = mergeStudentState('s', snapshot, [
      info('s', { subjectVersion: 'v5', isAdapted: true }, 'i1'),
      info('s', { subjectVersion: 'v6' }, 'i2'),
    ]);
    expect(st.subjectVersion).toBe('v6');
    expect(st.isAdapted).toBe(true);
    expect(st.copyAnnotated).toBe(false);
  });

  it('marks absent students without pages, and pages win over absence', () => {
    expect(mergeStudentState('abs', snapshot, []).state).toBe('absent');
    expect(mergeStudentState('abs', snapshot, [upload({ studentId: 'abs' })]).state).toBe('done');
    expect(mergeStudentState('nobody', snapshot, []).state).toBe('todo');
  });
});

describe('nextPageOrder', () => {
  it('starts at 1 and continues after the highest page, queued pages included', () => {
    expect(nextPageOrder([])).toBe(1);
    expect(nextPageOrder(mergeStudentState('s', snapshot, [upload()]).pages)).toBe(4);
  });
});

describe('pickNext (drain order)', () => {
  const create: OutboxOp = {
    kind: 'create_assessment',
    id: 'op-create',
    userId: 'u',
    assessmentId: 'a',
    classId: 'c',
    name: 'Éval',
    date: '2026-11-01',
    baremeTotal: 20,
    sessionId: null,
    createdAt: T0,
    attempts: 1,
    nextAttemptAt: '2026-11-01T09:00:00.000Z',
  };
  const now = Date.parse('2026-11-01T08:30:00.000Z');

  it('never sends a page before the creation of its assessment is through', () => {
    const blocked = new Set<string>();
    expect(pickNext([create, upload()], blocked, now)).toBeNull();
    expect(blocked.has('a')).toBe(true);
  });

  it('keeps other assessments flowing while one waits for a retry', () => {
    const other = upload({ id: 'op-b', assessmentId: 'b' });
    expect(pickNext([create, upload(), other], new Set(), now)).toBe(other);
  });

  it('ignores retry delays when forced (« Réessayer »)', () => {
    expect(pickNext([create, upload()], new Set(), Number.POSITIVE_INFINITY)).toBe(create);
  });
});

describe('retries', () => {
  it('spaces retries 5 s, 15 s, 1 min, then 5 min', () => {
    expect([1, 2, 3, 4, 9].map(nextRetryDelayMs)).toEqual([5_000, 15_000, 60_000, 300_000, 300_000]);
  });

  it('records the error and schedules the next attempt', () => {
    const failed = markFailed(upload(), 'quota', Date.parse(T0));
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe('quota');
    expect(failed.nextAttemptAt).toBe('2026-11-01T08:00:05.000Z');
  });

  it('tells network failures (stop draining) from per-operation errors', () => {
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true);
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new Error('new row violates row-level security policy'))).toBe(false);
  });
});

describe('applyToSnapshot', () => {
  it('keeps an uploaded page on screen once it leaves the queue', () => {
    const next = applyToSnapshot(snapshot, upload());
    expect(mergeStudentState('s', next, []).pages.map((p) => p.pageId)).toEqual(['p1', 'p2', 'p-new']);
    expect(applyToSnapshot(next, upload())).toBe(next);
  });

  it('merges copy info into the student row', () => {
    const next = applyToSnapshot(EMPTY_SNAPSHOT, info('n', { status: 'absent' }));
    expect(mergeStudentState('n', next, []).state).toBe('absent');
  });
});

describe('cancelPendingUpload', () => {
  it('removes a page that never left the phone (nothing to tell the server)', () => {
    const { ops, removed } = cancelPendingUpload([upload()], 'p-new');
    expect(ops).toEqual([]);
    expect(removed?.pageId).toBe('p-new');
  });

  it('leaves the queue untouched for an uploaded page', () => {
    const q = [upload()];
    expect(cancelPendingUpload(q, 'p1')).toEqual({ ops: q, removed: null });
  });
});

describe('migrateLegacyQueue', () => {
  it('turns v1 queue items into upload operations with an id-based path', () => {
    const [op] = migrateLegacyQueue([
      {
        id: 'q1',
        userId: 'u',
        assessmentId: 'a',
        studentId: 's',
        pageOrder: 2,
        localPath: 'file:///q1.jpg',
        createdAt: T0,
      },
    ]);
    expect(op).toMatchObject({
      kind: 'upload_page',
      pageId: 'q1',
      pageOrder: 2,
      storagePath: 'u/a/s/q1.jpg',
      attempts: 0,
    });
  });

  it('keeps v2 operations as they are and survives garbage', () => {
    expect(migrateLegacyQueue([upload()])).toEqual([upload()]);
    expect(migrateLegacyQueue({})).toEqual([]);
  });
});

describe('summarize', () => {
  it('counts pages still on the phone and surfaces the last error', () => {
    const s = summarize([upload(), markFailed(upload({ id: 'x' }), 'bucket plein', 0)], 'a');
    expect(s).toEqual({ pendingPages: 2, total: 2, lastError: 'bucket plein' });
    expect(summarize([upload()], 'other').total).toBe(0);
  });
});

describe("placement de l'éval", () => {
  const placementOp = (over: Partial<OutboxOp> = {}): OutboxOp =>
    ({
      kind: 'save_placement',
      id: 'op-place',
      userId: 'u',
      assessmentId: 'a',
      mode: 'auto',
      roomId: 'room',
      positions: { '0-0': 's1' },
      disabledCells: null,
      createdAt: T0,
      attempts: 2,
      nextAttemptAt: '2026-11-01T09:00:00.000Z',
      ...over,
    }) as OutboxOp;
  const now = Date.parse('2026-11-01T08:30:00.000Z');

  it('ne retient jamais les copies derrière une photo de placement en attente', () => {
    const page = upload({ id: 'after' });
    expect(pickNext([placementOp(), page], new Set(), now)).toBe(page);
  });

  it("reste ignorée par l'état des élèves et l'instantané", () => {
    expect(mergeStudentState('s', snapshot, [placementOp()]).pages).toHaveLength(2);
    expect(applyToSnapshot(snapshot, placementOp())).toBe(snapshot);
  });

  it('normalise les clés au format des plans de classe « r-c »', () => {
    expect(normalizePositions({ '1,2': 'x', '0-3': 'y', '2-2': '' })).toEqual({ '1-2': 'x', '0-3': 'y' });
    expect(normalizePositions(null)).toEqual({});
  });

  it('déplace un élève sur une case libre', () => {
    expect(placeStudent({ '0-0': 'a' }, 'a', '1-1')).toEqual({ '1-1': 'a' });
  });

  it('échange deux élèves quand la case est prise', () => {
    expect(placeStudent({ '0-0': 'a', '0-1': 'b' }, 'a', '0-1')).toEqual({ '0-0': 'b', '0-1': 'a' });
  });

  it("un élève sans place prend la case, l'occupant perd la sienne", () => {
    expect(placeStudent({ '0-1': 'b' }, 'a', '0-1')).toEqual({ '0-1': 'a' });
  });

  it('retire un élève du placement (absent ce jour-là)', () => {
    expect(unseatStudent({ '0-0': 'a', '0-1': 'b' }, 'a')).toEqual({ '0-1': 'b' });
    expect(unseatStudent({ '0-1': 'b' }, 'zz')).toEqual({ '0-1': 'b' });
  });
});
