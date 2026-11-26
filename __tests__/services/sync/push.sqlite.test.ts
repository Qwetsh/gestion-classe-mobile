/**
 * Envoi (téléphone -> serveur) : `syncAll`, sur un vrai SQLite et un faux serveur qui applique
 * clé primaire, contraintes UNIQUE et clés étrangères.
 *
 * Ce qui est tenu ici : ce qui attend sur le téléphone part, dans un ordre que le serveur
 * accepte ; ce qui est parti n'est pas renvoyé ; ce qui n'a pas pu partir reste en attente, sans
 * bloquer le reste et sans être effacé.
 */
jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
jest.mock('../../../services/photos/tpPhotos', () => ({ uploadTpPhotoFile: jest.fn(async () => true) }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

import { addMember, createClassGroup, saveGroupPlanPositions } from '../../../services/database/classGroupRepository';
import { executeSql } from '../../../services/database/client';
import { createClass } from '../../../services/database/classRepository';
import { setStudentPosition } from '../../../services/database/classRoomPlanRepository';
import { createEvent, deleteEvent } from '../../../services/database/eventRepository';
import {
  createGradingCriteria,
  createGroupSession,
  createGroupSessionPhoto,
  createSessionGroup,
  moveStudentToGroup,
  setGroupGrade,
  updateGroupSessionStatus,
} from '../../../services/database/groupSessionRepository';
import { createRoom } from '../../../services/database/roomRepository';
import { createSession, endSession } from '../../../services/database/sessionRepository';
import { awardStamp, createStampCategory } from '../../../services/database/stampRepository';
import { createStudent, createStudentsBatch } from '../../../services/database/studentRepository';
import { uploadTpPhotoFile } from '../../../services/photos/tpPhotos';
import { getUnsyncedCount, pullFromServer, pushGroupSessionNow, syncAll } from '../../../services/sync/syncService';
import {
  USER,
  advanceClock,
  fakePseudo,
  foreignKeyViolations,
  localCount,
  localIds,
  localRow,
  seedServerClassroom,
  serverClass,
  serverClassGroup,
  setOnline,
  useSyncTestEnvironment,
} from '../../helpers/syncHarness';

const server = useSyncTestEnvironment();

/** Envoie, puis avance l'horloge : la synchro suivante a lieu « plus tard ». */
async function push() {
  const result = await syncAll(USER);
  advanceClock();
  return result;
}

async function pull() {
  const result = await pullFromServer(USER);
  advanceClock();
  return result;
}

/** Requêtes qui ont écrit sur le serveur depuis le dernier `server.clearRequests()`. */
function writes() {
  return server.requests.filter((r) => r.operation !== 'select').map((r) => `${r.operation} ${r.table}`);
}

/** Une classe montée entièrement sur le téléphone, hors ligne : rien n'est encore sur le serveur. */
async function createLocalClassroom() {
  const cls = await createClass(USER, '5A');
  const room = await createRoom(USER, 'Labo 1');
  const lina = await createStudent(USER, 'Lina Bo', cls.id);
  const noe = await createStudent(USER, 'Noé Ma', cls.id);
  const session = await createSession(USER, cls.id, room.id, 'Le climat');
  const participation = await createEvent(session.id, lina.id, 'participation');
  const bavardage = await createEvent(session.id, noe.id, 'bavardage');
  return { cls, room, lina, noe, session, participation, bavardage };
}

describe('envoi de ce qui attend sur le téléphone', () => {
  it('classe, élèves, salle, séance et événements partent, dans un ordre que le serveur accepte', async () => {
    const local = await createLocalClassroom();
    expect(await getUnsyncedCount()).toBe(7);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ success: true, classesSync: 1, studentsSync: 2, roomsSync: 1, sessionsSync: 1, eventsSync: 2 });
    expect(server.find('classes', local.cls.id)).toMatchObject({ name: '5A', user_id: USER });
    expect(server.find('students', local.lina.id)).toMatchObject({ pseudo: 'Lina Bo', class_id: local.cls.id, user_id: USER });
    expect(server.find('rooms', local.room.id)).toMatchObject({ name: 'Labo 1', grid_rows: 6, grid_cols: 5, disabled_cells: [] });
    expect(server.find('sessions', local.session.id)).toMatchObject({ class_id: local.cls.id, room_id: local.room.id, topic: 'Le climat', ended_at: null });
    expect(server.find('events', local.bavardage.id)).toMatchObject({ type: 'bavardage', student_id: local.noe.id, session_id: local.session.id });
    expect(server.ids('events')).toHaveLength(2);
  });

  it('ce qui est parti est marqué envoyé et ne repart pas à la synchro suivante', async () => {
    await createLocalClassroom();
    await push();
    expect(await getUnsyncedCount()).toBe(0);
    for (const table of ['classes', 'students', 'rooms', 'sessions', 'events']) {
      expect(await localCount(table, 'synced_at IS NULL')).toBe(0);
    }
    server.clearRequests();

    const again = await push();

    expect(again).toMatchObject({ success: true, errors: [], classesSync: 0, studentsSync: 0, roomsSync: 0, sessionsSync: 0, eventsSync: 0 });
    expect(writes()).toEqual([]);
  });

  it('seul le nouvel événement part ensuite', async () => {
    const local = await createLocalClassroom();
    await push();
    server.clearRequests();
    await createEvent(local.session.id, local.lina.id, 'remarque', null, 'A aidé son voisin');

    const result = await push();

    expect(result).toMatchObject({ success: true, eventsSync: 1 });
    expect(writes()).toEqual(['upsert events']);
    expect(server.requestsFor('events', 'upsert')[0].sent).toBe(1);
    expect(server.ids('events')).toHaveLength(3);
  });

  it('une séance envoyée en cours repart avec son heure de fin une fois terminée', async () => {
    const local = await createLocalClassroom();
    await push();
    await endSession(local.session.id);

    const result = await push();

    expect(result).toMatchObject({ success: true, sessionsSync: 1 });
    expect(server.find('sessions', local.session.id)?.ended_at).not.toBeNull();
    expect(await getUnsyncedCount()).toBe(0);
  });

  // BOGUE (syncService.ts, `syncSessions`, « Mark as synced (batch update) »). Les séances sont
  // marquées envoyées par identifiant, sans vérifier qu'elles n'ont pas changé pendant l'envoi
  // (contrairement aux tables de TP, protégées par `markSyncedIfUnchanged`). Si l'enseignant
  // termine la séance (ou modifie ses notes) pendant qu'un envoi est en route — pendant un TP, un
  // envoi part après chaque modification —, la fin de séance est marquée « envoyée » alors que le
  // serveur a reçu la séance encore ouverte. Elle n'est plus jamais renvoyée : sur le site, la
  // séance reste sans heure de fin.
  it.failing('une séance terminée pendant qu’un envoi est en route repart avec son heure de fin', async () => {
    const local = await createLocalClassroom();
    server.onRequest = async ({ table, operation }) => {
      if (table === 'sessions' && operation === 'upsert') {
        server.onRequest = null;
        await endSession(local.session.id);
      }
    };
    await push();
    expect(server.find('sessions', local.session.id)).toMatchObject({ ended_at: null });

    await push();

    expect(server.find('sessions', local.session.id)?.ended_at).not.toBeNull();
  });

  it('deux synchros lancées en même temps n’envoient pas deux fois la même chose', async () => {
    await createLocalClassroom();

    const [first, second] = await Promise.all([syncAll(USER), syncAll(USER)]);

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(first.eventsSync + second.eventsSync).toBe(2);
    expect(server.requestsFor('classes', 'upsert')).toHaveLength(1);
    expect(server.requestsFor('events', 'upsert')).toHaveLength(1);
  });

  it('un téléchargement lancé pendant un envoi ne supprime pas ce qui vient de partir', async () => {
    const local = await createLocalClassroom();

    const [sent, received] = await Promise.all([syncAll(USER), pullFromServer(USER)]);

    expect(sent.errors).toEqual([]);
    expect(received.errors).toEqual([]);
    expect(await localRow('classes', local.cls.id)).not.toBeNull();
    expect(await localCount('students')).toBe(2);
    expect(await localCount('events')).toBe(2);
  });
});

