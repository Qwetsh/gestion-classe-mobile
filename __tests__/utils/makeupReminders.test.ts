import {
  makeupRemindersFor,
  makeupSentence,
  sessionFitsMakeup,
  localDayKey,
  type PendingMakeupRow,
} from '../../utils/makeupReminders';

const row = (over: Partial<PendingMakeupRow>): PendingMakeupRow => ({
  assessment_id: 'eval-micro',
  assessment_name: 'Éval 1 – Micro-organismes',
  assessment_date: '2026-11-06',
  class_id: 'c3e',
  group_id: null,
  student_id: 's1',
  pseudo: 'Tom B.',
  student_group_ids: [],
  ...over,
});

describe('makeupRemindersFor', () => {
  const rows = [
    row({ student_id: 's1', pseudo: 'Tom B.' }),
    row({ student_id: 's2', pseudo: 'Léa M.' }),
    row({ assessment_id: 'eval-4c', class_id: 'c4c', student_id: 's3', pseudo: 'Noé P.' }),
  ];

  it('regroupe les absents de la classe par éval, triés', () => {
    const list = makeupRemindersFor(rows, 'c3e', new Date(2026, 10, 12, 14, 40));
    expect(list).toHaveLength(1);
    expect(list[0].students.map((s) => s.pseudo)).toEqual(['Léa M.', 'Tom B.']);
    expect(makeupSentence(list[0])).toBe("Faire reprendre l'éval Éval 1 – Micro-organismes à : Léa M., Tom B.");
  });

  it('rien le jour même de l’éval (c’est la séance de l’éval)', () => {
    expect(makeupRemindersFor(rows, 'c3e', new Date(2026, 10, 6, 15, 0))).toEqual([]);
  });

  it('reste affiché aux séances suivantes tant que rien n’est rattrapé', () => {
    expect(makeupRemindersFor(rows, 'c3e', new Date(2026, 10, 20, 10, 0))).toHaveLength(1);
  });

  it('trie plusieurs évals de la plus ancienne à la plus récente', () => {
    const list = makeupRemindersFor(
      [...rows, row({ assessment_id: 'eval-old', assessment_name: 'Éval 0', assessment_date: '2026-10-15', student_id: 's9' })],
      'c3e',
      new Date(2026, 10, 12)
    );
    expect(list.map((r) => r.assessmentName)).toEqual(['Éval 0', 'Éval 1 – Micro-organismes']);
  });
});

describe('sessionFitsMakeup', () => {
  it('séance en classe entière : tous les absents de la classe', () => {
    expect(sessionFitsMakeup('c3e', null, row({ student_group_ids: ['g1'] }))).toBe(true);
    expect(sessionFitsMakeup('c4c', null, row({}))).toBe(false);
  });

  it('séance en demi-groupe : les élèves du groupe, ou ceux rangés dans aucun', () => {
    expect(sessionFitsMakeup('c3e', 'g1', row({ student_group_ids: ['g1'] }))).toBe(true);
    expect(sessionFitsMakeup('c3e', 'g1', row({ student_group_ids: ['g2'] }))).toBe(false);
    expect(sessionFitsMakeup('c3e', 'g1', row({ student_group_ids: null }))).toBe(true);
  });

  it('éval de demi-groupe : seulement ce groupe', () => {
    expect(sessionFitsMakeup('c3e', 'g2', row({ group_id: 'g1' }))).toBe(false);
    expect(sessionFitsMakeup('c3e', 'g1', row({ group_id: 'g1' }))).toBe(true);
  });
});

describe('localDayKey', () => {
  it('jour local', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
