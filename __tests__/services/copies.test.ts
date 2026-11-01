/**
 * Tests for the assessment-copies service pure logic (path + compression profile).
 *
 * The storage path is security-critical: the Supabase storage policies for
 * the `assessment-copies` bucket authorize access only when the FIRST path
 * segment equals auth.uid(). If buildCopyPath ever stops putting userId first,
 * every upload silently breaks (RLS denies). Hence we lock the format here.
 */

import { buildCopyPath, computeResize, COPY_PROFILE } from '../../services/copies/path';

describe('buildCopyPath', () => {
  it('puts userId as the first segment (required by storage RLS)', () => {
    const path = buildCopyPath('user-1', 'assess-9', 'stud-42', 'page-1');
    expect(path.split('/')[0]).toBe('user-1');
  });

  it('names the file after the page id, not its order (reordering never moves a file)', () => {
    expect(buildCopyPath('u', 'a', 's', 'p-uuid')).toBe('u/a/s/p-uuid.jpg');
  });

  it('keeps distinct students of the same assessment on distinct paths', () => {
    expect(buildCopyPath('u', 'a', 's1', 'p')).not.toBe(buildCopyPath('u', 'a', 's2', 'p'));
  });
});

describe('computeResize', () => {
  it('limits the long edge of a portrait page, keeping the ratio (one dimension only)', () => {
    expect(computeResize(3000, 4000, 2200)).toEqual({ height: 2200 });
  });

  it('limits the long edge of a landscape page', () => {
    expect(computeResize(4000, 3000, 2200)).toEqual({ width: 2200 });
  });

  it('never upscales a page that is already small enough', () => {
    expect(computeResize(1500, 2100, 2200)).toBeNull();
    expect(computeResize(2200, 1000, 2200)).toBeNull();
  });

  it('leaves unknown sizes alone', () => {
    expect(computeResize(0, 0)).toBeNull();
  });
});

describe('COPY_PROFILE', () => {
  it('keeps handwriting legible (long edge >= 1600 px, the correction reads ~1568 px)', () => {
    expect(COPY_PROFILE.maxLongEdge).toBeGreaterThanOrEqual(1600);
  });

  it('brings a phone scan down to 2000 px on the long edge, JPEG 0.75', () => {
    expect(COPY_PROFILE.maxLongEdge).toBe(2000);
    expect(COPY_PROFILE.jpegQuality).toBe(0.75);
    expect(computeResize(2800, 3800)).toEqual({ height: 2000 });
    expect(computeResize(1700, 2000)).toBeNull();
  });

  it('stays under the 5 MB bucket limit, with a stronger fallback compression', () => {
    expect(COPY_PROFILE.maxBytes).toBeLessThan(5 * 1024 * 1024);
    expect(COPY_PROFILE.fallbackQuality).toBeLessThan(COPY_PROFILE.jpegQuality);
  });
});
