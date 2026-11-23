/**
 * Logique pure du mode groupe en TP (testée dans __tests__/tpGroups.test.ts).
 * Rien ici ne touche à la base ni à l'interface.
 */

export interface TpGroupColor {
  /** Fond de l'îlot */
  soft: string;
  /** Bordure */
  border: string;
  /** Texte sur le fond */
  text: string;
}

/** Couleurs des îlots, dans l'ordre des groupes (G1, G2...). Texte contrasté sur chaque fond. */
export const TP_GROUP_COLORS: TpGroupColor[] = [
  { soft: '#EEF0FF', border: '#818CF8', text: '#3730A3' },
  { soft: '#E6F7F2', border: '#34B89A', text: '#0B5F4C' },
  { soft: '#FFF1E8', border: '#F59A5C', text: '#9A3A0E' },
  { soft: '#FDEDF4', border: '#E879A8', text: '#8C1D4F' },
  { soft: '#E8F4FD', border: '#5AAEE8', text: '#0E4F7E' },
  { soft: '#FEF6E0', border: '#E3B341', text: '#7A5300' },
  { soft: '#F1EDFE', border: '#A78BFA', text: '#5B21B6' },
  { soft: '#ECF7E4', border: '#7DBB52', text: '#3F6212' },
];

export function tpGroupColor(displayOrder: number): TpGroupColor {
  const i = ((displayOrder % TP_GROUP_COLORS.length) + TP_GROUP_COLORS.length) % TP_GROUP_COLORS.length;
  return TP_GROUP_COLORS[i];
}

/** Prochain nom libre : G1, G2... (le premier numéro non pris). */
export function nextGroupName(existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim().toUpperCase()));
  for (let i = 1; i < 1000; i++) {
    if (!taken.has(`G${i}`)) return `G${i}`;
  }
  return `G${existing.length + 1}`;
}

/**
 * Rangement automatique de n îlots sur le fond libre : deux colonnes, de haut en bas.
 * Retourne des positions 0..1 (coin haut gauche de l'îlot, relatif à la zone utile).
 */
export function autoLayout(count: number, columns = 2): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const rows = Math.ceil(count / columns);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    out.push({
      x: columns === 1 ? 0 : col / (columns - 1),
      y: rows === 1 ? 0 : row / (rows - 1),
    });
  }
  return out;
}

/** Mélange de Fisher-Yates (aléa injectable pour les tests). */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Répartit des élèves en groupes de taille `size` au plus, de tailles équilibrées
 * (10 élèves par 4 -> 4/3/3 et non 4/4/2).
 */
export function balancedGroups<T>(items: T[], size: number, random: () => number = Math.random): T[][] {
  if (items.length === 0 || size < 1) return [];
  const count = Math.ceil(items.length / size);
  const mixed = shuffle(items, random);
  const groups: T[][] = Array.from({ length: count }, () => []);
  mixed.forEach((item, i) => groups[i % count].push(item));
  return groups;
}

/**
 * Qui reçoit un point donné à tout le groupe : les membres présents et dans la salle.
 * Un absent (même placé dans le groupe pour voir les photos) ou un élève sorti ne reçoit rien.
 */
export function groupPointRecipients(
  memberIds: string[],
  isAbsent: (id: string) => boolean,
  isOut: (id: string) => boolean
): string[] {
  return memberIds.filter((id) => !isAbsent(id) && !isOut(id));
}

/** Note du groupe : somme des points moins le malus conduite, jamais sous zéro. */
export function groupScore(points: number[], conductMalus: number): number {
  const sum = points.reduce((s, p) => s + (Number.isFinite(p) ? p : 0), 0);
  return Math.max(0, sum - (Number.isFinite(conductMalus) ? conductMalus : 0));
}

/** Un groupe est noté quand chaque critère a reçu une note (zéro compris). */
export function isGroupFullyGraded(criteriaIds: string[], gradedCriteriaIds: string[]): boolean {
  if (criteriaIds.length === 0) return false;
  const graded = new Set(gradedCriteriaIds);
  return criteriaIds.every((id) => graded.has(id));
}

/** Pas d'un barème : demi-point, borné entre 0 et le maximum du critère. */
export function stepPoints(current: number, delta: number, max: number): number {
  const next = Math.round((current + delta) * 2) / 2;
  return Math.min(max, Math.max(0, next));
}

/** Les TP d'un niveau d'abord (« 3e » pour une classe « 3B »), puis les autres, par nom. */
export function levelOfClassName(className: string | null | undefined): string | null {
  if (!className) return null;
  const m = className.trim().match(/^([3-6])/);
  return m ? `${m[1]}e` : null;
}

export function sortTemplatesForClass<T extends { name: string; level: string | null; id: string }>(
  templates: T[],
  classLevel: string | null,
  lastUsedId: string | null
): { suggested: T | null; sameLevel: T[]; others: T[] } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'fr');
  const suggested = lastUsedId ? templates.find((t) => t.id === lastUsedId) ?? null : null;
  const rest = templates.filter((t) => t.id !== suggested?.id);
  const sameLevel = classLevel ? rest.filter((t) => t.level === classLevel).sort(byName) : [];
  const others = rest.filter((t) => !sameLevel.includes(t)).sort(byName);
  return { suggested, sameLevel, others };
}
