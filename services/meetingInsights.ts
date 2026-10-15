/**
 * Réunion parents — données de positionnement et de suivi d'un élève.
 *
 * - Comportement : calculé en local (SQLite), donc disponible hors ligne.
 * - Notes : lues dans Supabase (carnet de notes du web), donc en ligne seulement.
 *
 * Les comparaisons entre classes se font en « score par séance » : une classe qui a eu
 * deux fois plus de séances accumule mécaniquement deux fois plus de participations.
 */
import { queryAll } from './database/client';
import { supabase } from './supabase/client';
import { Period } from '../constants/periods';

// ============================================================
// Périodes
// ============================================================

export function getPeriodDates(period: Period): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  switch (period) {
    case 'T1':
      return { start: new Date(year, 8, 1), end: new Date(year, 11, 31, 23, 59, 59) };
    case 'T2':
      return { start: new Date(year + 1, 0, 1), end: new Date(year + 1, 2, 31, 23, 59, 59) };
    case 'T3':
      return { start: new Date(year + 1, 3, 1), end: new Date(year + 1, 6, 31, 23, 59, 59) };
    case 'year':
    default:
      return { start: new Date(year, 8, 1), end: new Date(year + 1, 6, 31, 23, 59, 59) };
  }
}

function currentSchoolYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

function trimesterOf(period: Period): number | null {
  return period === 'T1' ? 1 : period === 'T2' ? 2 : period === 'T3' ? 3 : null;
}

/** Niveau déduit du nom d'une classe : « 6e A », « 5ème 3 », « 3E2 » → 6e, 5e, 3e (même règle que le web). */
export function levelFromClassName(name: string | null | undefined): string | null {
  const m = (name ?? '').match(/(?:^|[^\d])([6543])\s*(?:e|è|ème|eme|E)\b/) ?? (name ?? '').match(/^\s*([6543])/);
  return m ? `${m[1]}e` : null;
}

// ============================================================
// Outils de classement
// ============================================================

export interface Rank {
  /** 1 = meilleur. Ex aequo : même rang. */
  rank: number;
  total: number;
}

