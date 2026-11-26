import {
  groupSizes,
  keepPlacedStudents,
  studentsInScope,
  withStudentAt,
  withoutStudent,
} from '../../utils/planScope';

const students = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const members = [
  { group_id: 'g1', student_id: 'a' },
  { group_id: 'g1', student_id: 'c' },
  { group_id: 'g2', student_id: 'b' },
];

describe('studentsInScope', () => {
  it('rend toute la classe quand aucun groupe n’est choisi', () => {
    expect(studentsInScope(students, members, null).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('rend les membres du groupe, dans l’ordre de la classe', () => {
    expect(studentsInScope(students, members, 'g1').map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('ignore un membre qui n’est plus dans la classe, et un groupe inconnu', () => {
    expect(studentsInScope(students, [...members, { group_id: 'g2', student_id: 'parti' }], 'g2').map((s) => s.id)).toEqual(['b']);
    expect(studentsInScope(students, members, 'g9')).toEqual([]);
  });
});

describe('keepPlacedStudents', () => {
  it('garde les places des élèves donnés et vide les autres', () => {
    expect(keepPlacedStudents({ '0-0': 'a', '0-1': 'b', '1-0': 'c' }, [{ id: 'a' }, { id: 'c' }])).toEqual({ '0-0': 'a', '1-0': 'c' });
  });

  it('accepte un plan absent', () => {
    expect(keepPlacedStudents(null, students)).toEqual({});
  });
});

describe('withStudentAt / withoutStudent', () => {
  it('déplace un élève déjà placé sans le dupliquer', () => {
    expect(withStudentAt({ '0-0': 'a', '0-1': 'b' }, 'a', 2, 3)).toEqual({ '0-1': 'b', '2-3': 'a' });
  });

  it('remplace l’occupant d’une case libérée', () => {
    expect(withStudentAt({ '0-0': 'parti' }, 'a', 0, 0)).toEqual({ '0-0': 'a' });
  });

  it('retire un élève sans toucher au plan reçu', () => {
    const positions = { '0-0': 'a', '0-1': 'b' };
    expect(withoutStudent(positions, 'a')).toEqual({ '0-1': 'b' });
    expect(positions).toEqual({ '0-0': 'a', '0-1': 'b' });
  });
});

describe('groupSizes', () => {
  it('compte les membres par groupe', () => {
    expect(groupSizes(members, students)).toEqual({ g1: 2, g2: 1 });
  });

  it('ne compte pas un membre parti dans une autre classe', () => {
    expect(groupSizes([...members, { group_id: 'g1', student_id: 'parti' }], students)).toEqual({ g1: 2, g2: 1 });
  });
});
