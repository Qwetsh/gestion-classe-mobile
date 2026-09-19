/**
 * Dispositifs d'accompagnement (PAP / PPRE / PAI).
 *
 * Seul l'indicateur « en bénéficie / n'en bénéficie pas » est stocké
 * (colonnes has_pap / has_ppre / has_pai côté Supabase et SQLite), jamais le
 * contenu du dispositif (RGPD). Jumeau web : gestion-classe-web/src/lib/accommodations.ts
 */

export interface StudentAccommodations {
  hasPap?: boolean | null;
  hasPpre?: boolean | null;
  hasPai?: boolean | null;
}

export const ACCOMMODATION_DEFS = [
  { key: 'hasPap', label: 'PAP', title: "Plan d'Accompagnement Personnalisé" },
  { key: 'hasPpre', label: 'PPRE', title: 'Programme Personnalisé de Réussite Éducative' },
  { key: 'hasPai', label: 'PAI', title: "Projet d'Accueil Individualisé" },
] as const;

/** Libellés actifs, dans l'ordre PAP › PPRE › PAI. Vide si aucun dispositif. */
export function accommodationTags(s: StudentAccommodations | null | undefined): string[] {
  if (!s) return [];
  return ACCOMMODATION_DEFS.filter(d => !!s[d.key]).map(d => d.label);
}

export function hasAccommodation(s: StudentAccommodations | null | undefined): boolean {
  return accommodationTags(s).length > 0;
}