/** Rang de `value` parmi `values` (plus grand = meilleur). */
function rankOf(value: number, values: readonly number[]): Rank {
  let better = 0;
  for (const v of values) if (v > value + 1e-9) better++;
  return { rank: better + 1, total: values.length };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ============================================================
// Comportement (local)
// ============================================================

export interface BehaviorPositioning {
  className: string;
  level: string | null;
  sessionsCount: number;
  /** Score (participations − malus) par séance de l'élève. */
  studentRate: number;
  classMeanRate: number | null;
  levelMeanRate: number | null;
  /** Rang dans la classe sur le score brut. */
  rankInClass: Rank | null;
  /** Rang parmi tous mes élèves du niveau, sur le score par séance. */
  rankInLevel: Rank | null;
  /** Rang de la classe parmi mes classes du niveau, sur la moyenne du score par séance. */
  classRankInLevel: Rank | null;
  /** Participations / malus par séance : élève, classe, niveau. */
  participation: { student: number; classMean: number | null; levelMean: number | null };
  malus: { student: number; classMean: number | null; levelMean: number | null };
}

interface ClassRow { id: string; name: string }
interface StudentRow { id: string; classId: string }
interface CountRow { class_id: string; n: number }
interface AggRow { student_id: string; participation: number; bavardage: number }

export async function loadBehaviorPositioning(
  userId: string,
  studentId: string,
  classId: string,
  period: Period,
): Promise<BehaviorPositioning | null> {
  const { start, end } = getPeriodDates(period);
  const s = start.toISOString();
  const e = end.toISOString();

  const [classes, students, sessionCounts, aggs] = await Promise.all([
    queryAll<ClassRow>(
      'SELECT id, name FROM classes WHERE user_id = ? AND is_deleted = 0',
      [userId],
    ),
    queryAll<StudentRow>(
      `SELECT s.id, s.class_id as classId FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE c.user_id = ? AND s.is_deleted = 0 AND c.is_deleted = 0`,
      [userId],
    ),
    queryAll<CountRow>(
      `SELECT class_id, COUNT(*) as n FROM sessions
       WHERE user_id = ? AND started_at >= ? AND started_at <= ?
       GROUP BY class_id`,
      [userId, s, e],
    ),
    queryAll<AggRow>(
      `SELECT e.student_id,
         SUM(CASE WHEN e.type = 'participation' THEN 1 ELSE 0 END) as participation,
         SUM(CASE WHEN e.type = 'bavardage' THEN 1 ELSE 0 END) as bavardage
       FROM events e JOIN sessions sess ON e.session_id = sess.id
       WHERE sess.user_id = ? AND e.timestamp >= ? AND e.timestamp <= ?
       GROUP BY e.student_id`,
      [userId, s, e],
    ),
  ]);

  const cls = classes.find((c) => c.id === classId);
  if (!cls) return null;
  const level = levelFromClassName(cls.name);
  const levelOf = new Map(classes.map((c) => [c.id, levelFromClassName(c.name)]));
  const sessionsOf = new Map(sessionCounts.map((r) => [r.class_id, Number(r.n) || 0]));
  const aggOf = new Map(aggs.map((a) => [a.student_id, a]));

  type Row = { id: string; classId: string; p: number; b: number; score: number; rate: number; pRate: number; bRate: number };
  const rows: Row[] = students.map((st) => {
    const a = aggOf.get(st.id);
    const p = Number(a?.participation) || 0;
    const b = Number(a?.bavardage) || 0;
    const n = Math.max(1, sessionsOf.get(st.classId) ?? 0);
    return { id: st.id, classId: st.classId, p, b, score: p - b, rate: (p - b) / n, pRate: p / n, bRate: b / n };
  });

  const me = rows.find((r) => r.id === studentId);
  if (!me) return null;

  const classRows = rows.filter((r) => r.classId === classId);
  const levelRows = level ? rows.filter((r) => levelOf.get(r.classId) === level) : [];
  const levelClassIds = level ? classes.filter((c) => levelOf.get(c.id) === level).map((c) => c.id) : [];
  const classMeans = levelClassIds
    .map((id) => mean(rows.filter((r) => r.classId === id).map((r) => r.rate)))
    .filter((v): v is number => v !== null);
  const myClassMean = mean(classRows.map((r) => r.rate));

  return {
    className: cls.name,
    level,
    sessionsCount: sessionsOf.get(classId) ?? 0,
    studentRate: me.rate,
    classMeanRate: myClassMean,
    levelMeanRate: mean(levelRows.map((r) => r.rate)),
    rankInClass: rankOf(me.score, classRows.map((r) => r.score)),
    rankInLevel: levelRows.length > classRows.length ? rankOf(me.rate, levelRows.map((r) => r.rate)) : null,
    classRankInLevel: classMeans.length > 1 && myClassMean !== null ? rankOf(myClassMean, classMeans) : null,
    participation: {
      student: me.pRate,
      classMean: mean(classRows.map((r) => r.pRate)),
      levelMean: level ? mean(levelRows.map((r) => r.pRate)) : null,
    },
    malus: {
      student: me.bRate,
      classMean: mean(classRows.map((r) => r.bRate)),
      levelMean: level ? mean(levelRows.map((r) => r.bRate)) : null,
    },
  };
}

// ============================================================
// Journal des séances (local)
// ============================================================

export interface JournalEvent {
  id: string;
  type: string;
  subtype: string | null;
  note: string | null;
  photo_path: string | null;
  timestamp: string;
}

export interface JournalSession {
  sessionId: string;
  startedAt: string;
  topic: string | null;
  sessionNotes: string | null;
  participation: number;
  bavardage: number;
  absent: boolean;
  sorties: string[];
  /** Commentaires écrits pendant la séance (remarques et toute action annotée). */
  comments: JournalEvent[];
}

interface JournalRow extends JournalEvent {
  session_id: string;
  started_at: string;
  topic: string | null;
  session_notes: string | null;
}

export async function loadSessionJournal(
  userId: string,
  studentId: string,
  period: Period,
): Promise<JournalSession[]> {
  const { start, end } = getPeriodDates(period);
  const rows = await queryAll<JournalRow>(
    `SELECT e.id, e.type, e.subtype, e.note, e.photo_path, e.timestamp,
            sess.id as session_id, sess.started_at, sess.topic, sess.notes as session_notes
     FROM events e JOIN sessions sess ON e.session_id = sess.id
     WHERE e.student_id = ? AND sess.user_id = ? AND e.timestamp >= ? AND e.timestamp <= ?
     ORDER BY sess.started_at DESC, e.timestamp ASC`,
    [studentId, userId, start.toISOString(), end.toISOString()],
  );

  const out: JournalSession[] = [];
  const byId = new Map<string, JournalSession>();
  for (const r of rows) {
    let js = byId.get(r.session_id);
    if (!js) {
      js = {
        sessionId: r.session_id,
        startedAt: r.started_at,
        topic: r.topic,
        sessionNotes: r.session_notes,
        participation: 0,
        bavardage: 0,
        absent: false,
        sorties: [],
        comments: [],
      };
      byId.set(r.session_id, js);
      out.push(js);
    }
    if (r.type === 'participation') js.participation++;
    else if (r.type === 'bavardage') js.bavardage++;
    else if (r.type === 'absence') js.absent = true;
    else if (r.type === 'sortie' && r.subtype) js.sorties.push(r.subtype);
    const note = r.note?.trim();
    if (r.type === 'remarque' || note || r.photo_path) {
      js.comments.push({ id: r.id, type: r.type, subtype: r.subtype, note: note || null, photo_path: r.photo_path, timestamp: r.timestamp });
    }
  }
  return out;
}

// ============================================================
// Notes (Supabase, carnet du web)
// ============================================================

type GradeStatus = 'noted' | 'absent' | 'dispense' | 'non_rendu' | 'non_rendu_zero';

export const GRADE_STATUS_SHORT: Record<Exclude<GradeStatus, 'noted'>, string> = {
  absent: 'Abs',
  dispense: 'Disp',
  non_rendu: 'N.R.',
  non_rendu_zero: 'N.R. (0)',
};

interface AssessmentRow {
  id: string;
  class_id: string;
  name: string;
  date: string | null;
  created_at: string;
  bareme_total: number | string | null;
  period: number | null;
  coefficient: number | string | null;
  counts_in_average: boolean;
  kind: string | null;
}

interface GradeRow {
  assessment_id: string;
  student_id: string;
  grade: number | string | null;
  grade_raw: number | string | null;
  comment: string | null;
  status: GradeStatus;
  is_adapted: boolean | null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Valeur qui entre dans une moyenne (même règle que gradeStats.ts côté web). */
function effectiveGrade(g: { grade: unknown; status: GradeStatus }): number | null {
  switch (g.status) {
    case 'non_rendu_zero': return 0;
    case 'absent':
    case 'dispense':
    case 'non_rendu': return null;
    default: return toNumber(g.grade);
  }
}

export interface GradeLine {
  assessmentId: string;
  name: string;
  date: string | null;
  kind: string | null;
  baremeTotal: number | null;
  coefficient: number;
  countsInAverage: boolean;
  /** Note /20 retenue (null = pas de note). */
  grade: number | null;
  raw: number | null;
  status: GradeStatus | null;
  comment: string | null;
  isAdapted: boolean;
  classMean: number | null;
  classMin: number | null;
  classMax: number | null;
}

export interface GradePositioning {
  lines: GradeLine[];
  studentAverage: number | null;
  classAverage: number | null;
  levelAverage: number | null;
  rankInClass: Rank | null;
  rankInLevel: Rank | null;
  classRankInLevel: Rank | null;
  level: string | null;
}

const PAGE = 1000;

async function fetchPaged<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

function weightedAvg(items: { value: number; coef: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const it of items) {
    if (it.coef <= 0) continue;
    sum += it.value * it.coef;
    w += it.coef;
  }
  return w > 0 ? sum / w : null;
}

export async function loadGradePositioning(
  userId: string,
  studentId: string,
  classId: string,
  period: Period,
): Promise<GradePositioning> {
  if (!supabase) throw new Error('Supabase non configuré');
  const sb = supabase;
  const schoolYear = currentSchoolYear();
  const trimester = trimesterOf(period);

  const assessments = await fetchPaged<AssessmentRow>((from, to) => {
    let q = sb
      .from('written_assessments')
      .select('id, class_id, name, date, created_at, bareme_total, period, coefficient, counts_in_average, kind')
      .eq('user_id', userId)
      .eq('school_year', schoolYear)
      .eq('is_deleted', false);
    if (trimester !== null) q = q.eq('period', trimester);
    return q.order('date', { ascending: true, nullsFirst: false }).range(from, to);
  });

  // Classes locales (nom → niveau) et rattachement actuel des élèves
  const [classes, students] = await Promise.all([
    queryAll<ClassRow>('SELECT id, name FROM classes WHERE user_id = ? AND is_deleted = 0', [userId]),
    queryAll<StudentRow>(
      `SELECT s.id, s.class_id as classId FROM students s
       JOIN classes c ON s.class_id = c.id
       WHERE c.user_id = ? AND s.is_deleted = 0 AND c.is_deleted = 0`,
      [userId],
    ),
  ]);
  const levelOf = new Map(classes.map((c) => [c.id, levelFromClassName(c.name)]));
  const level = levelOf.get(classId) ?? null;

  const empty: GradePositioning = {
    lines: [], studentAverage: null, classAverage: null, levelAverage: null,
    rankInClass: null, rankInLevel: null, classRankInLevel: null, level,
  };
  if (assessments.length === 0) return empty;

  // Notes : par paquets d'évaluations pour garder des URL courtes
  const grades: GradeRow[] = [];
  const ids = assessments.map((a) => a.id);
  for (let i = 0; i < ids.length; i += 60) {
    const chunk = ids.slice(i, i + 60);
    const part = await fetchPaged<GradeRow>((from, to) =>
      sb
        .from('assessment_grades')
        .select('assessment_id, student_id, grade, grade_raw, comment, status, is_adapted')
        .in('assessment_id', chunk)
        .range(from, to),
    );
    grades.push(...part);
  }

  const byAssessment = new Map<string, GradeRow[]>();
  for (const g of grades) {
    const l = byAssessment.get(g.assessment_id) ?? [];
    l.push(g);
    byAssessment.set(g.assessment_id, l);
  }
  const assessmentById = new Map(assessments.map((a) => [a.id, a]));

  // Lignes de l'élève : évals de sa classe + celles où il a une note
  const myGrades = new Map(grades.filter((g) => g.student_id === studentId).map((g) => [g.assessment_id, g]));
  const lines: GradeLine[] = assessments
    .filter((a) => a.class_id === classId || myGrades.has(a.id))
    .map((a) => {
      const all = byAssessment.get(a.id) ?? [];
      const values = all.map(effectiveGrade).filter((v): v is number => v !== null);
      const mine = myGrades.get(a.id) ?? null;
      return {
        assessmentId: a.id,
        name: a.name,
        date: a.date ?? a.created_at,
        kind: a.kind,
        baremeTotal: toNumber(a.bareme_total),
        coefficient: toNumber(a.coefficient) ?? 1,
        countsInAverage: a.counts_in_average !== false,
        grade: mine ? effectiveGrade(mine) : null,
        raw: mine ? toNumber(mine.grade_raw) : null,
        status: mine?.status ?? null,
        comment: mine?.comment?.trim() || null,
        isAdapted: !!mine?.is_adapted,
        classMean: mean(values),
        classMin: values.length ? Math.min(...values) : null,
        classMax: values.length ? Math.max(...values) : null,
      };
    })
    .reverse(); // plus récentes d'abord

  // Moyenne de chaque élève sur la période
  const perStudent = new Map<string, { value: number; coef: number }[]>();
  for (const g of grades) {
    const a = assessmentById.get(g.assessment_id);
    if (!a || a.counts_in_average === false) continue;
    const v = effectiveGrade(g);
    if (v === null) continue;
    const l = perStudent.get(g.student_id) ?? [];
    l.push({ value: v, coef: toNumber(a.coefficient) ?? 1 });
    perStudent.set(g.student_id, l);
  }
  const averages = new Map<string, number>();
  for (const [sid, items] of perStudent) {
    const avg = weightedAvg(items);
    if (avg !== null) averages.set(sid, avg);
  }

  // Classe d'un élève : sa classe actuelle en local
  const classOf = new Map(students.map((s) => [s.id, s.classId]));
  const avgsOfClass = (cid: string) =>
    students.filter((s) => s.classId === cid).map((s) => averages.get(s.id)).filter((v): v is number => v !== undefined);

  const myAvg = averages.get(studentId) ?? null;
  const classAvgs = avgsOfClass(classId);
  const levelClassIds = level ? classes.filter((c) => levelOf.get(c.id) === level).map((c) => c.id) : [];
  const levelAvgs = level
    ? [...averages.entries()].filter(([sid]) => {
        const cid = classOf.get(sid);
        return cid !== undefined && levelOf.get(cid) === level;
      }).map(([, v]) => v)
    : [];
  const classMeans = levelClassIds.map((cid) => mean(avgsOfClass(cid))).filter((v): v is number => v !== null);
  const myClassMean = mean(classAvgs);

  return {
    lines,
    studentAverage: myAvg,
    classAverage: myClassMean,
    levelAverage: mean(levelAvgs),
    rankInClass: myAvg !== null && classAvgs.length > 0 ? rankOf(myAvg, classAvgs) : null,
    rankInLevel: myAvg !== null && levelAvgs.length > classAvgs.length ? rankOf(myAvg, levelAvgs) : null,
    classRankInLevel: myClassMean !== null && classMeans.length > 1 ? rankOf(myClassMean, classMeans) : null,
    level,
  };
}

export function formatGrade(v: number | null, decimals = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return v.toFixed(decimals).replace('.', ',');
}
