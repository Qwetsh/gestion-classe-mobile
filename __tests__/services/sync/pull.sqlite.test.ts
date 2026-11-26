/**
 * Téléchargement (serveur -> téléphone) : `pullFromServer`, sur un vrai SQLite et un faux serveur
 * qui applique filtres, tri, limite et plafond de 1 000 lignes par réponse.
 *
 * Le téléchargement supprime du téléphone ce qui a disparu du serveur. Tout l'enjeu est qu'il ne
 * supprime QUE cela : ni une ligne absente d'une réponse tronquée ou en erreur, ni une ligne
 * locale pas encore envoyée, ni les lignes enfants d'une ligne simplement mise à jour.
 */
jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
jest.mock('../../../services/photos/tpPhotos', () => ({ uploadTpPhotoFile: jest.fn(async () => true) }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

import { executeSql } from '../../../services/database/client';
import { createEvent, deleteEvent } from '../../../services/database/eventRepository';
import { deleteSessionGroup, setGroupGrade } from '../../../services/database/groupSessionRepository';
import { deleteSession } from '../../../services/database/sessionRepository';
import { deleteStamp } from '../../../services/database/stampRepository';
import { pullFromServer, pullStudentStamps, syncAll } from '../../../services/sync/syncService';
import {
  OTHER_USER,
  USER,
  advanceClock,
  fakePseudo,
  foreignKeyViolations,
  insertLocal,
  localCount,
  localIds,
  localRow,
  numberedId,
  seedServerClassroom,
  serverClass,
  serverClassGroup,
  serverEvent,
  serverRoom,
  serverSession,
  serverStamp,
  serverStampCard,
  serverStudent,
  setOnline,
  useSyncTestEnvironment,
} from '../../helpers/syncHarness';

const server = useSyncTestEnvironment();

/** Télécharge, puis avance l'horloge : la synchro suivante a lieu « plus tard ». */
async function pull() {
  const result = await pullFromServer(USER);
  advanceClock();
  return result;
}

function manyStudents(count: number, classId = 'classe-1') {
  return Array.from({ length: count }, (_, i) => serverStudent(numberedId('eleve', i), classId, fakePseudo(i)));
}

describe('premier téléchargement', () => {
  it('recopie la classe, ses élèves, sa salle, la séance et ses événements', async () => {
    seedServerClassroom(server);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ classes: 1, students: 2, rooms: 1, sessions: 1, events: 1 });
    expect(await localRow('classes', 'classe-1')).toMatchObject({ name: '5A', user_id: USER });
    expect(await localRow('students', 'eleve-1')).toMatchObject({ pseudo: 'Lina Bo', class_id: 'classe-1' });
    expect(await localRow('events', 'evt-1')).toMatchObject({ session_id: 'seance-1', student_id: 'eleve-1' });
    // Tout ce qui vient du serveur est marqué « déjà envoyé » : rien ne repart au prochain envoi.
    for (const table of ['classes', 'students', 'rooms', 'sessions', 'events']) {
      expect(await localCount(table, 'synced_at IS NULL')).toBe(0);
    }
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('reprend les aménagements (PAP, PPRE, PAI) et un élève sans classe', async () => {
    server.seed('classes', [serverClass('classe-1', '5A')]);
    server.seed('students', [
      serverStudent('eleve-1', 'classe-1', 'Lina Bo', { has_pap: true }),
      serverStudent('eleve-2', null, 'Noé Ma', { has_pai: true }),
    ]);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('students', 'eleve-1')).toMatchObject({ has_pap: 1, has_ppre: 0, has_pai: 0 });
    expect(await localRow('students', 'eleve-2')).toMatchObject({ class_id: null, has_pai: 1 });
  });

  it('ne rejoue pas une séance restée ouverte sur le serveur : elle arrive terminée', async () => {
    seedServerClassroom(server);
    server.patch('sessions', 'seance-1', { ended_at: null });

    await pull();

    expect((await localRow('sessions', 'seance-1'))?.ended_at).not.toBeNull();
  });
});

describe('plus de 1 000 lignes', () => {
  it('2 300 élèves arrivent en entier, page après page', async () => {
    server.seed('classes', [serverClass('classe-1', '5A')]);
    server.seed('students', manyStudents(2300));

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(result.students).toBe(2300);
    expect(await localCount('students')).toBe(2300);
    // Trois pages, chacune demandée avec une limite, la suivante reprenant après le dernier id reçu.
    const pages = server.requestsFor('students', 'select');
    expect(pages.map((p) => p.returned)).toEqual([1000, 1000, 300]);
    expect(pages.map((p) => p.filters.find((f) => f.kind === 'gt')?.value)).toEqual([
      undefined, numberedId('eleve', 999), numberedId('eleve', 1999),
    ]);
  });

  it('un nouveau téléchargement ne supprime aucun élève au-delà de la première page, ni ce qui lui est rattaché', async () => {
    server.seed('classes', [serverClass('classe-1', '5A')]);
    server.seed('rooms', [serverRoom('salle-1', 'Labo 1')]);
    server.seed('students', manyStudents(2300));
    await pull();
    // Un élève de la troisième page a une séance en cours, une participation et un tampon,
    // rien de tout cela n'étant encore parti.
    const far = numberedId('eleve', 2100);
    await insertLocal('sessions', { id: 'seance-locale', user_id: USER, class_id: 'classe-1', room_id: 'salle-1' });
    await createEvent('seance-locale', far, 'participation');
    await insertLocal('stamp_cards', { id: 'carte-locale', student_id: far, user_id: USER, card_number: 1 });
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-locale', student_id: far, user_id: USER, slot_number: 1 });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localCount('students')).toBe(2300);
    expect(await localRow('students', far)).not.toBeNull();
    expect(await localCount('events', 'student_id = ?', [far])).toBe(1);
    expect(await localIds('stamps')).toEqual(['tampon-local']);
  });

  it('1 500 événements d’une même séance arrivent en entier', async () => {
    seedServerClassroom(server);
    server.seed('events', Array.from({ length: 1499 }, (_, i) => serverEvent(numberedId('evt', i), 'seance-1', i % 2 ? 'eleve-1' : 'eleve-2')));

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(result.events).toBe(1500);
    expect(await localCount('events')).toBe(1500);
  });

  it('les événements de 250 séances sont demandés par paquets de 100 séances au plus, et arrivent tous', async () => {
    seedServerClassroom(server);
    server.seed('sessions', Array.from({ length: 249 }, (_, i) => serverSession(numberedId('seance', i), 'classe-1', 'salle-1')));
    server.seed('events', Array.from({ length: 249 }, (_, i) => [
      serverEvent(numberedId('evt-a', i), numberedId('seance', i), 'eleve-1'),
      serverEvent(numberedId('evt-b', i), numberedId('seance', i), 'eleve-2', { type: 'bavardage' }),
    ]).flat());
    // Le serveur refuse une liste d'identifiants plus longue (adresse trop longue).
    server.maxInValues = 100;

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localCount('sessions')).toBe(250);
    expect(await localCount('events')).toBe(499);
    const lists = server.requestsFor('events', 'select').map((r) => (r.filters.find((f) => f.kind === 'in')?.value as unknown[]).length);
    expect(lists).toEqual([100, 100, 50]);
  });
});

