/**
 * Photos prises pendant un TP (par groupe ou pour toute la classe).
 *
 * Garantie : une photo prise n'est jamais perdue faute de réseau. Elle est réduite tout de suite
 * (1600 px au plus, JPEG), COPIÉE dans documentDirectory (le cache de l'appareil photo peut être
 * purgé par le système), puis enregistrée en base locale avec `uploaded = 0`. La synchro envoie
 * le fichier dans Storage dès que possible, puis la ligne `group_session_photos`.
 *
 * Bucket `student-photos` (privé, 1 Mo par fichier, dossier = id du professeur), chemin
 * `{user}/tp/{séance de groupe}/{photo}.jpg`, le même que celui des photos posées sur le web.
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  documentDirectory,
  makeDirectoryAsync,
  getInfoAsync,
  readAsStringAsync,
  copyAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from '../supabase';

export const TP_PHOTO_BUCKET = 'student-photos';
/** Limite du bucket (1 Mo) : au-delà, on réencode plus petit avant l'envoi. */
const BUCKET_LIMIT_BYTES = 1_000_000;
const PHOTO_DIR = `${documentDirectory}tp_photos/`;

const PROFILES = [
  { maxSide: 1600, quality: 0.75 },
  { maxSide: 1280, quality: 0.65 },
  { maxSide: 1024, quality: 0.6 },
];

export function buildTpPhotoPath(userId: string, groupSessionId: string, photoId: string): string {
  return `${userId}/tp/${groupSessionId}/${photoId}.jpg`;
}

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(PHOTO_DIR);
  if (!info.exists) await makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
}

/** Ouvre l'appareil photo, sans recadrage (une paillasse ne tient pas dans un carré). */
export async function takeTpPhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

/** Choisit une photo déjà prise (galerie). */
export async function pickTpPhotoFromGallery(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0].uri;
}

async function resize(uri: string, profile: { maxSide: number; quality: number }, width?: number, height?: number) {
  // Côté le plus long ramené à maxSide, sans jamais agrandir.
  const actions: ImageManipulator.Action[] = [];
  if (width && height) {
    const longSide = Math.max(width, height);
    if (longSide > profile.maxSide) {
      actions.push({ resize: width >= height ? { width: profile.maxSide } : { height: profile.maxSide } });
    }
  } else {
    actions.push({ resize: { width: profile.maxSide } });
  }
  return ImageManipulator.manipulateAsync(uri, actions, {
    compress: profile.quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
}

/**
 * Réduit la photo et la range dans le dossier durable de l'app. Retourne le chemin local.
 */
export async function storeTpPhotoLocally(sourceUri: string, photoId: string): Promise<string> {
  await ensureDir();
  const probe = await ImageManipulator.manipulateAsync(sourceUri, [], { format: ImageManipulator.SaveFormat.JPEG, compress: 1 });
  let out = await resize(sourceUri, PROFILES[0], probe.width, probe.height);
  for (let i = 1; i < PROFILES.length; i++) {
    const info = await getInfoAsync(out.uri);
    if (!info.exists || !('size' in info) || (info.size ?? 0) <= BUCKET_LIMIT_BYTES) break;
    out = await resize(sourceUri, PROFILES[i], probe.width, probe.height);
  }
  const dest = `${PHOTO_DIR}${photoId}.jpg`;
  await copyAsync({ from: out.uri, to: dest });
  return dest;
}

/** Envoie le fichier local dans Storage. Retourne true s'il y est. Ne lève jamais. */
export async function uploadTpPhotoFile(localUri: string, filePath: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;
  try {
    const info = await getInfoAsync(localUri);
    if (!info.exists) return false;
    const base64 = await readAsStringAsync(localUri, { encoding: EncodingType.Base64 });
    const { error } = await supabase.storage
      .from(TP_PHOTO_BUCKET)
      .upload(filePath, decode(base64), { contentType: 'image/jpeg', upsert: true });
    if (error) {
      if (__DEV__) console.warn('[tpPhotos] upload failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[tpPhotos] upload error:', err);
    return false;
  }
}

/** Fichier local encore présent ? (sinon on affiche la version du serveur) */
export async function localPhotoExists(localUri: string | null): Promise<boolean> {
  if (!localUri) return false;
  try {
    return (await getInfoAsync(localUri)).exists;
  } catch {
    return false;
  }
}

export async function deleteLocalTpPhoto(localUri: string | null): Promise<void> {
  if (!localUri) return;
  try {
    await deleteAsync(localUri, { idempotent: true });
  } catch {
    // Sans conséquence : le dossier sera nettoyé avec l'app
  }
}

/** Supprime le fichier du serveur (photo retirée par le professeur). Ne lève jamais. */
export async function deleteRemoteTpPhoto(filePath: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    await supabase.storage.from(TP_PHOTO_BUCKET).remove([filePath]);
  } catch {
    // La ligne est déjà supprimée ; le fichier orphelin ne se voit nulle part
  }
}

/** Adresse signée (1 h) pour afficher une photo qui n'est plus sur le téléphone. */
export async function getTpPhotoSignedUrl(filePath: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase.storage.from(TP_PHOTO_BUCKET).createSignedUrl(filePath, 3600);
  return error ? null : data.signedUrl;
}
