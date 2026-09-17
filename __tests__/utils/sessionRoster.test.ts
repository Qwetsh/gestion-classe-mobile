import {
  resolveSessionRoster,
  nextGroupForClass,
  sortClassGroups,
  autoSplit,
} from '../../utils/sessionRoster';

const s = (id: string, pseudo = id) => ({ id, pseudo });
const classStudents = [s('a'), s('b'), s('c'), s('d')];

describe('resolveSessionRoster', () => {
  it('classe entiere : tous les eleves, plan de classe filtre', () => {
    const r = resolveSessionRoster({
      classStudents,
      groupId: null,
      classPlanPositions: { '0,0': 'a', '0,1': 'b', '1,0': 'zombie' },
    });
    expect(r.students.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.positions).toEqual({ '0,0': 'a', '0,1': 'b' }); // id inconnu ecarte
    expect(r.planSource).toBe('class-plan');
  });

  it('en groupe : seuls les membres, plan de groupe prioritaire', () => {
    const r = resolveSessionRoster({
      classStudents,
      groupId: 'g1',
      memberIds: ['a', 'c'],
      groupPlanPositions: { '2,2': 'a', '2,3': 'c', '0,0': 'b' }, // b perime (transvase)
      classPlanPositions: { '0,0': 'a', '0,1': 'b' },
    });
    expect(r.students.map(x => x.id)).toEqual(['a', 'c']);
    expect(r.positions).toEqual({ '2,2': 'a', '2,3': 'c' });
    expect(r.planSource).toBe('group-plan');
  });

  it('en groupe sans plan de groupe : repli sur le plan de classe filtre aux membres', () => {
    const r = resolveSessionRoster({
      classStudents,
      groupId: 'g1',
      memberIds: new Set(['a', 'c']),
      groupPlanPositions: {}, // vide = comme absent
      classPlanPositions: { '0,0': 'a', '0,1': 'b', '0,2': 'c' },
    });
    expect(r.positions).toEqual({ '0,0': 'a', '0,2': 'c' });
    expect(r.planSource).toBe('class-plan');
  });

  it('en groupe sans aucun plan : liste pleine, grille vide', () => {
    const r = resolveSessionRoster({ classStudents, groupId: 'g1', memberIds: ['d'] });
    expect(r.students.map(x => x.id)).toEqual(['d']);
    expect(r.positions).toEqual({});
    expect(r.planSource).toBe('none');
  });

  it('membre non place reste dans la liste', () => {
    const r = resolveSessionRoster({
      classStudents,
      groupId: 'g1',
      memberIds: ['a', 'b'],
      classPlanPositions: { '0,0': 'a' },
    });
    expect(r.students.map(x => x.id)).toEqual(['a', 'b']);
    expect(r.positions).toEqual({ '0,0': 'a' });
  });

  it('les ids de membres qui ne sont plus dans la classe sont ignores', () => {
    const r = resolveSessionRoster({ classStudents, groupId: 'g1', memberIds: ['a', 'parti'] });
    expect(r.students.map(x => x.id)).toEqual(['a']);
  });
});

const groups = [
  { id: 'g2', name: 'Groupe 2', sort_order: 1 },
  { id: 'g1', name: 'Groupe 1', sort_order: 0 },
];

describe('sortClassGroups', () => {
  it('trie par sort_order puis nom', () => {
    expect(sortClassGroups(groups).map(g => g.id)).toEqual(['g1', 'g2']);
    const tie = [
      { id: 'b', name: 'Beta', sort_order: 0 },
      { id: 'a', name: 'Alpha', sort_order: 0 },
    ];
    expect(sortClassGroups(tie).map(g => g.id)).toEqual(['a', 'b']);
  });
});

describe('nextGroupForClass', () => {
  it('alterne G1 -> G2 -> G1', () => {
    expect(nextGroupForClass(groups, 'g1')).toBe('g2');
    expect(nextGroupForClass(groups, 'g2')).toBe('g1');
  });

  it('propose la classe entiere sans seance en groupe', () => {
    expect(nextGroupForClass(groups, null)).toBeNull();
  });

  it('propose la classe entiere si le dernier groupe a ete supprime', () => {
    expect(nextGroupForClass(groups, 'disparu')).toBeNull();
  });

  it('classe sans groupe : toujours null', () => {
    expect(nextGroupForClass([], 'g1')).toBeNull();
  });

  it('avec trois groupes, boucle sur le dernier', () => {
    const three = [...groups, { id: 'g3', name: 'Groupe 3', sort_order: 2 }];
    expect(nextGroupForClass(three, 'g3')).toBe('g1');
  });
});

describe('autoSplit', () => {
  const eleves = [s('1', 'Zoe'), s('2', 'Amina'), s('3', 'Lucas'), s('4', 'Bilal'), s('5', 'Chloe')];

  it('alphabetique : tranches consecutives, le reste aux premiers groupes', () => {
    // ordre : Amina(2) Bilal(4) Chloe(5) Lucas(3) Zoe(1)
    expect(autoSplit(eleves, 2, 'alphabetical')).toEqual([['2', '4', '5'], ['3', '1']]);
  });

  it('alterne : 1 sur 2', () => {
    expect(autoSplit(eleves, 2, 'alternate')).toEqual([['2', '5', '1'], ['4', '3']]);
  });

  it('aleatoire : effectifs equilibres, tous les eleves places une fois', () => {
    let seed = 0.42;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const buckets = autoSplit(eleves, 2, 'random', rng);
    expect(buckets.map(b => b.length).sort()).toEqual([2, 3]);
    expect(buckets.flat().sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('liste vide : n groupes vides', () => {
    expect(autoSplit([], 3, 'alphabetical')).toEqual([[], [], []]);
  });
});
