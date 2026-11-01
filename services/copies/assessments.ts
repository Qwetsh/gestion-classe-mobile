import { supabase, isSupabaseConfigured } from '../supabase';
import { BUCKET_NAME, planCopyPurge } from './path';
import type { ScanSnapshot } from './outboxLogic';
import type { WrittenAssessment } from '../../types';

/**
 * Lecture des évals écrites et de l'état de leurs copies, en Supabase direct.
 * Les ÉCRITURES (création d'éval, pages, absents…) passent par la file d'envoi (./outbox) :
 * elles doivent marcher hors ligne. Ces lectures renvoient `null` hors ligne, et l'appelant
 * se rabat sur le dernier instantané mis en cache (./localCache).
 */

const TABLE = 'written_assessments';

/** Les copies papier ne concernent que les évaluations écrites et les devoirs maison. */
const SCANNABLE_KINDS = ['ecrit', 'dm'];

/**
 * Évals scannables d'une classe (non supprimées), plus récentes d'abord.
 * `null` en cas d'échec (hors ligne) — distinct d'une liste vide.
 */
export async function listAssessments(
  userId: string,
  classId: string
): Promise<WrittenAssessment[] | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(
        'id, user_id, class_id, name, subject, date, bareme_total, created_at, updated_at, is_deleted, session_id, period, kind, published_to_students, assessment_series(name)'
      )
      .eq('user_id', userId)
      .eq('class_id', classId)
      .eq('is_deleted', false)
      .in('kind', SCANNABLE_KINDS)
      .order('date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Assessments] List error:', error);
      return null;
    }
    return (data ?? []).map((row) => {
      const { assessment_series, ...rest } = row as typeof row & {
        assessment_series: { name: string } | { name: string }[] | null;
      };
      const series = Array.isArray(assessment_series) ? assessment_series[0] : assessment_series;
      return { ...rest, series_name: series?.name ?? null } as WrittenAssessment;
    });
  } catch (err) {
    console.error('[Assessments] List failed:', err);
    return null;
  }
}

/**
 * État serveur des copies d'une éval : pages (dans l'ordre) et informations par élève
 * (absent, version du sujet, adaptée, annotée). `null` hors ligne.
 */
export async function fetchScanSnapshot(assessmentId: string): Promise<ScanSnapshot | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const [pagesRes, infosRes] = await Promise.all([
      supabase
        .from('assessment_copy_pages')
        .select('id, student_id, page_order, storage_path')
        .eq('assessment_id', assessmentId)
        .order('page_order', { ascending: true }),
      supabase
        .from('assessment_grades')
        .select('student_id, status, subject_version, is_adapted, copy_annotated')
        .eq('assessment_id', assessmentId),
    ]);
    if (pagesRes.error || infosRes.error) {
      console.error('[Assessments] Snapshot error:', pagesRes.error ?? infosRes.error);
      return null;
    }
    return {
      pages: pagesRes.data ?? [],
      infos: infosRes.data ?? [],
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Assessments] Snapshot failed:', err);
    return null;
  }
}

export interface PurgeResult {
  success: boolean;
  filesDeleted: number;
  /** Copies sans transcription : leurs scans sont gardés. */
  kept: number;
  error?: string;
}

/**
 * Efface les SCANS d'une éval : fichiers du bucket (libère l'espace) puis lignes
 * assessment_copy_pages. L'éval, ses notes et leur détail restent : avant le 01/11/2026 on
 * supprimait la ligne written_assessments, dont la cascade emportait aussi assessment_grades.
 * Seules les copies transcrites par le Correcteur perdent leurs scans (migration 056) ; tant
 * que la table n'existe pas, rien n'est supprimé. Irréversible. Ne touche pas la file locale :
 * une page encore sur le téléphone n'est transcrite par personne.
 */
export async function purgeAssessmentCopies(assessmentId: string): Promise<PurgeResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, filesDeleted: 0, kept: 0, error: 'Supabase non configure' };
  }

  try {
    // 1) Pages de l'éval, et copies transcrites
    const [pagesRes, transcriptsRes] = await Promise.all([
      supabase.from('assessment_copy_pages').select('student_id, storage_path').eq('assessment_id', assessmentId),
      supabase.from('assessment_copy_transcripts').select('student_id').eq('assessment_id', assessmentId),
    ]);

    if (pagesRes.error) {
      return { success: false, filesDeleted: 0, kept: 0, error: pagesRes.error.message };
    }
    const missingTable = ['PGRST205', '42P01'].includes(transcriptsRes.error?.code ?? '');
    if (transcriptsRes.error && !missingTable) {
      return { success: false, filesDeleted: 0, kept: 0, error: transcriptsRes.error.message };
    }

    const pages = (pagesRes.data ?? []) as { student_id: string; storage_path: string }[];
    const transcribed = new Set(
      ((transcriptsRes.data ?? []) as { student_id: string }[]).map((t) => t.student_id)
    );
    const plan = planCopyPurge(pages, transcribed);
    const paths = plan.paths;
    const kept = plan.keptStudents.length;

    // 2) Supprime les objets Storage par lots (l'API accepte un tableau)
    let filesDeleted = 0;
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const slice = paths.slice(i, i + CHUNK);
      if (slice.length === 0) continue;
      const { error: rmError } = await supabase.storage.from(BUCKET_NAME).remove(slice);
      if (rmError) {
        return { success: false, filesDeleted, kept, error: rmError.message };
      }
      filesDeleted += slice.length;
    }

    // 3) Supprime l'index de ces pages (l'éval, ses notes et les autres copies restent)
    if (plan.purgedStudents.length > 0) {
      const { error: delError } = await supabase
        .from('assessment_copy_pages')
        .delete()
        .eq('assessment_id', assessmentId)
        .in('student_id', plan.purgedStudents);

      if (delError) {
        return { success: false, filesDeleted, kept, error: delError.message };
      }
    }

    return { success: true, filesDeleted, kept };
  } catch (err) {
    return {
      success: false,
      filesDeleted: 0,
      kept: 0,
      error: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
}
