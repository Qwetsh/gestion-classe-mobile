/**
 * Tests for the offline copy-upload queue PURE logic.
 *
 * The page_order assignment is correctness-critical: scanning several pages while
 * OFFLINE must not collide on page_order (the DB has a UNIQUE(assessment, student, page_order)
 * constraint, and the correction pipeline relies on page order). So we pin the math here.
 */

import {
  computeNextPageOrder,
  countPendingByStudent,
  pendingOrdersFor,
  type PendingUpload,
} from '../../services/copies/queueLogic';

function item(over: Partial<PendingUpload>): PendingUpload {
  return {
    id: 'q1',
    userId: 'u',
    assessmentId: 'a',
    studentId: 's',
    pageOrder: 1,
    localPath: 'file:///x.jpg',
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  };
}

describe('computeNextPageOrder', () => {
  it('starts at 1 when nothing exists', () => {
    expect(computeNextPageOrder([], [])).toBe(1);
  });

  it('continues after the highest server page', () => {
    expect(computeNextPageOrder([1, 2], [])).toBe(3);
  });

  it('continues after the highest PENDING page (offline burst)', () => {
    // 0 pages on server, two queued offline -> next must be 3, not 1 (no collision)
    expect(computeNextPageOrder([], [1, 2])).toBe(3);
  });

  it('takes the max across server AND pending', () => {
    expect(computeNextPageOrder([1], [2, 3])).toBe(4);
    expect(computeNextPageOrder([5], [2])).toBe(6);
  });
});

describe('countPendingByStudent', () => {
  it('counts only the targeted assessment', () => {
    const items = [
      item({ studentId: 's1', assessmentId: 'a' }),
      item({ studentId: 's1', assessmentId: 'a' }),
      item({ studentId: 's2', assessmentId: 'a' }),
      item({ studentId: 's1', assessmentId: 'other' }),
    ];
    expect(countPendingByStudent(items, 'a')).toEqual({ s1: 2, s2: 1 });
  });

  it('returns an empty map when nothing is queued', () => {
    expect(countPendingByStudent([], 'a')).toEqual({});
  });
});

describe('pendingOrdersFor', () => {
  it('returns the page orders queued for one student of one assessment', () => {
    const items = [
      item({ studentId: 's1', assessmentId: 'a', pageOrder: 1 }),
      item({ studentId: 's1', assessmentId: 'a', pageOrder: 2 }),
      item({ studentId: 's2', assessmentId: 'a', pageOrder: 1 }),
      item({ studentId: 's1', assessmentId: 'b', pageOrder: 9 }),
    ];
    expect(pendingOrdersFor(items, 'a', 's1').sort()).toEqual([1, 2]);
  });
});