describe('tampons, groupes de classe, TP', () => {
  it('un tampon posé alors que le serveur ne répond pas part à la synchro, carte d’abord', async () => {
    seedServerClassroom(server);
    await pull();
    const category = await createStampCategory(USER, 'Autonomie', 'A', '#FF6F00', 0);
    server.failOn({ table: 'stamp_cards', operation: 'upsert', message: 'coupure', times: 1 });
    const { stamp, pushed } = await awardStamp(USER, 'eleve-1', category.id);
    expect(pushed).toBe(false);
    server.clearRequests();

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ stampCategoriesSync: 1, stampCardsSync: 1, stampsSync: 1 });
    expect(server.find('stamps', stamp.id)).toMatchObject({ card_id: stamp.card_id, slot_number: 1, category_id: category.id });
    expect(writes()).toEqual(['upsert stamp_categories', 'upsert stamp_cards', 'upsert stamps']);
    server.clearRequests();
    expect((await push()).errors).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('un tampon dont la case a été prise depuis le web part sur la première case libre', async () => {
    seedServerClassroom(server);
    await pull();
    server.failOn({ table: 'stamp_cards', operation: 'upsert', message: 'coupure', times: 1 });
    const { stamp } = await awardStamp(USER, 'eleve-1', (await createStampCategory(USER, 'Autonomie', 'A', '#FF6F00', 0)).id);
    await push();
    // Deuxième tampon posé sans réseau sur la case 2, que le web occupe entre-temps.
    server.failOn({ table: 'stamps', operation: 'upsert', message: 'coupure', times: 1 });
    const second = await awardStamp(USER, 'eleve-1', stamp.category_id as string);
    expect(second.pushed).toBe(false);
    server.seed('stamps', [{ id: 'tampon-web', user_id: USER, card_id: stamp.card_id, student_id: 'eleve-1', category_id: null, slot_number: 2, awarded_at: '2026-09-07T09:00:00.000Z' }]);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.find('stamps', 'tampon-web')).toMatchObject({ slot_number: 2 });
    expect(server.find('stamps', second.stamp.id)).toMatchObject({ slot_number: 3 });
    expect(await localRow('stamps', second.stamp.id)).toMatchObject({ slot_number: 3 });
    expect(await localCount('stamps', 'synced_at IS NULL')).toBe(0);
  });

  it('une catégorie créée hors ligne dont le libellé existe déjà sur le serveur est réunie avec elle, tampons compris', async () => {
    seedServerClassroom(server);
    server.seed('stamp_categories', [{
      id: 'cat-serveur', user_id: USER, label: 'Autonomie', icon: 'A', icon_ref: null, color: '#FF6F00',
      display_order: 0, is_active: true, created_at: '2026-09-01T07:00:00.000Z',
    }]);
    await pull();
    await executeSql('DELETE FROM stamp_categories');
    const local = await createStampCategory(USER, 'Autonomie', 'A', '#FF6F00', 0);
    server.failOn({ table: 'stamp_cards', operation: 'upsert', message: 'coupure', times: 1 });
    const { stamp } = await awardStamp(USER, 'eleve-1', local.id);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.ids('stamp_categories')).toEqual(['cat-serveur']);
    expect(await localIds('stamp_categories')).toEqual(['cat-serveur']);
    expect(await localRow('stamps', stamp.id)).toMatchObject({ category_id: 'cat-serveur' });
    expect(server.find('stamps', stamp.id)).toMatchObject({ category_id: 'cat-serveur' });
  });

  it('un groupe de classe, ses membres et son plan partent après la classe et les élèves', async () => {
    const local = await createLocalClassroom();
    const group = await createClassGroup(USER, local.cls.id, 'Groupe A');
    await addMember(group.id, local.lina.id);
    await saveGroupPlanPositions(local.cls.id, local.room.id, group.id, { '0-0': local.lina.id });

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ classGroupsSync: 1, classGroupMembersSync: 1, classGroupPlansSync: 1 });
    expect(server.find('class_groups', group.id)).toMatchObject({ name: 'Groupe A', class_id: local.cls.id });
    expect(server.rows('class_group_members')).toEqual([expect.objectContaining({ group_id: group.id, student_id: local.lina.id })]);
    expect(server.rows('class_group_plans')).toEqual([expect.objectContaining({ group_id: group.id, positions: { '0-0': local.lina.id } })]);
    expect(await getUnsyncedCount()).toBe(0);
  });

  it('un membre déjà inscrit depuis le web sous un autre identifiant ne crée ni doublon ni erreur', async () => {
    seedServerClassroom(server);
    server.seed('class_groups', [serverClassGroup('groupe-1', 'classe-1', 'Groupe A')]);
    await pull();
    await addMember('groupe-1', 'eleve-1');
    server.seed('class_group_members', [{ id: 'membre-web', group_id: 'groupe-1', student_id: 'eleve-1', created_at: '2026-09-07T07:00:00.000Z' }]);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.rows('class_group_members')).toHaveLength(1);
    expect(await localCount('class_group_members')).toBe(1);
    expect(await localCount('class_group_members', 'synced_at IS NULL')).toBe(0);
    expect(await localIds('class_group_members')).toEqual(server.ids('class_group_members'));
  });

  it('un TP en cours part avec ses critères, groupes, membres et notes, puis ne repart pas', async () => {
    const local = await createLocalClassroom();
    const tp = await createGroupSession(USER, local.cls.id, 'TP antibiogramme', local.session.id);
    await updateGroupSessionStatus(tp.id, 'active');
    const criterion = await createGradingCriteria(tp.id, 'Protocole suivi', 4, 0);
    const group = await createSessionGroup(tp.id, 'Îlot 1', undefined, { x: 0.25, y: 0.5 });
    await moveStudentToGroup(tp.id, local.lina.id, group.id);
    await setGroupGrade(group.id, criterion.id, 2.5);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result).toMatchObject({ groupSessionsSync: 1, gradingCriteriaSync: 1, sessionGroupsSync: 1, groupMembersSync: 1, groupGradesSync: 1 });
    expect(server.find('group_sessions', tp.id)).toMatchObject({ status: 'active', linked_session_id: local.session.id });
    expect(server.find('session_groups', group.id)).toMatchObject({ name: 'Îlot 1', position_x: 0.25, position_y: 0.5 });
    expect(server.rows('group_grades')).toEqual([expect.objectContaining({ group_id: group.id, criteria_id: criterion.id, points_awarded: 2.5 })]);
    expect(await getUnsyncedCount()).toBe(0);
    server.clearRequests();
    expect((await push()).errors).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('une note de TP changée pendant l’envoi n’est pas marquée envoyée : la nouvelle valeur part ensuite', async () => {
    const local = await createLocalClassroom();
    const tp = await createGroupSession(USER, local.cls.id, 'TP antibiogramme', local.session.id);
    await updateGroupSessionStatus(tp.id, 'active');
    const criterion = await createGradingCriteria(tp.id, 'Protocole suivi', 4, 0);
    const group = await createSessionGroup(tp.id, 'Îlot 1');
    await setGroupGrade(group.id, criterion.id, 2.5);
    server.onRequest = async ({ table, operation }) => {
      if (table === 'group_grades' && operation === 'upsert') {
        server.onRequest = null;
        await setGroupGrade(group.id, criterion.id, 4);
      }
    };

    await push();
    expect(server.rows('group_grades')).toEqual([expect.objectContaining({ points_awarded: 2.5 })]);
    expect(await localCount('group_grades', 'synced_at IS NULL')).toBe(1);
    await push();

    expect(server.rows('group_grades')).toEqual([expect.objectContaining({ points_awarded: 4 })]);
    expect(await localCount('group_grades', 'synced_at IS NULL')).toBe(0);
  });

  it('un TP encore en brouillon reste sur le téléphone, avec ses groupes', async () => {
    const local = await createLocalClassroom();
    const tp = await createGroupSession(USER, local.cls.id, 'TP à préparer', local.session.id);
    await createSessionGroup(tp.id, 'Îlot 1');

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.ids('group_sessions')).toEqual([]);
    expect(server.ids('session_groups')).toEqual([]);
    expect(await localCount('session_groups', 'synced_at IS NULL')).toBe(1);
  });
});

