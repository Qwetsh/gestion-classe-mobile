/**
 * Lecture des notes de cours (lesson_notes) directement sur Supabase : pas de copie SQLite,
 * pas de sync. Hors ligne ou table absente : on renvoie null et l'écran s'en passe.
 * Une note n'est jamais créée depuis le téléphone, seulement marquée « vue ».
 */
import { supabase } from './supabase/client';
import { lessonNoteWindow, pickLessonNote, type LessonNote } from '../utils/lessonNotes';

const COLUMNS = 'id, class_id, group_id, starts_at, ends_at, label, content, done';

/** Note à afficher pour cette classe autour de l'instant `at` (démarrage de séance, maintenant…). */
export async function fetchLessonNoteFor(
  classId: string,
  at: Date,
  groupId?: string | null
): Promise<LessonNote | null> {
  if (!supabase) return null;
  try {
    const { from, to } = lessonNoteWindow(at);
    const { data, error } = await supabase
      .from('lesson_notes')
      .select(COLUMNS)
      .eq('class_id', classId)
      .eq('done', false)
      .gte('starts_at', from)
      .lte('starts_at', to);
    if (error || !data) return null;
    return pickLessonNote(data as LessonNote[], classId, at, groupId);
  } catch {
    return null;
  }
}

export async function markLessonNoteDone(noteId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('lesson_notes')
      .update({ done: true, updated_at: new Date().toISOString() })
      .eq('id', noteId);
    return !error;
  } catch {
    return false;
  }
}
