import { supabase, isSupabaseConfigured } from '../supabase';
import { BUCKET_NAME } from './path';
import type { WrittenAssessment } from '../../types';

/**
 * CRUD des evaluations ecrites (written_assessments) en Supabase direct (cloud-direct).
 * Les copies elles-memes (images + index pages) sont protegees offline par la file
 * d'upload (cf. Jalon 4). Creer/lister une eval demande une connexion.
 */

const TABLE = 'written_assessments';

export interface CreateAssessmentInput {
  userId: string;
  classId: string;
  name: string;
  subject?: string | null;
  date?: string | null;
  baremeTotal?: number;
}

/**
 * Liste les evals d'un utilisateur (non supprimees), plus recentes d'abord.
 * Optionnellement filtrees par classe.
 */
export async function listAssessments(
  userId: string,
  classId?: string
): Promise<WrittenAssessment[]> {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    let query = supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Assessments] List error:', error);
      return [];
    }
    return (data ?? []) as WrittenAssessment[];
  } catch (err) {
    console.error('[Assessments] List failed:', err);
    return [];
  }
}

/**
 * Cree une eval. Renvoie la ligne creee, ou null en cas d'echec (ex: hors-ligne).
 */
export async function createAssessment(
  input: CreateAssessmentInput
): Promise<WrittenAssessment | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: input.userId,
        class_id: input.classId,
        name: input.name,
        subject: input.subject ?? null,
        date: input.date ?? null,
        bareme_total: input.baremeTotal ?? 20,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[Assessments] Create error:', error);
      return null;
    }
    return data as WrittenAssessment;
  } catch (err) {
    console.error('[Assessments] Create failed:', err);
    return null;
  }
}

/**
 * Met a jour une eval (nom, matiere, date, bareme).
 */
export async function updateAssessment(
  id: string,
  patch: Partial<Pick<WrittenAssessment, 'name' | 'subject' | 'date' | 'bareme_total'>>
): Promise<WrittenAssessment | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('[Assessments] Update error:', error);
      return null;
    }
    return data as WrittenAssessment;
  } catch (err) {
    console.error('[Assessments] Update failed:', err);
    return null;
  }
}

/**
 * Suppression logique d'une eval (is_deleted = true).
 * Les pages/fichiers Storage ne sont pas purges ici (suppression RGPD = action dediee).
 */
export async function softDeleteAssessment(id: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[Assessments] Soft delete error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Assessments] Soft delete failed:', err);
    return false;
  }
}

export interface PurgeResult {
  success: boolean;
  filesDeleted: number;
  error?: string;
}

/**
 * PURGE complete d'une eval : supprime les FICHIERS du bucket Storage (libere l'espace)
 * PUIS la ligne written_assessments (le CASCADE DB supprime les lignes assessment_copy_pages).
 * Irreversible. Ne touche pas la file offline locale (gere separement cote uploadQueue).
 */
export async function purgeAssessment(assessmentId: string): Promise<PurgeResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, filesDeleted: 0, error: 'Supabase non configure' };
  }

  try {
    // 1) Recupere tous les chemins de fichiers a effacer
    const { data: pages, error: listError } = await supabase
      .from('assessment_copy_pages')
      .select('storage_path')
      .eq('assessment_id', assessmentId);

    if (listError) {
      return { success: false, filesDeleted: 0, error: listError.message };
    }

    const paths = (pages ?? []).map((p) => (p as { storage_path: string }).storage_path);

    // 2) Supprime les objets Storage par lots (l'API accepte un tableau)
    let filesDeleted = 0;
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const slice = paths.slice(i, i + CHUNK);
      if (slice.length === 0) continue;
      const { error: rmError } = await supabase.storage.from(BUCKET_NAME).remove(slice);
      if (rmError) {
        return { success: false, filesDeleted, error: rmError.message };
      }
      filesDeleted += slice.length;
    }

    // 3) Supprime la ligne d'eval (hard delete) -> cascade sur assessment_copy_pages
    const { error: delError } = await supabase
      .from('written_assessments')
      .delete()
      .eq('id', assessmentId);

    if (delError) {
      return { success: false, filesDeleted, error: delError.message };
    }

    return { success: true, filesDeleted };
  } catch (err) {
    return {
      success: false,
      filesDeleted: 0,
      error: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
}

/**
 * Renvoie une map studentId -> nombre de pages scannees pour une eval.
 * Sert a afficher la pastille "X pages" par eleve sur l'ecran de scan.
 */
export async function getPageCountsByStudent(
  assessmentId: string
): Promise<Record<string, number>> {
  if (!isSupabaseConfigured || !supabase) return {};

  try {
    const { data, error } = await supabase
      .from('assessment_copy_pages')
      .select('student_id')
      .eq('assessment_id', assessmentId);

    if (error) {
      console.error('[Assessments] Page counts error:', error);
      return {};
    }

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const sid = (row as { student_id: string }).student_id;
      counts[sid] = (counts[sid] ?? 0) + 1;
    }
    return counts;
  } catch (err) {
    console.error('[Assessments] Page counts failed:', err);
    return {};
  }
}