describe('plan de classe', () => {
  it('un plan créé sur le téléphone part avec ses places', async () => {
    const local = await createLocalClassroom();
    await setStudentPosition(local.cls.id, local.room.id, local.lina.id, 0, 0);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result.plansSync).toBe(1);
    expect(server.rows('class_room_plans')).toEqual([
      expect.objectContaining({ class_id: local.cls.id, room_id: local.room.id, positions: { '0-0': local.lina.id }, user_id: USER }),
    ]);
  });

  it('un plan créé des deux côtés est réuni sur celui du serveur, sans doublon', async () => {
    seedServerClassroom(server);
    await pull();
    await setStudentPosition('classe-1', 'salle-1', 'eleve-1', 2, 3);
    server.seed('class_room_plans', [{
      id: 'plan-web', class_id: 'classe-1', room_id: 'salle-1', user_id: USER, positions: {},
      created_at: '2026-09-07T07:00:00.000Z', updated_at: null,
    }]);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.rows('class_room_plans')).toEqual([expect.objectContaining({ id: 'plan-web', positions: { '2-3': 'eleve-1' } })]);
    expect(await localCount('class_room_plans', 'synced_at IS NULL')).toBe(0);
  });

  // BOGUE (classRoomPlanRepository.ts, `updatePositions` ; syncService.ts, étape « 4. Pull
  // class_room_plans »). Déplacer un élève sur un plan déjà synchronisé ne remet pas `synced_at`
  // à NULL : la modification n'est jamais envoyée. Et le téléchargement, qui ouvre chaque synchro,
  // réécrit les places avec celles du serveur (« server wins »), sans regarder si le plan local a
  // changé. Un plan de classe retouché sur le téléphone revient donc à son ancien état à la
  // synchro suivante. Seul un plan tout neuf, jamais envoyé ni reçu, part correctement.
  it.failing('un élève déplacé sur un plan déjà synchronisé garde sa nouvelle place après la synchro', async () => {
    seedServerClassroom(server);
    server.seed('class_room_plans', [{
      id: 'plan-1', class_id: 'classe-1', room_id: 'salle-1', user_id: USER, positions: { '0-0': 'eleve-1' },
      created_at: '2026-09-01T07:00:00.000Z', updated_at: null,
    }]);
    await pull();
    await setStudentPosition('classe-1', 'salle-1', 'eleve-1', 3, 2);

    await pull();
    await push();

    expect(await localRow('class_room_plans', 'plan-1')).toMatchObject({ positions: '{"3-2":"eleve-1"}' });
    expect(server.find('class_room_plans', 'plan-1')).toMatchObject({ positions: { '3-2': 'eleve-1' } });
  });
});

