/**
 * Le piège « INSERT OR REPLACE » et son garde-fou, sur un vrai SQLite.
 *
 * Sur une table parente, REPLACE = DELETE + INSERT : le DELETE déclenche les cascades et emporte
 * les lignes enfants. C'est ainsi que chaque téléchargement détruisait les tampons posés en
 * classe et pas encore envoyés. `upsertLocalRow` (UPDATE ou INSERT) et `remapLocalCard`
 * (changement d'identifiant en place) existent pour l'éviter.
 */
jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

import { executeSql } from '../../../services/database/client';
import { remapLocalCard, upsertLocalRow } from '../../../services/database/localUpsert';
import {
  USER,
  foreignKeyViolations,
  insertLocal,
  localCount,
  localIds,
  localRow,
  useSyncTestEnvironment,
} from '../../helpers/syncHarness';

useSyncTestEnvironment();

const SYNCED = '2026-09-01T07:00:00.000Z';

/** Lina Bo, sa carte n°1 avec deux tampons (dont un pas encore envoyé) et son choix de bonus. */
async function seedCardWithStamps(): Promise<void> {
  await insertLocal('classes', { id: 'classe-1', user_id: USER, name: '5A', synced_at: SYNCED });
  await insertLocal('students', { id: 'eleve-1', user_id: USER, pseudo: 'Lina Bo', class_id: 'classe-1', synced_at: SYNCED });
  await seedStampsFor('eleve-1');
}

async function seedStampsFor(studentId: string): Promise<void> {
  await insertLocal('bonuses', { id: 'bonus-1', user_id: USER, label: 'Choisir sa place', synced_at: SYNCED });
  await insertLocal('stamp_cards', { id: 'carte-1', student_id: studentId, user_id: USER, card_number: 1, synced_at: SYNCED });
  await insertLocal('stamps', { id: 'tampon-1', card_id: 'carte-1', student_id: studentId, user_id: USER, slot_number: 1, synced_at: SYNCED });
  await insertLocal('stamps', { id: 'tampon-2', card_id: 'carte-1', student_id: studentId, user_id: USER, slot_number: 2, synced_at: null });
  await insertLocal('bonus_selections', { id: 'choix-1', card_id: 'carte-1', bonus_id: 'bonus-1', student_id: studentId, user_id: USER });
}

/** La 5A avec un demi-groupe, un membre et le plan de classe du groupe. */
async function seedClassGroup(): Promise<void> {
  await insertLocal('classes', { id: 'classe-1', user_id: USER, name: '5A', synced_at: SYNCED });
  await insertLocal('rooms', { id: 'salle-1', user_id: USER, name: 'Labo 1', synced_at: SYNCED });
  // Élève sans classe (détaché au passage d'année) : rien d'autre ne retient la classe.
  await insertLocal('students', { id: 'eleve-1', user_id: USER, pseudo: 'Lina Bo', class_id: null, synced_at: SYNCED });
  await insertLocal('class_groups', { id: 'groupe-1', user_id: USER, class_id: 'classe-1', name: 'Groupe A', synced_at: SYNCED });
  await insertLocal('class_group_members', { id: 'membre-1', group_id: 'groupe-1', student_id: 'eleve-1' });
  await insertLocal('class_group_plans', { id: 'plan-1', class_id: 'classe-1', room_id: 'salle-1', group_id: 'groupe-1', positions: '{"eleve-1":"0-0"}' });
}

