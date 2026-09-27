import { pickLessonNote, lessonNoteWindow, type LessonNote } from '../../utils/lessonNotes';

const note = (over: Partial<LessonNote>): LessonNote => ({
  id: 'n',
  class_id: 'c1',
  group_id: null,
  starts_at: '2026-09-28T12:40:00.000Z',
  ends_at: '2026-09-28T13:40:00.000Z',
  label: '4D',
  content: 'Rendre les copies',
  done: false,
  ...over,
});

describe('pickLessonNote', () => {
  const at = new Date('2026-09-28T12:37:00.000Z'); // séance lancée 3 min avant le cours de 14h40 (Paris)

  it('retrouve la note du cours qui commence dans quelques minutes', () => {
    expect(pickLessonNote([note({})], 'c1', at)?.id).toBe('n');
  });

  it('retrouve la note d’un cours commencé il y a 20 minutes', () => {
    const late = new Date('2026-09-28T13:00:00.000Z');
    expect(pickLessonNote([note({})], 'c1', late)?.id).toBe('n');
  });

  it('ignore les notes vues, celles d’une autre classe et celles trop loin dans le temps', () => {
    expect(pickLessonNote([note({ done: true })], 'c1', at)).toBeNull();
    expect(pickLessonNote([note({ class_id: 'c2' })], 'c1', at)).toBeNull();
    expect(pickLessonNote([note({ starts_at: '2026-09-28T14:40:00.000Z' })], 'c1', at)).toBeNull();
    expect(pickLessonNote([note({ starts_at: '2026-09-28T11:40:00.000Z' })], 'c1', at)).toBeNull();
  });

  it('préfère le cours dont le début est le plus proche', () => {
    const notes = [
      note({ id: 'prev', starts_at: '2026-09-28T11:50:00.000Z' }),
      note({ id: 'next', starts_at: '2026-09-28T12:40:00.000Z' }),
    ];
    expect(pickLessonNote(notes, 'c1', at)?.id).toBe('next');
  });

  it('respecte le demi-groupe : note du groupe ou de la classe entière seulement', () => {
    const notes = [note({ id: 'g2', group_id: 'g2' }), note({ id: 'whole' })];
    expect(pickLessonNote(notes, 'c1', at, 'g1')?.id).toBe('whole');
    expect(pickLessonNote([note({ id: 'g1', group_id: 'g1' })], 'c1', at, 'g1')?.id).toBe('g1');
  });
});

describe('lessonNoteWindow', () => {
  it('encadre l’instant de 50 min avant à 30 min après', () => {
    const { from, to } = lessonNoteWindow(new Date('2026-09-28T12:00:00.000Z'));
    expect(from).toBe('2026-09-28T11:10:00.000Z');
    expect(to).toBe('2026-09-28T12:30:00.000Z');
  });
});
