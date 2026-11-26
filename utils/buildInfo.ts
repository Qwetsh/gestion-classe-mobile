/**
 * Étiquette de version affichée dans l'app, pour savoir quel APK est installé.
 *
 * Le numéro de version seul ne suffit pas : plusieurs APK construits à des jours différents ont
 * porté le même « 1.1.0 ». Le commit, lui, est unique, et chaque APK est étiqueté dans git
 * (`apk/AAAA-MM-JJ-profil`).
 */

export interface BuildInfo {
  /** Sept premiers caractères du commit de construction ; absent en développement. */
  commit?: string | null;
  /** Profil EAS : production, preview ou development. */
  profile?: string | null;
}

export function formatBuildLabel(version: string | null | undefined, build?: BuildInfo | null): string {
  const parts = [`Version ${version || 'inconnue'}`];
  const commit = build?.commit?.trim();
  parts.push(commit ? commit.slice(0, 7) : 'développement');
  const profile = build?.profile?.trim();
  if (commit && profile && profile !== 'production') parts.push(profile);
  return parts.join(' · ');
}
