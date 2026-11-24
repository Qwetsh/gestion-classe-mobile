/**
 * Groupe de classe du cours « de maintenant », d'après l'emploi du temps (timetable_entries) et la
 * correspondance libellé Pronote -> classe / groupe (timetable_label_links, migration 043).
 * Exemple : un cours « 3°AP1 » relié à 3A / Groupe 1 -> la séance de 3A part sur le Groupe 1.
 * Logique pure, testée dans __tests__/utils/lessonGroup.test.ts. Même fenêtre que les notes de cours.
 */
import { NOTE_AFTER_MS, NOTE_BEFORE_MS } from './lessonNotes';

export interface TimetableLessonLike {
  label: string;
  starts_at: string;
}

export interface LabelLinkLike {
  label: string;
  class_id: string | null;
  group_id: string | null;
  ignored?: boolean | null;
}

export interface LessonGroupMatch {
  /** Libellé Pronote du cours (« 3°AP1 ») */
  label: string;
  /** Groupe relié au libellé ; null = cours en classe entière */
  groupId: string | null;
  startsAt: string;
}

/**
 * Cours de la classe dont le début est le plus proche de `at`, dans la fenêtre
 * [at - 50 min, at + 30 min]. null s'il n'y en a aucun (pas de cours, libellé non relié).
 * Un groupe qui n'appartient pas aux groupes connus de la classe est ignoré (lien périmé).
 */
export function pickLessonGroup(
  lessons: TimetableLessonLike[],
  links: LabelLinkLike[],
  classId: string,
  at: Date,
  knownGroupIds?: Iterable<string> | null
): LessonGroupMatch | null {
  const byLabel = new Map<string, LabelLinkLike>();
  for (const l of links) byLabel.set(l.label, l);
  const known = knownGroupIds ? new Set(knownGroupIds) : null;
  const t = at.getTime();

  let best: LessonGroupMatch | null = null;
  let bestDelta = Infinity;
  for (const lesson of lessons) {
    const link = byLabel.get(lesson.label);
    if (!link || link.ignored || link.class_id !== classId) continue;
    const start = new Date(lesson.starts_at).getTime();
    if (Number.isNaN(start)) continue;
    if (start < t - NOTE_BEFORE_MS || start > t + NOTE_AFTER_MS) continue;
    const delta = Math.abs(start - t);
    if (delta >= bestDelta) continue;
    const groupId = link.group_id && (!known || known.has(link.group_id)) ? link.group_id : null;
    best = { label: lesson.label, groupId, startsAt: lesson.starts_at };
    bestDelta = delta;
  }
  return best;
}

/** Bornes de la requête serveur (les mêmes que pickLessonGroup). */
export function lessonGroupWindow(at: Date): { from: string; to: string } {
  return {
    from: new Date(at.getTime() - NOTE_BEFORE_MS).toISOString(),
    to: new Date(at.getTime() + NOTE_AFTER_MS).toISOString(),
  };
}