describe('ligne supprimée sur le serveur', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1), serverStamp('tampon-2', 'carte-1', 'eleve-1', 2)]);
    server.seed('class_groups', [serverClassGroup('groupe-1', 'classe-1', 'Groupe A')]);
    server.seed('class_group_members', [{ id: 'membre-1', group_id: 'groupe-1', student_id: 'eleve-1', created_at: '2026-09-01T07:00:00.000Z' }]);
    await pull();
  });

  it('une classe supprimée disparaît du téléphone avec ses élèves, séances, événements et tampons', async () => {
    server.remove('classes', 'classe-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    for (const table of ['classes', 'students', 'sessions', 'events', 'stamp_cards', 'stamps', 'class_groups', 'class_group_members']) {
      expect(await localCount(table)).toBe(0);
    }
    expect(await localCount('rooms')).toBe(1);
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('un élève supprimé disparaît avec ses événements, sa carte et ses tampons ; les autres restent', async () => {
    server.seed('events', [serverEvent('evt-2', 'seance-1', 'eleve-2')]);
    await pull();
    server.remove('students', 'eleve-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('students')).toEqual(['eleve-2']);
    expect(await localIds('events')).toEqual(['evt-2']);
    expect(await localCount('stamp_cards')).toBe(0);
    expect(await localCount('stamps')).toBe(0);
    expect(await localCount('class_group_members')).toBe(0);
    expect(await localIds('sessions')).toEqual(['seance-1']);
  });

  it('un tampon supprimé disparaît, les autres tampons de la carte restent', async () => {
    server.remove('stamps', 'tampon-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('stamps')).toEqual(['tampon-2']);
    expect(await localIds('stamp_cards')).toEqual(['carte-1']);
  });

  it('un groupe de classe supprimé disparaît avec ses membres ; la séance qui s’y tenait reste, en classe entière', async () => {
    await executeSql('UPDATE sessions SET group_id = ? WHERE id = ?', ['groupe-1', 'seance-1']);
    server.remove('class_groups', 'groupe-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localCount('class_groups')).toBe(0);
    expect(await localCount('class_group_members')).toBe(0);
    expect(await localRow('sessions', 'seance-1')).toMatchObject({ group_id: null });
    expect(await localIds('events')).toEqual(['evt-1']);
  });

  it('une salle supprimée, jamais utilisée en séance, disparaît avec son plan de classe', async () => {
    server.seed('rooms', [serverRoom('salle-2', 'Salle 12')]);
    server.seed('class_room_plans', [{
      id: 'plan-2', class_id: 'classe-1', room_id: 'salle-2', positions: { 'eleve-1': '0-0' },
      created_at: '2026-09-01T07:00:00.000Z', updated_at: null,
    }]);
    await pull();
    expect(await localIds('class_room_plans')).toEqual(['plan-2']);
    server.remove('rooms', 'salle-2');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('rooms')).toEqual(['salle-1']);
    expect(await localCount('class_room_plans')).toBe(0);
  });

  // BOGUE (syncService.ts, étape « 3. Pull rooms », `DELETE FROM rooms WHERE id = ?`).
  // Supprimer sur le web une salle qui a servi à une séance supprime aussi, sur le serveur, ses
  // séances (ON DELETE CASCADE). Sur le téléphone, le téléchargement ne retire que les plans de
  // classe avant la salle : les séances locales la référencent encore, SQLite refuse la
  // suppression (« FOREIGN KEY constraint failed ») et l'erreur interrompt tout le reste du
  // téléchargement. Comme la salle reste en local, cela recommence à chaque synchro : groupes,
  // plans, séances, événements, modèles de TP et tampons venus du web n'arrivent plus jamais.
  it.failing('une salle supprimée qui a servi à une séance n’empêche pas le reste du téléchargement', async () => {
    server.remove('rooms', 'salle-1');
    server.seed('stamps', [serverStamp('tampon-3', 'carte-1', 'eleve-1', 3)]);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('stamps')).toEqual(['tampon-1', 'tampon-2', 'tampon-3']);
  });

  // CONSTAT (syncService.ts, étapes 5 et 6 du téléchargement). Aucune règle de suppression pour
  // les séances ni pour les événements : le téléchargement ajoute ce qui manque, il ne retire
  // jamais rien. Une séance ou un événement supprimé depuis le site (pages Séances) reste donc
  // sur le téléphone, et continue d'y compter dans l'historique et les totaux de l'élève.
  it.failing('une séance supprimée sur le web disparaît du téléphone avec ses événements', async () => {
    server.remove('sessions', 'seance-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('sessions')).toEqual([]);
    expect(await localIds('events')).toEqual([]);
  });

  it.failing('un événement supprimé sur le web disparaît du téléphone', async () => {
    server.remove('events', 'evt-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('events')).toEqual([]);
  });

  it('les données d’un autre compte présentes sur le téléphone ne sont pas touchées', async () => {
    await insertLocal('classes', { id: 'classe-autre', user_id: OTHER_USER, name: '4B', synced_at: '2026-09-01T07:00:00.000Z' });
    await insertLocal('students', { id: 'eleve-autre', user_id: OTHER_USER, pseudo: 'Iris Ka', class_id: 'classe-autre', synced_at: '2026-09-01T07:00:00.000Z' });
    await insertLocal('rooms', { id: 'salle-autre', user_id: OTHER_USER, name: 'Salle 3', synced_at: '2026-09-01T07:00:00.000Z' });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('classes', 'classe-autre')).not.toBeNull();
    expect(await localRow('students', 'eleve-autre')).not.toBeNull();
    expect(await localRow('rooms', 'salle-autre')).not.toBeNull();
  });
});

describe('ligne locale pas encore envoyée', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1)]);
    await pull();
  });

  it('classe, élève, salle, séance et événement créés sur le téléphone survivent au téléchargement', async () => {
    await insertLocal('classes', { id: 'classe-locale', user_id: USER, name: '4C' });
    await insertLocal('students', { id: 'eleve-local', user_id: USER, pseudo: 'Tom Le', class_id: 'classe-locale' });
    await insertLocal('rooms', { id: 'salle-locale', user_id: USER, name: 'Salle 7' });
    await insertLocal('sessions', { id: 'seance-locale', user_id: USER, class_id: 'classe-locale', room_id: 'salle-locale' });
    await createEvent('seance-locale', 'eleve-local', 'participation');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('classes', 'classe-locale')).toMatchObject({ synced_at: null });
    expect(await localRow('students', 'eleve-local')).toMatchObject({ synced_at: null });
    expect(await localRow('rooms', 'salle-locale')).toMatchObject({ synced_at: null });
    expect(await localRow('sessions', 'seance-locale')).toMatchObject({ synced_at: null, ended_at: null });
    expect(await localCount('events', 'session_id = ? AND synced_at IS NULL', ['seance-locale'])).toBe(1);
  });

  it('un tampon posé hors ligne survit, même sur une carte que le serveur renvoie', async () => {
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-1', student_id: 'eleve-1', user_id: USER, slot_number: 2 });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('stamps')).toEqual(['tampon-1', 'tampon-local']);
    expect(await localRow('stamps', 'tampon-local')).toMatchObject({ slot_number: 2, synced_at: null });
  });

  it('un tampon posé hors ligne sur une case prise entre-temps depuis le web est décalé, pas perdu', async () => {
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-1', student_id: 'eleve-1', user_id: USER, slot_number: 2 });
    server.seed('stamps', [serverStamp('tampon-web', 'carte-1', 'eleve-1', 2)]);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('stamps', 'tampon-web')).toMatchObject({ slot_number: 2 });
    expect(await localRow('stamps', 'tampon-local')).toMatchObject({ slot_number: 3, synced_at: null });
  });

  it('une carte créée hors ligne prend l’identifiant de la carte créée entre-temps sur le serveur, tampons compris', async () => {
    await insertLocal('stamp_cards', { id: 'carte-locale', student_id: 'eleve-2', user_id: USER, card_number: 1 });
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-locale', student_id: 'eleve-2', user_id: USER, slot_number: 1 });
    server.seed('stamp_cards', [serverStampCard('carte-web', 'eleve-2')]);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('stamp_cards', 'student_id = ?', ['eleve-2'])).toEqual(['carte-web']);
    expect(await localRow('stamps', 'tampon-local')).toMatchObject({ card_id: 'carte-web', synced_at: null });
  });

  it('une carte disparue du serveur mais qui porte un tampon pas encore envoyé est gardée pour repartir', async () => {
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-1', student_id: 'eleve-1', user_id: USER, slot_number: 2 });
    server.remove('stamp_cards', 'carte-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('stamp_cards', 'carte-1')).toMatchObject({ synced_at: null });
    expect(await localRow('stamps', 'tampon-local')).not.toBeNull();
  });
});

