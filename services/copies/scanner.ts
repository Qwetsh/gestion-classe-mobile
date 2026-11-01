import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { getInfoAsync } from 'expo-file-system/legacy';
import { COPY_PROFILE, computeResize } from './path';
import { pickFromCamera } from './index';

/**
 * Scan des pages d'une copie.
 *
 * Scanner de documents ML Kit (Google, Android) : détection des bords, prise automatique,
 * redressement, recadrage, plusieurs pages d'affilée, reprise et réordonnancement dans sa
 * propre interface. Le module natif n'existe que dans un APK reconstruit après son ajout :
 * sans lui (ancien dev client), on retombe sur l'appareil photo simple, page par page.
 * Au premier usage, Google Play télécharge le module de scan : à faire hors du réseau du collège.
 */

type MlkitModule = typeof import('@infinitered/react-native-mlkit-document-scanner');

function loadMlkit(): MlkitModule | null {
  try {
    // require paresseux : le module lève une erreur à l'import si le natif est absent.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@infinitered/react-native-mlkit-document-scanner') as MlkitModule;
  } catch {
    return null;
  }
}

/** Le scanner ML Kit est-il disponible dans cet APK ? */
export function hasDocumentScanner(): boolean {
  return loadMlkit() !== null;
}

/**
 * Lance le scanner et renvoie les pages capturées (URI JPEG, non compressées), dans l'ordre.
 * Tableau vide si le prof annule.
 */
export async function scanPages(pageLimit = 8): Promise<string[]> {
  const mlkit = loadMlkit();
  if (!mlkit) {
    const uri = await pickFromCamera();
    return uri ? [uri] : [];
  }
  const result = await mlkit.launchDocumentScannerAsync({
    pageLimit,
    galleryImportAllowed: true,
    scannerMode: mlkit.ScannerModeOptions.FULL,
    resultFormats: mlkit.ResultFormatOptions.JPEG,
  });
  if (result.canceled || !result.pages) return [];
  return result.pages;
}

function getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: 0, height: 0 })
    );
  });
}

export interface PreparedPage {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Compresse une page selon COPY_PROFILE (grand côté ≤ 2000 px, JPEG 0,75) ; recompresse plus
 * fort si elle dépasse encore la limite du bucket. Le fichier produit est dans le cache :
 * l'appelant le met en file (copie persistante) dès que la copie est validée.
 */
export async function preparePage(uri: string): Promise<PreparedPage> {
  let { width, height } = await getSize(uri);
  if (!(width > 0 && height > 0)) {
    // Taille illisible par Image.getSize : on la demande au manipulateur plutôt que d'envoyer
    // la page en pleine résolution.
    const probe = await ImageManipulator.manipulateAsync(uri, []);
    ({ width, height } = probe);
  }
  const resize = computeResize(width, height);
  const actions = resize ? [{ resize }] : [];

  let out = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: COPY_PROFILE.jpegQuality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  let info = await getInfoAsync(out.uri);
  let bytes = info.exists ? info.size : 0;

  if (bytes > COPY_PROFILE.maxBytes) {
    out = await ImageManipulator.manipulateAsync(out.uri, [], {
      compress: COPY_PROFILE.fallbackQuality,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    info = await getInfoAsync(out.uri);
    bytes = info.exists ? info.size : 0;
  }

  return { uri: out.uri, width: out.width, height: out.height, bytes };
}
