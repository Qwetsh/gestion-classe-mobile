/**
 * School period constants
 */

export type Period = 'T1' | 'T2' | 'T3' | 'year';

/**
 * Short labels for period chips/filters
 */
export const PERIOD_LABELS_SHORT: Record<Period, string> = {
  T1: 'T1',
  T2: 'T2',
  T3: 'T3',
  year: 'Annee',
};

/**
 * Full labels for period display
 */
export const PERIOD_LABELS_FULL: Record<Period, string> = {
  T1: 'Trimestre 1',
  T2: 'Trimestre 2',
  T3: 'Trimestre 3',
  year: 'Annee complete',
};