describe('re-téléchargement d’une ligne parente : ses lignes enfants locales restent', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('class_groups', [serverClassGroup('groupe-1', 'classe-1', 'Groupe A')]);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1)]);
    await pull();
    // Travail fait sur le téléphone depuis, pas encore envoyé.
    await createEvent('seance-1', 'eleve-2', 'bavardage');
    await insertLocal('class_group_members', { id: 'membre-local', group_id: 'groupe-1', student_id: 'eleve-1' });
    await insertLocal('stamps', { id: 'tampon-local', card_id: 'carte-1', student_id: 'eleve-1', user_id: USER, slot_number: 2 });
  });

  async function expectLocalWorkIntact(): Promise<void> {
    expect(await localCount('events')).toBe(2);
    expect(await localCount('events', 'synced_at IS NULL')).toBe(1);
    expect(await localIds('class_group_members')).toEqual(['membre-local']);
    expect(await localIds('stamps')).toEqual(['tampon-1', 'tampon-local']);
    expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2']);
    expect(await localIds('sessions')).toEqual(['seance-1']);
    expect(await foreignKeyViolations()).toEqual([]);
  }

  it('sans aucun changement sur le serveur', async () => {
    const result = await pull();

    expect(result.errors).toEqual([]);
    await expectLocalWorkIntact();
  });

  it('classe renommée sur le web', async () => {
    server.patch('classes', 'classe-1', { name: '5A SVT' });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('classes', 'classe-1')).toMatchObject({ name: '5A SVT' });
    expect(await localIds('class_groups')).toEqual(['groupe-1']);
    await expectLocalWorkIntact();
  });

  it('élève modifié sur le web (pseudonyme, PAP)', async () => {
    server.patch('students', 'eleve-1', { pseudo: 'Lina Be', has_pap: true });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('students', 'eleve-1')).toMatchObject({ pseudo: 'Lina Be', has_pap: 1 });
    await expectLocalWorkIntact();
  });

  it('élève détaché de sa classe sur le web (passage d’année)', async () => {
    server.patch('students', 'eleve-2', { class_id: null });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('students', 'eleve-2')).toMatchObject({ class_id: null });
    await expectLocalWorkIntact();
  });

  it('carte de tampons terminée sur le web (bonus choisi par l’élève)', async () => {
    server.patch('stamp_cards', 'carte-1', { status: 'completed', completed_at: '2026-09-06T10:00:00.000Z' });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('stamp_cards', 'carte-1')).toMatchObject({ status: 'completed' });
    await expectLocalWorkIntact();
  });

  it('groupe de classe renommé sur le web', async () => {
    server.patch('class_groups', 'groupe-1', { name: 'Groupe 1', updated_at: '2026-09-06T10:00:00.000Z' });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('class_groups', 'groupe-1')).toMatchObject({ name: 'Groupe 1' });
    await expectLocalWorkIntact();
  });

  it('salle redimensionnée sur le web', async () => {
    server.patch('rooms', 'salle-1', { grid_rows: 8, disabled_cells: ['0-0'] });

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('rooms', 'salle-1')).toMatchObject({ grid_rows: 8, disabled_cells: '["0-0"]' });
    await expectLocalWorkIntact();
  });
});

