/**
 * Tests for the assessment-copies service pure logic.
 *
 * The storage path is security-critical: the Supabase storage policies for
 * the `assessment-copies` bucket authorize access only when the FIRST path
 * segment equals auth.uid(). If buildCopyPath ever stops putting userId first,
 * every upload silently breaks (RLS denies). Hence we lock the format here.
 *
 * The HD profile is the #1 factor for handwriting legibility downstream
 * (PC correction pipeline), so we pin its values too.
 */

import { buildCopyPath, ASSESSMENT_PROFILE } from '../../services/copies/path';

describe('buildCopyPath', () => {
  it('puts userId as the first segment (required by storage RLS)', () => {
    const path = buildCopyPath('user-1', 'assess-9', 'stud-42', 1);
    expect(path.split('/')[0]).toBe('user-1');
  });

  it('builds the documented format userId/assessmentId/studentId/{page}.jpg', () => {
    expect(buildCopyPath('u', 'a', 's', 3)).toBe('u/a/s/3.jpg');
  });

  it('keeps distinct pages of the same student on distinct paths', () => {
    const p1 = buildCopyPath('u', 'a', 's', 1);
    const p2 = buildCopyPath('u', 'a', 's', 2);
    expect(p1).not.toBe(p2);
    expect(p1).toBe('u/a/s/1.jpg');
    expect(p2).toBe('u/a/s/2.jpg');
  });

  it('keeps distinct students of the same assessment on distinct paths', () => {
    expect(buildCopyPath('u', 'a', 's1', 1)).not.toBe(buildCopyPath('u', 'a', 's2', 1));
  });
});

describe('ASSESSMENT_PROFILE', () => {
  it('uses an HD width (>= 2000px) so handwriting stays legible', () => {
    expect(ASSESSMENT_PROFILE.maxWidth).toBeGreaterThanOrEqual(2000);
  });

  it('does not constrain height (width-only resize keeps the copy ratio)', () => {
    expect(ASSESSMENT_PROFILE).not.toHaveProperty('maxHeight');
  });

  it('keeps JPEG quality high enough for legibility (>= 0.8)', () => {
    expect(ASSESSMENT_PROFILE.jpegQuality).toBeGreaterThanOrEqual(0.8);
  });
});