describe('erreur pendant l’envoi', () => {
  it('une table refusée ne bloque pas les autres, et ce qui n’est pas parti reste en attente', async () => {
    const local = await createLocalClassroom();
    server.failOn({ table: 'students', operation: 'upsert', message: 'refus du serveur' });

    const result = await push();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toBe('Students: refus du serveur');
    // Classe, salle et séance sont parties malgré l'échec des élèves.
    expect(server.ids('classes')).toEqual([local.cls.id]);
    expect(server.ids('rooms')).toEqual([local.room.id]);
    expect(server.ids('sessions')).toEqual([local.session.id]);
    expect(result).toMatchObject({ classesSync: 1, roomsSync: 1, sessionsSync: 1, studentsSync: 0, eventsSync: 0 });
    // Les élèves, et les événements qui en dépendent, attendent toujours sur le téléphone.
    expect(server.ids('students')).toEqual([]);
    expect(server.ids('events')).toEqual([]);
    expect(await localCount('students', 'synced_at IS NULL')).toBe(2);
    expect(await localCount('events', 'synced_at IS NULL')).toBe(2);
    expect(await getUnsyncedCount()).toBe(4);
  });

  it('la synchro suivante envoie ce qui restait, sans rien renvoyer d’autre', async () => {
    await createLocalClassroom();
    server.failOn({ table: 'students', operation: 'upsert', message: 'refus du serveur', times: 1 });
    await push();
    server.clearRequests();

    const result = await push();

    expect(result).toMatchObject({ success: true, errors: [], studentsSync: 2, eventsSync: 2, classesSync: 0 });
    expect(writes()).toEqual(['upsert students', 'upsert events']);
    expect(await getUnsyncedCount()).toBe(0);
  });

  it('un échec sur les événements laisse les événements en attente, pas marqués envoyés', async () => {
    await createLocalClassroom();
    server.failOn({ table: 'events', operation: 'upsert', message: 'délai dépassé' });

    const result = await push();

    expect(result.errors).toEqual(['Events: délai dépassé']);
    expect(await localCount('events', 'synced_at IS NULL')).toBe(2);
    expect(await localCount('events')).toBe(2);
  });

  it('une carte refusée garde ses tampons en attente et le dit', async () => {
    seedServerClassroom(server);
    await pull();
    const category = await createStampCategory(USER, 'Autonomie', 'A', '#FF6F00', 0);
    server.failOn({ table: 'stamp_cards', operation: 'upsert', message: 'coupure' });
    const { stamp } = await awardStamp(USER, 'eleve-1', category.id);

    const result = await push();

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'Cartes (1 non envoyee) : carte n°1 : coupure',
      'Tampons (1 probleme) : 1 tampon en attente : carte pas encore sur le serveur',
    ]);
    expect(await localRow('stamps', stamp.id)).toMatchObject({ synced_at: null });
    expect(server.ids('stamps')).toEqual([]);
  });
});