describe('erreur pendant le téléchargement', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1)]);
    await pull();
  });

  it.each([
    ['classes', 'Classes'],
    ['students', 'Students'],
    ['rooms', 'Rooms'],
    ['class_groups', 'Groupes de classe'],
    ['sessions', 'Sessions'],
    ['events', 'Events'],
    ['stamp_categories', 'Stamp Categories'],
    ['stamp_cards', 'Stamp Cards'],
    ['stamps', 'Stamps'],
  ])('lecture de « %s » impossible : rien n’est supprimé en local et l’erreur est signalée', async (table, label) => {
    // Une lecture en erreur ne rend aucune ligne : la prendre pour « le serveur est vide »
    // effacerait toute la table du téléphone.
    server.failOn({ table, operation: 'select', message: 'coupure' });

    const result = await pull();

    expect(result.errors).toEqual([`${label}: coupure`]);
    expect(await localIds('classes')).toEqual(['classe-1']);
    expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2']);
    expect(await localIds('rooms')).toEqual(['salle-1']);
    expect(await localIds('sessions')).toEqual(['seance-1']);
    expect(await localIds('events')).toEqual(['evt-1']);
    expect(await localIds('stamp_cards')).toEqual(['carte-1']);
    expect(await localIds('stamps')).toEqual(['tampon-1']);
  });

  it('une lecture en erreur n’empêche pas de recevoir les autres tables', async () => {
    server.seed('students', [serverStudent('eleve-3', 'classe-1', 'Iris Ka')]);
    server.seed('stamps', [serverStamp('tampon-2', 'carte-1', 'eleve-1', 2)]);
    server.failOn({ table: 'classes', operation: 'select', message: 'coupure' });
    server.failOn({ table: 'rooms', operation: 'select', message: 'coupure' });

    const result = await pull();

    expect(result.errors).toEqual(['Classes: coupure', 'Rooms: coupure']);
    expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2', 'eleve-3']);
    expect(await localIds('stamps')).toEqual(['tampon-1', 'tampon-2']);
  });

  it('coupure à la deuxième page des élèves : aucun élève supprimé, aucun élève ajouté à moitié', async () => {
    server.seed('students', Array.from({ length: 2300 }, (_, i) => serverStudent(numberedId('eleve', i), 'classe-1', fakePseudo(i))));
    await pull();
    expect(await localCount('students')).toBe(2302);
    // Depuis : 500 élèves de plus sur le serveur, puis la coupure pendant la lecture.
    server.seed('students', Array.from({ length: 500 }, (_, i) => serverStudent(numberedId('eleve', 5000 + i), 'classe-1', fakePseudo(i))));
    server.failOn({ table: 'students', operation: 'select', message: 'coupure', after: 1 });

    const result = await pull();

    expect(result.errors).toEqual(['Students: coupure']);
    expect(await localCount('students')).toBe(2302);
  });

  it('lecture des cartes impossible : les tampons ne sont ni lus ni supprimés', async () => {
    server.remove('stamps', 'tampon-1');
    server.failOn({ table: 'stamp_cards', operation: 'select', message: 'coupure' });

    const result = await pull();

    expect(result.errors).toEqual(['Stamp Cards: coupure']);
    expect(server.requestsFor('stamps', 'select')).toHaveLength(1); // celle du tout premier téléchargement
    expect(await localIds('stamps')).toEqual(['tampon-1']);
  });

  it('après la panne, le téléchargement suivant remet le téléphone d’accord avec le serveur', async () => {
    server.remove('students', 'eleve-2');
    server.failOn({ table: 'students', operation: 'select', message: 'coupure', times: 1 });
    expect((await pull()).errors).toEqual(['Students: coupure']);
    expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2']);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('students')).toEqual(['eleve-1']);
  });
});

