/**
 * Notes écrites depuis l'accueil web sur un cours de l'emploi du temps (table lesson_notes,
 * migration 044). Le téléphone ne connaît pas l'emploi du temps : il retrouve la note par
 * classe + proximité horaire. Logique pure, testée dans __tests__/utils/lessonNotes.test.ts.
 */

export interface LessonNote {
  id: string;
  class_id: string | null;
  group_id: string | null;
  starts_at: string;
  ends_at: string;
  label: string;
  content: string;
  done: boolean;
}

/** Une note est « pour maintenant » si son cours a commencé il y a moins de 50 min ou commence dans moins de 30 min. */
export const NOTE_BEFORE_MS = 50 * 60 * 1000;
export const NOTE_AFTER_MS = 30 * 60 * 1000;

/**
 * Note à afficher pour une classe à un instant donné : parmi les notes non vues de la classe
 * dont le cours est dans la fenêtre, celle dont le début est le plus proche de `at`.
 * Un groupe précisé (demi-classe) ne garde que les notes du groupe ou de la classe entière.
 */
export function pickLessonNote(
  notes: LessonNote[],
  classId: string,
  at: Date,
  groupId?: string | null
): LessonNote | null {
  const t = at.getTime();
  let best: LessonNote | null = null;
  let bestDelta = Infinity;
  for (const n of notes) {
    if (n.done || n.class_id !== classId) continue;
    if (groupId && n.group_id && n.group_id !== groupId) continue;
    const start = new Date(n.starts_at).getTime();
    if (Number.isNaN(start)) continue;
    if (start < t - NOTE_BEFORE_MS || start > t + NOTE_AFTER_MS) continue;
    const delta = Math.abs(start - t);
    if (delta < bestDelta) {
      best = n;
      bestDelta = delta;
    }
  }
  return best;
}

/** Bornes de la requête serveur pour un instant donné (les mêmes que pickLessonNote). */
export function lessonNoteWindow(at: Date): { from: string; to: string } {
  return {
    from: new Date(at.getTime() - NOTE_BEFORE_MS).toISOString(),
    to: new Date(at.getTime() + NOTE_AFTER_MS).toISOString(),
  };
}