describe('groupes de classe : vérification des classes sur le serveur', () => {
  beforeEach(async () => {
    seedServerClassroom(server);
    await pull();
  });

  it('vérification impossible : erreur « Class groups: … » et aucun groupe supprimé du téléphone', async () => {
    const group = await createClassGroup(USER, 'classe-1', 'Groupe A');
    await addMember(group.id, 'eleve-1');
    server.failOn({ table: 'classes', operation: 'select', message: 'coupure' });

    const result = await push();

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Class groups: coupure');
    expect(await localRow('class_groups', group.id)).toMatchObject({ name: 'Groupe A', synced_at: null });
    expect(await localCount('class_group_members')).toBe(1);
    expect(server.ids('class_groups')).toEqual([]);
  });

  it('après la panne, le groupe et son membre partent', async () => {
    const group = await createClassGroup(USER, 'classe-1', 'Groupe A');
    await addMember(group.id, 'eleve-1');
    server.failOn({ table: 'classes', operation: 'select', message: 'coupure', times: 1 });
    await push();

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.ids('class_groups')).toEqual([group.id]);
    expect(server.rows('class_group_members')).toHaveLength(1);
  });

  it('classe réellement supprimée du serveur : son groupe en attente est retiré du téléphone, sans erreur', async () => {
    const group = await createClassGroup(USER, 'classe-1', 'Groupe A');
    server.remove('classes', 'classe-1');

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(await localRow('class_groups', group.id)).toBeNull();
    expect(server.ids('class_groups')).toEqual([]);
  });

  // BOGUE (syncService.ts, `syncClassGroups`, boucle `DELETE FROM class_groups WHERE id = ?`).
  // Le garde-fou distingue « lecture impossible » de « classe absente », mais pas « classe
  // supprimée du serveur » de « classe créée sur le téléphone et pas encore arrivée ». Si l'envoi
  // de la classe échoue à l'étape précédente (refus, délai dépassé) alors que la lecture qui suit
  // réussit, les demi-groupes que l'enseignant vient de créer pour cette classe, leurs membres et
  // leurs plans sont effacés du téléphone. La classe, elle, partira à la synchro suivante, sans eux.
  it.failing('classe créée sur le téléphone dont l’envoi échoue : ses groupes restent en attente', async () => {
    const cls = await createClass(USER, '4C');
    const tom = await createStudent(USER, 'Tom Le', cls.id);
    const group = await createClassGroup(USER, cls.id, 'Groupe A');
    await addMember(group.id, tom.id);
    server.failOn({ table: 'classes', operation: 'upsert', message: 'délai dépassé', times: 1 });

    await push();

    expect(await localRow('class_groups', group.id)).not.toBeNull();
    expect(await localCount('class_group_members')).toBe(1);
  });
});

