/**
 * Évals à faire rattraper aux absents (vue pending_makeups, migration 066 du dépôt web).
 * Rien n'est stocké par séance : tant qu'un élève absent n'a ni note ni copie, le rappel
 * s'affiche à chaque séance de sa classe après le jour de l'éval. Scanner sa copie le
 * repasse en « noté » et le sort de la liste. Logique pure, testée dans
 * __tests__/utils/makeupReminders.test.ts.
 */

/** Une ligne de la vue : un élève absent à une éval. */
export interface PendingMakeupRow {
  assessment_id: string;
  assessment_name: string;
  /** « 2026-11-06 » */
  assessment_date: string;
  class_id: string;
  group_id: string | null;
  student_id: string;
  pseudo: string;
  student_group_ids: string[] | null;
}

export interface MakeupReminder {
  assessmentId: string;
  assessmentName: string;
  assessmentDate: string;
  students: { id: string; pseudo: string }[];
}

/** Jour local « AAAA-MM-JJ » d'un instant (le jour de l'éval est un jour du collège, pas UTC). */
export function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * L'élève peut-il rattraper pendant cette séance ? Même classe ; séance en demi-groupe :
 * l'éval était celle de ce groupe, ou l'élève est membre du groupe (ou d'aucun groupe).
 */
export function sessionFitsMakeup(
  classId: string,
  groupId: string | null | undefined,
  row: Pick<PendingMakeupRow, 'class_id' | 'group_id' | 'student_group_ids'>
): boolean {
  if (row.class_id !== classId) return false;
  if (!groupId) return true;
  if (row.group_id) return row.group_id === groupId;
  const groups = row.student_group_ids ?? [];
  return groups.length === 0 || groups.includes(groupId);
}

/**
 * Rappels pour une séance de la classe à l'instant `at` : les évals passées avant ce jour-là
 * (pas le jour même : c'est la séance de l'éval), une entrée par éval, élèves triés.
 */
export function makeupRemindersFor(
  rows: PendingMakeupRow[],
  classId: string,
  at: Date,
  groupId?: string | null
): MakeupReminder[] {
  const today = localDayKey(at);
  const byEval = new Map<string, MakeupReminder>();
  for (const r of rows) {
    if (!sessionFitsMakeup(classId, groupId, r)) continue;
    if (r.assessment_date.slice(0, 10) >= today) continue;
    let rem = byEval.get(r.assessment_id);
    if (!rem) {
      rem = {
        assessmentId: r.assessment_id,
        assessmentName: r.assessment_name,
        assessmentDate: r.assessment_date.slice(0, 10),
        students: [],
      };
      byEval.set(r.assessment_id, rem);
    }
    rem.students.push({ id: r.student_id, pseudo: r.pseudo });
  }
  const list = [...byEval.values()].sort((a, b) => a.assessmentDate.localeCompare(b.assessmentDate));
  for (const rem of list) rem.students.sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));
  return list;
}

/** « Faire reprendre l'éval Micro-organismes à : Léa M., Tom B. » */
export function makeupSentence(r: MakeupReminder): string {
  return `Faire reprendre l'éval ${r.assessmentName} à : ${r.students.map((s) => s.pseudo).join(', ')}`;
}