describe('suppression faite sur le téléphone, pas encore arrivée au serveur', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1)]);
    await pull();
  });

  /** Une synchro complète, dans l'ordre de l'app (stores/syncStore.ts) : télécharger, puis envoyer. */
  async function fullSync(): Promise<void> {
    await pull();
    await syncAll(USER);
    advanceClock();
  }

  it('un tampon retiré ne revient pas, puis sa suppression atteint le serveur', async () => {
    // Le serveur ne répond pas à la suppression immédiate : elle reste en attente.
    server.failOn({ table: 'stamps', operation: 'delete', message: 'coupure', times: 1 });
    await deleteStamp('tampon-1');
    expect(await localCount('pending_deletions')).toBe(1);

    await fullSync();

    expect(await localCount('stamps')).toBe(0);
    expect(server.ids('stamps')).toEqual([]);
    expect(await localCount('pending_deletions')).toBe(0);
  });

  // BOGUE (syncService.ts, étape « 6. Pull events from Supabase »). Contrairement aux tampons et
  // aux groupes de classe, les événements téléchargés ne sont pas comparés à `pending_deletions`.
  // Une participation ou un bavardage supprimé sur le téléphone sans réseau est donc réinséré par
  // le téléchargement qui ouvre la synchro suivante ; l'envoi qui suit propage la suppression au
  // serveur. Résultat : l'événement a disparu du serveur mais reste sur le téléphone, marqué
  // « envoyé », et plus rien ne viendra l'en retirer.
  it.failing('un événement supprimé sans réseau ne revient pas à la synchro suivante', async () => {
    setOnline(false);
    await deleteEvent('evt-1');
    setOnline(true);

    await fullSync();

    expect(server.ids('events')).toEqual([]);
    expect(await localIds('events')).toEqual([]);
  });

  // BOGUE (sessionRepository.ts, `deleteSession` ; syncService.ts, étape « 5. Pull sessions »).
  // Supprimer une séance depuis l'historique du téléphone (ou annuler la séance en cours) ne
  // supprime rien sur le serveur et ne laisse aucune trace dans `pending_deletions`. Si la séance
  // avait déjà été envoyée, le téléchargement suivant la recrée avec tous ses événements.
  it.failing('une séance supprimée depuis l’historique du téléphone ne revient pas, ni ses événements', async () => {
    await deleteSession('seance-1');

    await fullSync();

    expect(await localIds('sessions')).toEqual([]);
    expect(await localIds('events')).toEqual([]);
  });
});

