import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from '../supabase';

const BUCKET_NAME = 'student-photos';

// Quality profiles
export type PhotoQuality = 'minimal' | 'normal';

const QUALITY_PROFILES = {
  minimal: {
    maxWidth: 300,
    maxHeight: 300,
    jpegQuality: 0.7,
  },
  normal: {
    maxWidth: 600,
    maxHeight: 600,
    jpegQuality: 0.85,
  },
};

export interface PhotoUploadResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Request camera permissions
 */
export async function requestCameraPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  return status === 'granted';
}

/**
 * Request media library permissions
 */
export async function requestMediaLibraryPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

/**
 * Pick image from camera
 */
export async function pickFromCamera(): Promise<string | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) {
    console.warn('[Photos] Camera permission denied');
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1, // We'll compress later
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Pick image from gallery
 */
export async function pickFromGallery(): Promise<string | null> {
  const hasPermission = await requestMediaLibraryPermission();
  if (!hasPermission) {
    console.warn('[Photos] Media library permission denied');
    return null;
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1, // We'll compress later
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0].uri;
}

/**
 * Compress and resize image
 */
export async function compressImage(uri: string, quality: PhotoQuality = 'minimal'): Promise<string> {
  const profile = QUALITY_PROFILES[quality];

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: profile.maxWidth, height: profile.maxHeight } }],
    {
      compress: profile.jpegQuality,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  return result.base64!;
}

/**
 * Upload photo to Supabase Storage
 */
export async function uploadStudentPhoto(
  userId: string,
  studentId: string,
  imageUri: string
): Promise<PhotoUploadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase non configure' };
  }

  try {
    // Compress the image
    console.log('[Photos] Compressing image...');
    const base64Data = await compressImage(imageUri);

    // Generate file path: userId/studentId.jpg
    const filePath = `${userId}/${studentId}.jpg`;

    // Convert base64 to ArrayBuffer
    const arrayBuffer = decode(base64Data);

    console.log('[Photos] Uploading to:', filePath);

    // Upload to Supabase Storage (upsert to replace existing)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[Photos] Upload error:', error);
      return { success: false, error: error.message };
    }

    console.log('[Photos] Upload success:', data.path);
    return { success: true, path: data.path };
  } catch (err) {
    console.error('[Photos] Upload failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
}

/**
 * Get signed URL for a student photo
 */
export async function getStudentPhotoUrl(
  photoPath: string
): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    // Get signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(photoPath, 3600);

    if (error) {
      console.error('[Photos] Get URL error:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('[Photos] Get URL failed:', err);
    return null;
  }
}

/**
 * Delete student photo
 */
export async function deleteStudentPhoto(photoPath: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([photoPath]);

    if (error) {
      console.error('[Photos] Delete error:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Photos] Delete failed:', err);
    return false;
  }
}

/**
 * Get student's photo_path from Supabase
 */
export async function getStudentPhotoPath(studentId: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('students')
      .select('photo_path')
      .eq('id', studentId)
      .single();

    if (error) {
      console.error('[Photos] Get photo path error:', error);
      return null;
    }

    return data?.photo_path || null;
  } catch (err) {
    console.error('[Photos] Get photo path failed:', err);
    return null;
  }
}

/**
 * Update student's photo_path in Supabase
 */
export async function updateStudentPhotoPath(
  studentId: string,
  photoPath: string
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('students')
      .update({ photo_path: photoPath })
      .eq('id', studentId);

    if (error) {
      console.error('[Photos] Update photo path error:', error);
      return false;
    }

    console.log('[Photos] Updated photo_path for student:', studentId);
    return true;
  } catch (err) {
    console.error('[Photos] Update photo path failed:', err);
    return false;
  }
}

/**
 * Upload photo for an event (remarque)
 * Stored in: userId/events/eventId.jpg
 */
export async function uploadEventPhoto(
  userId: string,
  eventId: string,
  imageUri: string,
  quality: PhotoQuality = 'minimal'
): Promise<PhotoUploadResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase non configure' };
  }

  try {
    // Compress the image with selected quality
    console.log('[Photos] Compressing event image with quality:', quality);
    const base64Data = await compressImage(imageUri, quality);

    // Generate file path: userId/events/eventId.jpg
    const filePath = `${userId}/events/${eventId}.jpg`;

    // Convert base64 to ArrayBuffer
    const arrayBuffer = decode(base64Data);

    console.log('[Photos] Uploading event photo to:', filePath);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[Photos] Event photo upload error:', error);
      return { success: false, error: error.message };
    }

    console.log('[Photos] Event photo upload success:', data.path);
    return { success: true, path: data.path };
  } catch (err) {
    console.error('[Photos] Event photo upload failed:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur inconnue',
    };
  }
}
