import {
  autoLayout,
  balancedGroups,
  groupPointRecipients,
  groupScore,
  isGroupFullyGraded,
  levelOfClassName,
  nextGroupName,
  sortTemplatesForClass,
  stepPoints,
  tpGroupColor,
  TP_GROUP_COLORS,
} from '../utils/tpGroups';

// Aléa déterministe pour les tests
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('nextGroupName', () => {
  it('prend le premier numéro libre', () => {
    expect(nextGroupName([])).toBe('G1');
    expect(nextGroupName(['G1', 'G2'])).toBe('G3');
    expect(nextGroupName(['G1', 'G3'])).toBe('G2');
    expect(nextGroupName(['g1'])).toBe('G2');
  });
});

describe('autoLayout', () => {
  it('range en deux colonnes, positions entre 0 et 1', () => {
    expect(autoLayout(0)).toEqual([]);
    expect(autoLayout(1)).toEqual([{ x: 0, y: 0 }]);
    const six = autoLayout(6);
    expect(six).toHaveLength(6);
    expect(six[0]).toEqual({ x: 0, y: 0 });
    expect(six[1]).toEqual({ x: 1, y: 0 });
    expect(six[5]).toEqual({ x: 1, y: 1 });
    for (const p of six) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

describe('balancedGroups', () => {
  it('équilibre les tailles', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `e${i}`);
    const groups = balancedGroups(ids, 4, seeded(3));
    expect(groups.map((g) => g.length).sort()).toEqual([3, 3, 4]);
    expect(groups.flat().sort()).toEqual([...ids].sort());
  });
  it('rien à répartir', () => {
    expect(balancedGroups([], 4)).toEqual([]);
    expect(balancedGroups(['a'], 0)).toEqual([]);
  });
});

describe('groupPointRecipients', () => {
  it('exclut absents et élèves sortis', () => {
    const absent = new Set(['b']);
    const out = new Set(['c']);
    expect(
      groupPointRecipients(['a', 'b', 'c', 'd'], (id) => absent.has(id), (id) => out.has(id))
    ).toEqual(['a', 'd']);
  });
});

describe('groupScore', () => {
  it('somme moins le malus, jamais négatif', () => {
    expect(groupScore([2, 1, 2, 0, 1], 1)).toBe(5);
    expect(groupScore([1], 3)).toBe(0);
    expect(groupScore([], 0)).toBe(0);
  });
});

describe('isGroupFullyGraded', () => {
  it('exige une note pour chaque critère', () => {
    expect(isGroupFullyGraded(['a', 'b'], ['a'])).toBe(false);
    expect(isGroupFullyGraded(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(isGroupFullyGraded([], [])).toBe(false);
  });
});

describe('stepPoints', () => {
  it('avance par demi-point et reste dans les bornes', () => {
    expect(stepPoints(1, 0.5, 3)).toBe(1.5);
    expect(stepPoints(3, 0.5, 3)).toBe(3);
    expect(stepPoints(0, -0.5, 3)).toBe(0);
  });
});

describe('tpGroupColor', () => {
  it('tourne dans la palette', () => {
    expect(tpGroupColor(0)).toBe(TP_GROUP_COLORS[0]);
    expect(tpGroupColor(TP_GROUP_COLORS.length)).toBe(TP_GROUP_COLORS[0]);
  });
});

describe('levelOfClassName / sortTemplatesForClass', () => {
  it('lit le niveau dans le nom de classe', () => {
    expect(levelOfClassName('3B')).toBe('3e');
    expect(levelOfClassName('4ème A')).toBe('4e');
    expect(levelOfClassName('Atelier')).toBeNull();
  });
  it('propose le TP suggéré puis ceux du niveau', () => {
    const t = [
      { id: '1', name: 'Groupage', level: '3e' },
      { id: '2', name: 'Antibiogramme', level: '3e' },
      { id: '3', name: 'Pouls', level: '5e' },
    ];
    const r = sortTemplatesForClass(t, '3e', '1');
    expect(r.suggested?.id).toBe('1');
    expect(r.sameLevel.map((x) => x.id)).toEqual(['2']);
    expect(r.others.map((x) => x.id)).toEqual(['3']);
  });
});
