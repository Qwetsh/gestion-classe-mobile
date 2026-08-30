/**
 * Logique pure du service copies — aucun import natif (testable sans jest-expo transform).
 */

/** Bucket Storage prive des copies d'eval (centralise ici, partage index/assessments). */
export const BUCKET_NAME = 'assessment-copies';

/**
 * Profil de compression HD pour copies manuscrites.
 * Resize sur la LARGEUR uniquement (ratio conserve) — une copie n'est pas carree.
 * Les profils photos (300/600 px) sont trop bas pour de l'ecriture a la main.
 */
export const ASSESSMENT_PROFILE = {
  maxWidth: 2000,
  jpegQuality: 0.8,
};

/**
 * Construit le chemin de stockage d'une page de copie.
 * Format: userId/{assessmentId}/{studentId}/{pageOrder}.jpg
 * Le userId DOIT etre le 1er segment (les storage policies filtrent dessus).
 */
export function buildCopyPath(
  userId: string,
  assessmentId: string,
  studentId: string,
  pageOrder: number
): string {
  return `${userId}/${assessmentId}/${studentId}/${pageOrder}.jpg`;
}