describe('classe supprimée sur le web pendant qu’une séance attendait sur le téléphone', () => {
  it('la classe n’est pas recréée sur le serveur ; la séance locale est abandonnée', async () => {
    seedServerClassroom(server);
    await pull();
    const session = await createSession(USER, 'classe-1', 'salle-1');
    await createEvent(session.id, 'eleve-1', 'participation');
    server.remove('classes', 'classe-1');

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.ids('classes')).toEqual([]);
    expect(server.ids('sessions')).toEqual([]);
    expect(await localCount('classes')).toBe(0);
    expect(await localCount('sessions')).toBe(0);
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('si le serveur ne répond pas à la vérification, rien n’est abandonné', async () => {
    seedServerClassroom(server);
    await pull();
    const session = await createSession(USER, 'classe-1', 'salle-1');
    await createEvent(session.id, 'eleve-1', 'participation');
    server.failOn({ table: 'classes', operation: 'select', message: 'coupure' });

    const result = await push();

    expect(result.errors).toContain('Class lookup failed: coupure');
    expect(await localRow('sessions', session.id)).toMatchObject({ synced_at: null });
    expect(await localCount('events', 'synced_at IS NULL')).toBe(1);
  });
});

describe('suppressions en attente', () => {
  async function syncedClassroomWithDeletedEvent() {
    const local = await createLocalClassroom();
    await push();
    await deleteEvent(local.participation.id);
    expect(await localCount('pending_deletions')).toBe(1);
    return local;
  }

  it('une suppression faite sur le téléphone est propagée au serveur, puis oubliée', async () => {
    const local = await syncedClassroomWithDeletedEvent();

    const result = await push();

    expect(result.deletionsSync).toBe(1);
    expect(server.ids('events')).toEqual([local.bavardage.id]);
    expect(await localCount('pending_deletions')).toBe(0);
    expect(await getUnsyncedCount()).toBe(0);
  });

  it('un événement jamais envoyé est supprimé sans rien demander au serveur', async () => {
    const local = await createLocalClassroom();

    await deleteEvent(local.participation.id);

    expect(await localCount('pending_deletions')).toBe(0);
    expect(await localCount('events')).toBe(1);
  });

  it.each([
    ['hors ligne', false],
    ['au lancement, tant que l’état du réseau n’est pas connu', null],
  ])('%s : la suppression reste en attente et compte dans ce qui reste à envoyer', async (_label, online) => {
    await syncedClassroomWithDeletedEvent();
    setOnline(online);

    const result = await push();

    expect(result.deletionsSync).toBe(0);
    expect(server.ids('events')).toHaveLength(2);
    expect(await localCount('pending_deletions')).toBe(1);
    expect(await getUnsyncedCount()).toBe(1);
  });

  it('le serveur refuse la suppression : elle reste en attente, le reste de l’envoi continue', async () => {
    const local = await syncedClassroomWithDeletedEvent();
    await createEvent(local.session.id, local.noe.id, 'participation');
    server.failOn({ table: 'events', operation: 'delete', message: 'coupure' });

    const result = await push();

    expect(result.deletionsSync).toBe(0);
    expect(result.eventsSync).toBe(1);
    expect(await localCount('pending_deletions')).toBe(1);
  });
});

describe('serveur non joignable du tout', () => {
  it('rien n’est marqué envoyé, rien n’est supprimé, chaque table signale son erreur', async () => {
    const local = await createLocalClassroom();
    const group = await createClassGroup(USER, local.cls.id, 'Groupe A');
    for (const table of ['classes', 'students', 'rooms', 'sessions', 'events', 'class_groups']) {
      server.failOn({ table, message: 'Network request failed' });
    }

    const result = await push();

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Classes: Network request failed',
      'Students: Network request failed',
      'Class groups: Network request failed',
      'Rooms: Network request failed',
    ]));
    expect(await getUnsyncedCount()).toBe(8);
    expect(await localRow('class_groups', group.id)).not.toBeNull();
    expect(server.ids('classes')).toEqual([]);
  });
});

