/**
 * Évals à faire rattraper aux absents : lecture directe de la vue pending_makeups sur Supabase,
 * comme les notes de cours (pas de copie SQLite, pas de sync). Hors ligne ou vue absente :
 * liste vide, l'écran s'en passe.
 */
import { supabase } from './supabase/client';
import { makeupRemindersFor, type MakeupReminder, type PendingMakeupRow } from '../utils/makeupReminders';

const COLUMNS =
  'assessment_id, assessment_name, assessment_date, class_id, group_id, student_id, pseudo, student_group_ids';

/** Rappels pour une séance de cette classe à l'instant `at`. */
export async function fetchMakeupRemindersFor(
  classId: string,
  at: Date,
  groupId?: string | null
): Promise<MakeupReminder[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('pending_makeups').select(COLUMNS).eq('class_id', classId);
    if (error || !data) return [];
    return makeupRemindersFor(data as PendingMakeupRow[], classId, at, groupId);
  } catch {
    return [];
  }
}

/** « Ne plus rappeler » : coupe le rappel de cette éval partout (web compris). */
export async function dismissMakeupReminder(assessmentId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from('written_assessments')
      .update({ makeup_reminder_dismissed_at: new Date().toISOString() })
      .eq('id', assessmentId);
    return !error;
  } catch {
    return false;
  }
}
