/**
 * Moyenne d'un élève — même règle que `studentAverage` du carnet web
 * (gestion-classe-web/src/lib/gradeStats.ts). Module pur : ni base, ni réseau.
 *
 * Les deux doivent rester d'accord : la fiche Réunion parents annonce une moyenne que
 * le parent retrouve dans l'espace élève et sur le bulletin.
 */

/** Une note qui compte dans la moyenne (statut exclu et « hors moyenne » déjà écartés). */
export interface AverageItem {
  /** Note /20. */
  value: number;
  coef: number;
  /**
   * Migration 093 (`written_assessments.only_if_raises_average`) : la note n'est retenue
   * que si elle fait monter la moyenne de l'élève.
   */
  onlyIfRaises?: boolean;
}

/** Moyenne pondérée. Un coefficient nul ou négatif revient à ne pas compter la note. */
export function weightedAvg(items: readonly { value: number; coef: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const it of items) {
    if (it.coef <= 0) continue;
    sum += it.value * it.coef;
    w += it.coef;
  }
  return w > 0 ? sum / w : null;
}

/**
 * Moyenne d'un élève sur une période.
 *
 * Les notes ordinaires forment la moyenne de base. Les notes « seulement si elle monte »
 * sont essayées de la meilleure à la moins bonne et gardées tant qu'elles dépassent
 * strictement la moyenne déjà obtenue : c'est la plus haute moyenne possible, quel que
 * soit l'ordre des évaluations. Sans aucune autre note, la meilleure est gardée.
 */
export function studentAverage(items: readonly AverageItem[]): number | null {
  const kept: AverageItem[] = [];
  const optional: AverageItem[] = [];
  for (const it of items) {
    if (it.onlyIfRaises) optional.push(it);
    else kept.push(it);
  }
  let average = weightedAvg(kept);
  optional.sort((a, b) => b.value - a.value);
  for (const it of optional) {
    if (it.coef <= 0) continue;
    // Triées de la meilleure à la moins bonne : dès qu'une note ne monte plus la moyenne,
    // aucune des suivantes ne le fera.
    if (average !== null && it.value <= average) break;
    kept.push(it);
    average = weightedAvg(kept);
  }
  return average;
}
