import * as ImagePicker from 'expo-image-picker';
import { supabase, isSupabaseConfigured } from '../supabase';
import { BUCKET_NAME } from './path';
import type { AssessmentCopyPage } from '../../types';

// Re-export de la logique pure (definie dans ./path pour rester testable sans natif)
export { COPY_PROFILE, buildCopyPath, computeResize, BUCKET_NAME } from './path';

// Alias de compat: une page de copie = type canonique des types/
export type CopyPageRow = AssessmentCopyPage;

/**
 * Demande la permission camera
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Demande la permission galerie
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Capture une copie depuis la camera.
 * IMPORTANT: pas d'aspect [1,1] (une copie est rectangulaire), allowsEditing pour recadrer.
 */
export async function pickFromCamera(): Promise<string | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) {
    console.warn('[Copies] Camera permission denied');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1, // compression appliquee ensuite
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Choisit une copie depuis la galerie (fallback / re-import)
 */
export async function pickFromGallery(): Promise<string | null> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) {
    console.warn('[Copies] Media library permission denied');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 1,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Liste les pages scannees d'un eleve pour une eval (triees par page_order)
 */
export async function listCopyPages(
  assessmentId: string,
  studentId: string
): Promise<CopyPageRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('assessment_copy_pages')
      .select('id, assessment_id, student_id, page_order, storage_path, created_at')
      .eq('assessment_id', assessmentId)
      .eq('student_id', studentId)
      .order('page_order', { ascending: true });

    if (error) {
      console.error('[Copies] List pages error:', error);
      return [];
    }

    return (data ?? []) as CopyPageRow[];
  } catch (err) {
    console.error('[Copies] List pages failed:', err);
    return [];
  }
}

/**
 * Signed URL d'une page (valide 1h)
 */
export async function getCopyPageUrl(storagePath: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 3600);

    if (error) {
      console.error('[Copies] Get URL error:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('[Copies] Get URL failed:', err);
    return null;
  }
}
