/**
 * Groupe du cours « de maintenant » lu directement sur Supabase (emploi du temps + correspondance
 * des libellés). Pas de copie SQLite : hors ligne, table absente ou erreur -> null, et l'écran de
 * démarrage retombe sur l'alternance.
 */
import { supabase } from './supabase/client';
import { lessonGroupWindow, pickLessonGroup, type LessonGroupMatch } from '../utils/lessonGroup';

export async function fetchLessonGroupFor(
  classId: string,
  at: Date,
  knownGroupIds?: Iterable<string> | null
): Promise<LessonGroupMatch | null> {
  if (!supabase) return null;
  try {
    const { from, to } = lessonGroupWindow(at);
    const { data: lessons, error } = await supabase
      .from('timetable_entries')
      .select('label, starts_at')
      .eq('kind', 'lesson')
      .gte('starts_at', from)
      .lte('starts_at', to);
    if (error || !lessons || lessons.length === 0) return null;

    const labels = [...new Set(lessons.map((l) => l.label as string))];
    const { data: links, error: linkError } = await supabase
      .from('timetable_label_links')
      .select('label, class_id, group_id, ignored')
      .in('label', labels);
    if (linkError || !links) return null;

    return pickLessonGroup(lessons, links, classId, at, knownGroupIds);
  } catch {
    return null;
  }
}