describe('demi-groupe et séance', () => {
  it('une séance tenue avec un demi-groupe arrive sur le serveur avec son groupe', async () => {
    server.seed('classes', [serverClass('classe-1', '5A')]);
    await pull();
    const room = await createRoom(USER, 'Labo 1');
    const group = await createClassGroup(USER, 'classe-1', 'Groupe A');
    const session = await createSession(USER, 'classe-1', room.id, null, group.id);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.find('sessions', session.id)).toMatchObject({ group_id: group.id });
  });
});

describe('listes de plus de 100 identifiants à vérifier avant l’envoi', () => {
  it('250 membres d’un groupe partent tous, les vérifications passant par paquets de 100', async () => {
    const cls = await createClass(USER, '5A');
    const studentIds = await createStudentsBatch(USER, Array.from({ length: 250 }, (_, i) => ({ pseudo: fakePseudo(i), classId: cls.id })));
    const group = await createClassGroup(USER, cls.id, 'Groupe A');
    for (const id of studentIds) await addMember(group.id, id);
    // Le serveur refuse une liste d'identifiants plus longue (adresse trop longue).
    server.maxInValues = 100;

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(result.classGroupMembersSync).toBe(250);
    expect(server.rows('class_group_members')).toHaveLength(250);
    const lists = server.requestsFor('students', 'select').map((r) => (r.filters.find((f) => f.kind === 'in')?.value as unknown[]).length);
    expect(lists).toEqual([100, 100, 50]);
  });
});