describe('le piège : INSERT OR REPLACE sur une table parente', () => {
  it('sur une carte, emporte ses tampons et son choix de bonus', async () => {
    await seedCardWithStamps();

    await executeSql(
      `INSERT OR REPLACE INTO stamp_cards (id, student_id, user_id, card_number, status, synced_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ['carte-1', 'eleve-1', USER, 1, 'active', SYNCED],
    );

    expect(await localCount('stamp_cards')).toBe(1);
    expect(await localCount('stamps')).toBe(0);
    expect(await localCount('bonus_selections')).toBe(0);
  });

  it('sur une classe, emporte ses groupes, leurs membres et leurs plans', async () => {
    await seedClassGroup();

    await executeSql(`INSERT OR REPLACE INTO classes (id, user_id, name) VALUES (?, ?, ?)`, ['classe-1', USER, '5A']);

    expect(await localCount('classes')).toBe(1);
    expect(await localCount('class_groups')).toBe(0);
    expect(await localCount('class_group_members')).toBe(0);
    expect(await localCount('class_group_plans')).toBe(0);
  });

  it('sur un élève, emporte son appartenance aux groupes et remet à zéro les colonnes non fournies', async () => {
    await seedClassGroup();
    await seedStampsFor('eleve-1');
    await executeSql('UPDATE students SET has_pap = 1 WHERE id = ?', ['eleve-1']);

    await executeSql(
      `INSERT OR REPLACE INTO students (id, user_id, pseudo, class_id) VALUES (?, ?, ?, ?)`,
      ['eleve-1', USER, 'Lina Bo', null],
    );

    // Lien en cascade (class_group_members) : détruit sans erreur.
    expect(await localCount('class_group_members')).toBe(0);
    // Lien sans cascade (carte, tampons) : conservé, la ligne parente revenant avec le même id.
    expect(await localCount('stamp_cards')).toBe(1);
    expect(await localCount('stamps')).toBe(2);
    // La ligne est recréée : ce qui n'est pas dans l'INSERT repart à sa valeur par défaut.
    expect(await localRow('students', 'eleve-1')).toMatchObject({ has_pap: 0, synced_at: null });
  });
});

describe('upsertLocalRow', () => {
  it('met à jour une carte existante sans toucher à ses tampons ni à son choix de bonus', async () => {
    await seedCardWithStamps();

    await upsertLocalRow('stamp_cards', {
      id: 'carte-1', student_id: 'eleve-1', user_id: USER, card_number: 1,
      status: 'completed', completed_at: '2026-09-05T10:00:00.000Z', created_at: SYNCED, synced_at: '2026-09-07T08:00:00.000Z',
    });

    expect(await localRow('stamp_cards', 'carte-1')).toMatchObject({ status: 'completed', completed_at: '2026-09-05T10:00:00.000Z' });
    expect(await localIds('stamps')).toEqual(['tampon-1', 'tampon-2']);
    expect((await localRow('stamps', 'tampon-2'))?.synced_at).toBeNull();
    expect(await localIds('bonus_selections')).toEqual(['choix-1']);
  });

  it('met à jour un groupe de classe sans toucher à ses membres ni à son plan', async () => {
    await seedClassGroup();

    await upsertLocalRow('class_groups', {
      id: 'groupe-1', user_id: USER, class_id: 'classe-1', name: 'Groupe 1', color: '#C00000',
      sort_order: 2, created_at: SYNCED, updated_at: null, synced_at: SYNCED,
    });

    expect(await localRow('class_groups', 'groupe-1')).toMatchObject({ name: 'Groupe 1', color: '#C00000', sort_order: 2 });
    expect(await localIds('class_group_members')).toEqual(['membre-1']);
    expect(await localRow('class_group_plans', 'plan-1')).toMatchObject({ positions: '{"eleve-1":"0-0"}' });
  });

  it('crée la ligne quand elle n’existe pas', async () => {
    await seedCardWithStamps();

    await upsertLocalRow('stamp_cards', {
      id: 'carte-2', student_id: 'eleve-1', user_id: USER, card_number: 2,
      status: 'active', completed_at: null, created_at: SYNCED, synced_at: SYNCED,
    });

    expect(await localIds('stamp_cards')).toEqual(['carte-1', 'carte-2']);
  });

  it('ne modifie que les colonnes fournies', async () => {
    await seedCardWithStamps();

    await upsertLocalRow('stamps', { id: 'tampon-1', slot_number: 5 });

    expect(await localRow('stamps', 'tampon-1')).toMatchObject({ slot_number: 5, card_id: 'carte-1', synced_at: SYNCED });
  });

  it('laisse passer l’erreur de clé étrangère au lieu d’écrire une ligne orpheline', async () => {
    await seedCardWithStamps();

    await expect(
      upsertLocalRow('stamps', { id: 'tampon-9', card_id: 'carte-inconnue', student_id: 'eleve-1', user_id: USER, slot_number: 3 }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    expect(await localCount('stamps')).toBe(2);
  });
});

describe('remapLocalCard', () => {
  it('donne à la carte l’identifiant du serveur, tampons et choix de bonus suivent', async () => {
    await seedCardWithStamps();

    await remapLocalCard('carte-1', 'carte-serveur');

    expect(await localIds('stamp_cards')).toEqual(['carte-serveur']);
    expect(await localCount('stamps', 'card_id = ?', ['carte-serveur'])).toBe(2);
    expect((await localRow('stamps', 'tampon-2'))?.synced_at).toBeNull();
    expect(await localRow('bonus_selections', 'choix-1')).toMatchObject({ card_id: 'carte-serveur' });
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('ne fait rien quand les deux identifiants sont les mêmes', async () => {
    await seedCardWithStamps();

    await remapLocalCard('carte-1', 'carte-1');

    expect(await localCount('stamps', 'card_id = ?', ['carte-1'])).toBe(2);
  });

  it('annule tout si l’identifiant du serveur est déjà pris en local', async () => {
    await seedCardWithStamps();
    await insertLocal('stamp_cards', { id: 'carte-serveur', student_id: 'eleve-1', user_id: USER, card_number: 2 });

    await expect(remapLocalCard('carte-1', 'carte-serveur')).rejects.toThrow(/UNIQUE constraint failed/);

    expect(await localIds('stamp_cards')).toEqual(['carte-1', 'carte-serveur']);
    expect(await localCount('stamps', 'card_id = ?', ['carte-1'])).toBe(2);
    expect(await foreignKeyViolations()).toEqual([]);
  });
});
