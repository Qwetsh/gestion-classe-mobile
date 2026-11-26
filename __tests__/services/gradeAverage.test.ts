/**
 * Moyenne d'un élève sur la fiche Réunion parents.
 *
 * La règle doit rester celle du carnet web (gestion-classe-web/src/lib/gradeStats.ts,
 * `studentAverage`) : une moyenne qui diffère entre le téléphone et le bulletin se
 * remarque devant un parent. Les cas ci-dessous reprennent ceux du web.
 */

import { studentAverage, weightedAvg } from '../../services/gradeAverage';

const normal = (value: number, coef = 1) => ({ value, coef });
const optional = (value: number, coef = 1) => ({ value, coef, onlyIfRaises: true });

describe('weightedAvg', () => {
  it('pondère par les coefficients', () => {
    expect(weightedAvg([normal(10, 3), normal(20, 1)])).toBeCloseTo(12.5, 10);
  });

  it('ignore les coefficients nuls ou négatifs', () => {
    expect(weightedAvg([normal(10, 1), normal(0, 0)])).toBe(10);
    expect(weightedAvg([normal(10, 0)])).toBeNull();
    expect(weightedAvg([])).toBeNull();
  });
});

describe('studentAverage — notes ordinaires', () => {
  it('vaut la moyenne pondérée quand aucune note n’est facultative', () => {
    expect(studentAverage([normal(10, 3), normal(20, 1)])).toBeCloseTo(12.5, 10);
  });

  it('rend null si rien ne compte', () => {
    expect(studentAverage([])).toBeNull();
    expect(studentAverage([normal(12, 0)])).toBeNull();
  });
});

describe('studentAverage — note « seulement si elle monte la moyenne »', () => {
  it('garde la note qui dépasse la moyenne', () => {
    expect(studentAverage([normal(10), optional(16)])).toBe(13);
  });

  it('ignore la note qui ferait baisser la moyenne', () => {
    expect(studentAverage([normal(14), optional(8)])).toBe(14);
  });

  it('ignore la note égale à la moyenne (dépassement strict)', () => {
    expect(studentAverage([normal(12), optional(12, 5)])).toBe(12);
  });

  it('tient compte du coefficient de la note gardée', () => {
    expect(studentAverage([normal(10, 1), optional(16, 3)])).toBeCloseTo(14.5, 10);
  });

  it('essaie les notes de la meilleure à la moins bonne, quel que soit leur ordre', () => {
    // Base 10. 18 monte la moyenne à 14 ; 13 ne dépasse plus 14 : écartée, et 6 avec elle.
    const grades = [optional(6), optional(13), normal(10), optional(18)];
    expect(studentAverage(grades)).toBe(14);
    expect(studentAverage([...grades].reverse())).toBe(14);
  });

  it('garde plusieurs notes tant que chacune dépasse la moyenne courante', () => {
    // Base 8. 18 → 13 ; 15 > 13 → (8 + 18 + 15) / 3.
    expect(studentAverage([normal(8), optional(15), optional(18)])).toBeCloseTo(41 / 3, 10);
  });

  it('sans aucune autre note, garde seulement la meilleure', () => {
    expect(studentAverage([optional(9), optional(15)])).toBe(15);
    expect(studentAverage([optional(7)])).toBe(7);
  });

  it('ignore une note facultative de coefficient nul, sans arrêter l’essai des suivantes', () => {
    expect(studentAverage([normal(10), optional(20, 0), optional(16)])).toBe(13);
    expect(studentAverage([optional(20, 0)])).toBeNull();
  });

  it('ne modifie pas la liste reçue', () => {
    const grades = [optional(6), normal(10), optional(18)];
    const copy = grades.map((g) => ({ ...g }));
    studentAverage(grades);
    expect(grades).toEqual(copy);
  });
});
