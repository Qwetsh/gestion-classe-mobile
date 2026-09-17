/**
 * Palette des groupes de classe. La base stocke une CLE (ex. 'indigo'), jamais un hex,
 * pour que web et mobile puissent chacun rendre leur propre nuance.
 * Jumeau web : gestion-classe-web/src/lib/classGroupColors.ts (memes cles).
 */
export interface ClassGroupColor {
  key: string;
  main: string;
  soft: string;
  label: string;
}

export const CLASS_GROUP_COLORS: ClassGroupColor[] = [
  { key: 'indigo', main: '#4F46E5', soft: '#EEF0FF', label: 'Indigo' },
  { key: 'emerald', main: '#059669', soft: '#D1FAE5', label: 'Vert' },
  { key: 'amber', main: '#D97706', soft: '#FEF3C7', label: 'Ambre' },
  { key: 'pink', main: '#DB2777', soft: '#FCE7F3', label: 'Rose' },
  { key: 'blue', main: '#2563EB', soft: '#DBEAFE', label: 'Bleu' },
  { key: 'violet', main: '#7C3AED', soft: '#EDE9FE', label: 'Violet' },
  { key: 'teal', main: '#0D9488', soft: '#CCFBF1', label: 'Turquoise' },
  { key: 'red', main: '#DC2626', soft: '#FEE2E2', label: 'Rouge' },
];

/** Couleur d'un groupe : sa cle si connue, sinon une couleur stable selon son rang. */
export function classGroupColor(key: string | null | undefined, index = 0): ClassGroupColor {
  const found = key ? CLASS_GROUP_COLORS.find(c => c.key === key) : undefined;
  return found ?? CLASS_GROUP_COLORS[index % CLASS_GROUP_COLORS.length];
}

/** Cle de couleur proposee pour un nouveau groupe (la premiere non utilisee). */
export function nextClassGroupColorKey(usedKeys: (string | null | undefined)[]): string {
  const used = new Set(usedKeys.filter(Boolean));
  return (CLASS_GROUP_COLORS.find(c => !used.has(c.key)) ?? CLASS_GROUP_COLORS[used.size % CLASS_GROUP_COLORS.length]).key;
}
