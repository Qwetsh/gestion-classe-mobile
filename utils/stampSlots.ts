/** Nombre d'emplacements sur une carte a tampons. */
export const CARD_SLOTS = 10;

/**
 * Premier emplacement libre (1..max) sur une carte.
 * Retourne null si la carte est pleine.
 */
export function firstFreeSlot(used: Iterable<number>, max: number = CARD_SLOTS): number | null {
  const taken = new Set(used);
  for (let slot = 1; slot <= max; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}
