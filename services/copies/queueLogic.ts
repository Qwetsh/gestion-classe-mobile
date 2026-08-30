/**
 * Logique pure de la file d'upload offline des copies — aucun I/O (testable).
 *
 * Garantie projet : "ne jamais perdre une copie scannée" (NFR13 / offline).
 * Une copie capturée hors-ligne est persistée + mise en file ; elle est uploadée
 * a la reconnexion. Ce module ne gere QUE le raisonnement sur la file (pas le disque).
 */

export interface PendingUpload {
  id: string;
  userId: string;
  assessmentId: string;
  studentId: string;
  pageOrder: number;
  localPath: string; // copie persistante dans documentDirectory (pas le cache camera)
  createdAt: string;
}

/**
 * Prochain numero de page en tenant compte des pages serveur ET des pages en attente.
 * Evite les collisions de page_order quand on scanne plusieurs pages hors-ligne.
 */
export function computeNextPageOrder(
  serverOrders: number[],
  pendingOrders: number[]
): number {
  const all = [...serverOrders, ...pendingOrders];
  return all.length > 0 ? Math.max(...all) + 1 : 1;
}

/**
 * Nombre de pages en attente par eleve, pour une evaluation donnee.
 */
export function countPendingByStudent(
  items: PendingUpload[],
  assessmentId: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const it of items) {
    if (it.assessmentId !== assessmentId) continue;
    counts[it.studentId] = (counts[it.studentId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Numeros de page en attente pour un eleve precis (utile pour computeNextPageOrder).
 */
export function pendingOrdersFor(
  items: PendingUpload[],
  assessmentId: string,
  studentId: string
): number[] {
  return items
    .filter((i) => i.assessmentId === assessmentId && i.studentId === studentId)
    .map((i) => i.pageOrder);
}
