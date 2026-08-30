import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from '../supabase';
import { ASSESSMENT_PROFILE, buildCopyPath, BUCKET_NAME } from './path';
import type { AssessmentCopyPage } from '../../types';

// Re-export de la logique pure (definie dans ./path pour rester testable sans natif)
export { ASSESSMENT_PROFILE, buildCopyPath, BUCKET_NAME } from './path';

export interface CopyUploadResult {
  success: boolean;
  path?: string;
  pageId?: string;
  error?: string;
}

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
 * Compresse / redimensionne une copie en HD (largeur seule -> ratio conserve)
 */
export async function compressCopy(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: ASSESSMENT_PROFILE.maxWidth } }],
    {
      compress: ASSESSMENT_PROFILE.jpegQuality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  return result.base64!;
}

/**
 * Upload une page de copie + insere la ligne assessment_copy_pages.
 * Upsert sur (assessment_id, student_id, page_order) -> re-scan = remplacement propre.
 */
export async function uploadCopyPage(
  userId: string,
  assessmentId: string,
  studentId: string,
  pageOrder: number,
  imageUri: string
): Promise<CopyUploadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase non configure' };
  }

  try {
    console.log('[Copies] Compressing copy page...');
    const base64Data = await compressCopy(imageUri);

    const filePath = buildCopyPath(userId, assessmentId, studentId, pageOrder);
    const arrayBuffer = decode(base64Data);

    console.log('[Copies] Uploading to:', filePath);
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[Copies] Upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }

    // Index la page en base (upsert pour gerer le re-scan d'une page existante)
    const { data: pageRow, error: insertError } = await supabase
      .from('assessment_copy_pages')
      .upsert(
        {
          user_id: userId,
          assessment_id: assessmentId,
          student_id: studentId,
          page_order: pageOrder,
          storage_path: filePath,
        },
        { onConflict: 'assessment_id,student_id,page_order' }
      )
      .select('id')
      .single();

    if (insertError) {
      console.error('[Copies] Index row error:', insertError);
      return { success: false, path: filePath, error: insertError.message };
    }

    console.log('[Copies] Upload success:', filePath);
    return { success: true, path: filePath, pageId: pageRow?.id };
  } catch (err) {
    console.error('[Copies] Upload failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
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

/**
 * Supprime une page: fichier Storage + ligne d'index.
 */
export async function deleteCopyPage(
  storagePath: string,
  pageId?: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const { error: storageError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (storageError) {
      console.error('[Copies] Delete storage error:', storageError);
      return false;
    }

    if (pageId) {
      const { error: rowError } = await supabase
        .from('assessment_copy_pages')
        .delete()
        .eq('id', pageId);

      if (rowError) {
        console.error('[Copies] Delete row error:', rowError);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('[Copies] Delete failed:', err);
    return false;
  }
}
