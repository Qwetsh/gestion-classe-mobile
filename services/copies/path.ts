/**
 * Logique pure du service copies — aucun import natif (testable sans jest-expo transform).
 */

/** Bucket Storage prive des copies d'eval (centralise ici, partage index/assessments). */
export const BUCKET_NAME = 'assessment-copies';

/**
 * Profil de compression des pages de copie, applique DES LA CAPTURE (pas a l'envoi).
 *
 * Cible : 300-500 Ko par page, lisible pour la correction. Claude ramene de toute facon
 * une image a ~1568 px sur le grand cote : au-dela de ~2200 px on ne paie que du poids
 * (scans d'appli a 1 Go par classe, transfert OneDrive interminable).
 * Le bucket refuse au-dela de 5 Mo : si une page depasse `maxBytes`, on recompresse
 * avec `fallbackQuality`.
 */
export const COPY_PROFILE = {
  maxLongEdge: 2200,
  jpegQuality: 0.7,
  fallbackQuality: 0.5,
  maxBytes: 4.5 * 1024 * 1024,
};

/**
 * Redimensionnement a appliquer pour que le grand cote ne depasse pas `maxLongEdge`.
 * Une seule dimension est donnee (le ratio est conserve) ; `null` = deja assez petit,
 * on n'agrandit jamais une page.
 */
export function computeResize(
  width: number,
  height: number,
  maxLongEdge: number = COPY_PROFILE.maxLongEdge
): { width: number } | { height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.max(width, height) <= maxLongEdge) return null;
  return width >= height ? { width: maxLongEdge } : { height: maxLongEdge };
}

/**
 * Construit le chemin de stockage d'une page de copie.
 * Format: userId/{assessmentId}/{studentId}/{pageId}.jpg
 * Le userId DOIT etre le 1er segment (les storage policies filtrent dessus).
 * Le nom est l'identifiant de la page (pas son numero) : reordonner ou remplacer une page
 * ne change que `page_order` en base, jamais le fichier d'une autre page.
 */
export function buildCopyPath(
  userId: string,
  assessmentId: string,
  studentId: string,
  pageId: string
): string {
  return `${userId}/${assessmentId}/${studentId}/${pageId}.jpg`;
}