describe('téléchargement des tampons d’un seul élève (ouverture de sa fiche)', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('stamp_cards', [serverStampCard('carte-1', 'eleve-1'), serverStampCard('carte-2', 'eleve-2')]);
    server.seed('stamps', [serverStamp('tampon-1', 'carte-1', 'eleve-1', 1), serverStamp('tampon-2', 'carte-2', 'eleve-2', 1)]);
    await pull();
  });

  it('reçoit le tampon donné depuis le web à cet élève', async () => {
    server.seed('stamps', [serverStamp('tampon-web', 'carte-1', 'eleve-1', 2)]);

    expect(await pullStudentStamps(USER, 'eleve-1')).toBe(true);

    expect(await localIds('stamps', 'student_id = ?', ['eleve-1'])).toEqual(['tampon-1', 'tampon-web']);
  });

  it('ne supprime pas les tampons des autres élèves, absents de cette réponse', async () => {
    server.remove('stamps', 'tampon-1');
    advanceClock();

    expect(await pullStudentStamps(USER, 'eleve-1')).toBe(true);

    expect(await localIds('stamps')).toEqual(['tampon-2']);
    expect(await localIds('stamp_cards')).toEqual(['carte-1', 'carte-2']);
  });
});

describe('TP en groupes', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    server.seed('tp_templates', [{ id: 'modele-1', user_id: USER, name: 'Antibiogramme', created_at: '2026-09-01T07:00:00.000Z', level: '3e', chapter: 'S2', activity: 'A3' }]);
    server.seed('tp_template_criteria', [{ id: 'mc-1', template_id: 'modele-1', label: 'Protocole suivi', max_points: 4, display_order: 0 }]);
    server.seed('group_sessions', [{
      id: 'tp-1', user_id: USER, class_id: 'classe-1', name: 'TP antibiogramme', status: 'completed',
      created_at: '2026-09-02T08:00:00.000Z', completed_at: '2026-09-02T08:55:00.000Z', linked_session_id: 'seance-1', template_id: 'modele-1',
    }]);
    server.seed('grading_criteria', [{ id: 'critere-1', session_id: 'tp-1', label: 'Protocole suivi', max_points: 4, display_order: 0 }]);
    server.seed('session_groups', [
      { id: 'ilot-1', session_id: 'tp-1', name: 'Îlot 1', conduct_malus: 0, position_x: 0.25, position_y: 0.5, comment: null, display_order: 0 },
      { id: 'ilot-2', session_id: 'tp-1', name: 'Îlot 2', conduct_malus: 0.5, position_x: null, position_y: null, comment: 'Bruyant', display_order: 1 },
    ]);
    server.seed('session_group_members', [
      { id: 'im-1', group_id: 'ilot-1', student_id: 'eleve-1' },
      { id: 'im-2', group_id: 'ilot-2', student_id: 'eleve-2' },
    ]);
    server.seed('group_grades', [{ id: 'note-1', group_id: 'ilot-1', criteria_id: 'critere-1', points_awarded: 3.5 }]);
    await pull();
  });

  it('un TP et son modèle arrivent avec critères, groupes, membres et notes', async () => {
    expect(await localRow('tp_templates', 'modele-1')).toMatchObject({ name: 'Antibiogramme', level: '3e' });
    expect(await localIds('tp_template_criteria')).toEqual(['mc-1']);
    expect(await localRow('group_sessions', 'tp-1')).toMatchObject({ status: 'completed', linked_session_id: 'seance-1', template_id: 'modele-1' });
    expect(await localRow('session_groups', 'ilot-2')).toMatchObject({ conduct_malus: 0.5, comment: 'Bruyant', display_order: 1 });
    expect(await localIds('session_group_members')).toEqual(['im-1', 'im-2']);
    expect(await localRow('group_grades', 'note-1')).toMatchObject({ points_awarded: 3.5 });
    for (const table of ['group_sessions', 'grading_criteria', 'session_groups', 'session_group_members', 'group_grades']) {
      expect(await localCount(table, 'synced_at IS NULL')).toBe(0);
    }
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('une note changée sur le téléphone, pas encore envoyée, n’est pas écrasée par celle du serveur', async () => {
    await setGroupGrade('ilot-1', 'critere-1', 2);

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localRow('group_grades', 'note-1')).toMatchObject({ points_awarded: 2, synced_at: null });
  });

  it('un groupe supprimé sur le téléphone ne revient pas, ni ses membres ni ses notes', async () => {
    setOnline(false);
    await deleteSessionGroup('ilot-1');

    const result = await pull();

    expect(result.errors).toEqual([]);
    expect(await localIds('session_groups')).toEqual(['ilot-2']);
    expect(await localIds('session_group_members')).toEqual(['im-2']);
    expect(await localCount('group_grades')).toBe(0);
  });
});