describe('photos de TP', () => {
  const upload = uploadTpPhotoFile as jest.MockedFunction<typeof uploadTpPhotoFile>;

  async function tpWithPhoto() {
    const local = await createLocalClassroom();
    const tp = await createGroupSession(USER, local.cls.id, 'TP antibiogramme', local.session.id);
    await updateGroupSessionStatus(tp.id, 'active');
    const group = await createSessionGroup(tp.id, 'Îlot 1');
    await createGroupSessionPhoto({
      id: 'photo-1', sessionId: tp.id, groupId: group.id,
      filePath: `${USER}/tp/${tp.id}/photo-1.jpg`, localUri: 'file:///tp_photos/photo-1.jpg', caption: 'Boîte 1',
    });
    return { tp, group };
  }

  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue(true);
  });

  it('le fichier part d’abord, puis la ligne de la photo, rattachée à son groupe', async () => {
    const { tp, group } = await tpWithPhoto();

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(upload).toHaveBeenCalledWith('file:///tp_photos/photo-1.jpg', `${USER}/tp/${tp.id}/photo-1.jpg`);
    expect(server.find('group_session_photos', 'photo-1')).toMatchObject({ session_id: tp.id, group_id: group.id, caption: 'Boîte 1' });
    expect(await getUnsyncedCount()).toBe(0);
  });

  it('tant que le fichier n’a pas pu partir, la ligne reste sur le téléphone et la photo reste en attente', async () => {
    await tpWithPhoto();
    upload.mockResolvedValue(false);

    const result = await push();

    expect(result.errors).toEqual([]);
    expect(server.ids('group_session_photos')).toEqual([]);
    expect(await localRow('group_session_photos', 'photo-1')).toMatchObject({ uploaded: 0, synced_at: null });
    expect(await getUnsyncedCount()).toBe(1);
  });
});

describe('envoi immédiat pendant un TP (pushGroupSessionNow)', () => {
  it('envoie la séance, le TP et ses groupes sans attendre la synchro complète', async () => {
    const local = await createLocalClassroom();
    await push();
    const tp = await createGroupSession(USER, local.cls.id, 'TP antibiogramme', local.session.id);
    await updateGroupSessionStatus(tp.id, 'active');
    const group = await createSessionGroup(tp.id, 'Îlot 1');
    await moveStudentToGroup(tp.id, local.lina.id, group.id);

    await pushGroupSessionNow();

    expect(server.ids('group_sessions')).toEqual([tp.id]);
    expect(server.ids('session_groups')).toEqual([group.id]);
    expect(server.rows('session_group_members')).toEqual([expect.objectContaining({ group_id: group.id, student_id: local.lina.id })]);
  });

  it('ne lève jamais, même serveur en panne, et laisse tout en attente', async () => {
    const local = await createLocalClassroom();
    const tp = await createGroupSession(USER, local.cls.id, 'TP antibiogramme', local.session.id);
    await updateGroupSessionStatus(tp.id, 'active');
    await createSessionGroup(tp.id, 'Îlot 1');
    for (const table of ['rooms', 'classes', 'sessions', 'group_sessions', 'session_groups']) {
      server.failOn({ table, message: 'Network request failed' });
    }

    await expect(pushGroupSessionNow()).resolves.toBeUndefined();

    expect(await localCount('group_sessions', 'synced_at IS NULL')).toBe(1);
    expect(await localCount('session_groups', 'synced_at IS NULL')).toBe(1);
  });
});
