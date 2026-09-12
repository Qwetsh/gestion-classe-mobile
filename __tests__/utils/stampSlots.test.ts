import { firstFreeSlot, CARD_SLOTS } from '../../utils/stampSlots';

describe('firstFreeSlot', () => {
  it('renvoie 1 sur une carte vide', () => {
    expect(firstFreeSlot([])).toBe(1);
  });

  it('remplit les trous avant d ajouter a la fin', () => {
    // slot 2 supprime : le prochain tampon doit reprendre le slot 2, pas le 5
    expect(firstFreeSlot([1, 3, 4])).toBe(2);
  });

  it('ajoute a la fin quand il n y a pas de trou', () => {
    expect(firstFreeSlot([1, 2, 3])).toBe(4);
  });

  it('renvoie null quand la carte est pleine', () => {
    const full = Array.from({ length: CARD_SLOTS }, (_, i) => i + 1);
    expect(firstFreeSlot(full)).toBeNull();
  });

  it('ignore les slots hors carte deja presents en local', () => {
    // un tampon decale au-dela de 10 par le pull ne bloque pas les slots valides
    expect(firstFreeSlot([1, 2, 11])).toBe(3);
  });
});
