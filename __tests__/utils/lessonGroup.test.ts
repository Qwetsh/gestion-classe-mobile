import { pickLessonGroup, lessonGroupWindow } from '../../utils/lessonGroup';

// Mardi 1/12 : 3°AP2 à 13h40, 3°AP1 à 14h40 (heure de Paris = UTC+1)
const lessons = [
  { label: '3°AP2', starts_at: '2026-12-01T12:40:00.000Z' },
  { label: '3°AP1', starts_at: '2026-12-01T13:40:00.000Z' },
  { label: '4D', starts_at: '2026-12-01T13:40:00.000Z' },
];
const links = [
  { label: '3°AP1', class_id: 'c3a', group_id: 'g1', ignored: false },
  { label: '3°AP2', class_id: 'c3a', group_id: 'g2', ignored: false },
  { label: '3A', class_id: 'c3a', group_id: null, ignored: false },
  { label: '4D', class_id: 'c4d', group_id: null, ignored: false },
];

describe('pickLessonGroup', () => {
  it('prend le demi-groupe du cours qui commence dans quelques minutes', () => {
    const at = new Date('2026-12-01T12:36:00.000Z');
    expect(pickLessonGroup(lessons, links, 'c3a', at)).toEqual({
      label: '3°AP2',
      groupId: 'g2',
      startsAt: '2026-12-01T12:40:00.000Z',
    });
  });

  it('enchaîne sur le groupe suivant à l’heure d’après', () => {
    const at = new Date('2026-12-01T13:38:00.000Z');
    expect(pickLessonGroup(lessons, links, 'c3a', at)?.groupId).toBe('g1');
  });

  it('renvoie un groupe null pour un cours en classe entière', () => {
    const at = new Date('2026-12-01T13:42:00.000Z');
    expect(pickLessonGroup(lessons, links, 'c4d', at)).toEqual({
      label: '4D',
      groupId: null,
      startsAt: '2026-12-01T13:40:00.000Z',
    });
  });

  it('ne trouve rien hors de la fenêtre ou pour une autre classe', () => {
    expect(pickLessonGroup(lessons, links, 'c3a', new Date('2026-12-01T09:00:00.000Z'))).toBeNull();
    expect(pickLessonGroup(lessons, links, 'c5e', new Date('2026-12-01T12:40:00.000Z'))).toBeNull();
  });

  it('ignore un libellé non relié ou marqué « pas une de mes classes »', () => {
    const at = new Date('2026-12-01T12:40:00.000Z');
    expect(pickLessonGroup(lessons, [], 'c3a', at)).toBeNull();
    expect(
      pickLessonGroup(lessons, [{ ...links[1], ignored: true }], 'c3a', at)
    ).toBeNull();
  });

  it('oublie un groupe qui n’existe plus dans la classe', () => {
    const at = new Date('2026-12-01T12:40:00.000Z');
    expect(pickLessonGroup(lessons, links, 'c3a', at, ['g1'])?.groupId).toBeNull();
    expect(pickLessonGroup(lessons, links, 'c3a', at, ['g1', 'g2'])?.groupId).toBe('g2');
  });
});

describe('lessonGroupWindow', () => {
  it('couvre 50 min avant et 30 min après', () => {
    const w = lessonGroupWindow(new Date('2026-12-01T12:00:00.000Z'));
    expect(w).toEqual({ from: '2026-12-01T11:10:00.000Z', to: '2026-12-01T12:30:00.000Z' });
  });
});
