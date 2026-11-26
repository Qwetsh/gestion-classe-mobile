/**
 * Schéma local et migrations, sur un vrai SQLite.
 *
 * Le schéma n'est recopié nulle part : la base est créée par `initializeDatabase()`, comme au
 * lancement de l'app. Ces tests tiennent trois choses :
 *  - une base vide arrive à la dernière version, clés étrangères actives et cohérentes ;
 *  - relancer l'app ne rejoue rien et ne perd rien ;
 *  - rejouer les migrations récentes sur une base déjà remplie ne casse rien (cas d'un téléphone
 *    resté sur une version antérieure, ou d'un numéro de version resté en arrière).
 */
jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

import { closeDatabase, executeSql, queryAll, queryFirst } from '../../../services/database/client';
import { getDatabaseStats, initializeDatabase } from '../../../services/database/migrations';
import { SCHEMA_VERSION } from '../../../services/database/schema';
import { __sqliteVersion } from '../../helpers/expoSqliteNode';
import {
  USER,
  foreignKeyViolations,
  insertLocal,
  localCount,
  localRow,
  useSyncTestEnvironment,
} from '../../helpers/syncHarness';

useSyncTestEnvironment();

async function schemaVersion(): Promise<number | undefined> {
  return (await queryFirst<{ version: number }>('SELECT version FROM schema_version'))?.version;
}

async function columnsOf(table: string): Promise<string[]> {
  return (await queryAll<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name);
}

/** Schéma complet (tables et index), pour comparer deux états de la base. */
async function schemaDump(): Promise<string[]> {
  const rows = await queryAll<{ type: string; name: string; sql: string | null }>(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  );
  return rows.map((r) => `${r.type} ${r.name}: ${(r.sql ?? '').replace(/\s+/g, ' ')}`);
}

/** Une petite classe avec tout ce qu'une séance et les récompenses accrochent à un élève. */
async function seedClassroom(): Promise<void> {
  await insertLocal('classes', { id: 'classe-1', user_id: USER, name: '5A' });
  await insertLocal('rooms', { id: 'salle-1', user_id: USER, name: 'Labo 1' });
  await insertLocal('students', { id: 'eleve-1', user_id: USER, pseudo: 'Lina Bo', class_id: 'classe-1', has_pap: 1 });
  await insertLocal('students', { id: 'eleve-2', user_id: USER, pseudo: 'Noé Ma', class_id: 'classe-1' });
  await insertLocal('local_student_mapping', {
    id: 'map-1', student_id: 'eleve-1', first_name: 'Lina', last_name: 'Bo', full_name: 'Lina Bo',
  });
  await insertLocal('sessions', { id: 'seance-1', user_id: USER, class_id: 'classe-1', room_id: 'salle-1', notes: 'Rappel du TP' });
  await insertLocal('events', { id: 'evt-1', session_id: 'seance-1', student_id: 'eleve-1', type: 'participation', photo_path: null });
  await insertLocal('class_groups', { id: 'groupe-1', user_id: USER, class_id: 'classe-1', name: 'Groupe A' });
  await insertLocal('class_group_members', { id: 'membre-1', group_id: 'groupe-1', student_id: 'eleve-1' });
  await insertLocal('stamp_categories', { id: 'cat-1', user_id: USER, label: 'Autonomie', icon: 'A', color: '#000', icon_ref: 'lucide:Star' });
  await insertLocal('stamp_cards', { id: 'carte-1', student_id: 'eleve-1', user_id: USER, card_number: 1 });
  await insertLocal('stamps', { id: 'tampon-1', card_id: 'carte-1', student_id: 'eleve-1', user_id: USER, category_id: 'cat-1', slot_number: 1 });
  await insertLocal('tp_templates', { id: 'modele-1', user_id: USER, name: 'Antibiogramme', level: '3e' });
  await insertLocal('group_sessions', { id: 'tp-1', user_id: USER, class_id: 'classe-1', name: 'TP 1', linked_session_id: 'seance-1', template_id: 'modele-1' });
  await insertLocal('session_groups', { id: 'ilot-1', session_id: 'tp-1', name: 'Îlot 1', position_x: 0.25, comment: 'Soigné' });
  await insertLocal('session_group_members', { id: 'ilot-membre-1', group_id: 'ilot-1', student_id: 'eleve-1' });
}

describe('moteur de test', () => {
  it('est un vrai SQLite, de la même branche que celui du téléphone', () => {
    expect(__sqliteVersion()).toMatch(/^3\.50\./);
  });

  it('applique les clés étrangères comme l’app les règle à l’ouverture', async () => {
    expect(await queryFirst('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    await expect(
      insertLocal('students', { id: 'eleve-x', user_id: USER, pseudo: 'Zoé Ra', class_id: 'classe-inconnue' }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});

describe('base vide', () => {
  it('arrive à la dernière version du schéma', async () => {
    expect(await schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await localCount('schema_version')).toBe(1);
  });

  it('crée toutes les tables que l’app compte (aucune « absente »)', async () => {
    const stats = await getDatabaseStats();
    expect(Object.entries(stats).filter(([, count]) => count !== 0)).toEqual([]);
  });

  it('porte les colonnes ajoutées par les migrations, absentes du schéma initial', async () => {
    expect(await columnsOf('events')).toEqual(expect.arrayContaining(['photo_path', 'tp_group_id']));
    expect(await columnsOf('sessions')).toEqual(expect.arrayContaining(['topic', 'notes', 'group_id']));
    expect(await columnsOf('students')).toEqual(expect.arrayContaining(['has_pap', 'has_ppre', 'has_pai']));
    expect(await columnsOf('stamp_categories')).toContain('icon_ref');
    expect(await columnsOf('session_groups')).toEqual(
      expect.arrayContaining(['position_x', 'position_y', 'comment', 'display_order']),
    );
    expect(await columnsOf('tp_templates')).toEqual(expect.arrayContaining(['level', 'chapter', 'activity']));
    expect(await columnsOf('group_sessions')).toEqual(expect.arrayContaining(['linked_session_id', 'template_id']));
  });

  it('ne garde rien de l’ancienne fonction student_groups (migrations 6 puis 7)', async () => {
    expect(await columnsOf('students')).not.toContain('group_id');
    expect(await queryAll(`SELECT name FROM sqlite_master WHERE name = 'student_groups'`)).toEqual([]);
  });

  it('accepte un élève sans classe (migration 13 : passage d’année)', async () => {
    await insertLocal('students', { id: 'eleve-1', user_id: USER, pseudo: 'Lina Bo', class_id: null });
    expect((await localRow('students', 'eleve-1'))?.class_id).toBeNull();
  });

  it('laisse des clés étrangères cohérentes', async () => {
    expect(await foreignKeyViolations()).toEqual([]);
  });
});

describe('relance de l’app', () => {
  it('ne rejoue aucune migration et garde les données', async () => {
    await seedClassroom();
    const before = await schemaDump();

    await initializeDatabase();
    // Fermeture puis réouverture : la connexion repart sans clés étrangères, l'app les réactive.
    await closeDatabase();
    await initializeDatabase();

    expect(await schemaDump()).toEqual(before);
    expect(await schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await queryFirst('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
    expect(await localCount('students')).toBe(2);
    expect(await localCount('events')).toBe(1);
    expect(await localCount('stamps')).toBe(1);
  });
});

describe('migrations rejouées sur une base remplie', () => {
  // On remet le numéro de version en arrière puis on relance l'initialisation : chaque migration à
  // partir de ce numéro repasse sur une base qui l'a déjà reçue, avec des données dedans.
  const replayFrom = Array.from({ length: SCHEMA_VERSION - 13 }, (_, i) => 14 + i);

  it.each(replayFrom)('depuis la version %i : ni erreur, ni perte, ni changement de schéma', async (version) => {
    await seedClassroom();
    const before = await schemaDump();
    await executeSql('UPDATE schema_version SET version = ?', [version - 1]);

    await initializeDatabase();

    expect(await schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await schemaDump()).toEqual(before);
    expect(await foreignKeyViolations()).toEqual([]);
    expect(await localRow('students', 'eleve-1')).toMatchObject({ pseudo: 'Lina Bo', has_pap: 1 });
    expect(await localRow('sessions', 'seance-1')).toMatchObject({ notes: 'Rappel du TP' });
    expect(await localRow('stamp_categories', 'cat-1')).toMatchObject({ icon_ref: 'lucide:Star' });
    expect(await localRow('session_groups', 'ilot-1')).toMatchObject({ position_x: 0.25, comment: 'Soigné' });
    expect(await localRow('tp_templates', 'modele-1')).toMatchObject({ level: '3e' });
    for (const table of ['events', 'class_group_members', 'stamps', 'session_group_members', 'local_student_mapping']) {
      expect(await localCount(table)).toBe(1);
    }
  });

  // BOGUE (migrations.ts, migrations 7 et 13 : `DROP TABLE students`). Pour changer une colonne
  // de `students`, ces migrations recréent la table : copie, DROP, renommage. Or les clés
  // étrangères sont actives (client.ts) et DROP TABLE commence par vider la table : dès qu'un
  // événement, une carte ou un membre de groupe référence un élève, SQLite refuse (« FOREIGN KEY
  // constraint failed »), la migration est annulée et `initializeDatabase` échoue à chaque
  // lancement. Sans effet sur une installation neuve (la table est vide quand elles passent) ni
  // sur un téléphone déjà en version 13 ou plus ; mais un téléphone resté en version 12 ou moins
  // ne peut plus ouvrir sa base, et toute future migration écrite sur ce modèle échouerait sur
  // tous les téléphones qui ont des données. On rejoue ici la 13 sur une base remplie.
  it.failing('la migration 13 passe sur un téléphone qui a déjà des élèves et des événements', async () => {
    await seedClassroom();
    await executeSql('UPDATE schema_version SET version = 12');

    await initializeDatabase();

    expect(await schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await localCount('students')).toBe(2);
    expect(await localCount('events')).toBe(1);
  });

  it('quand la migration 13 échoue, elle est annulée en entier : aucune donnée perdue, version inchangée', async () => {
    await seedClassroom();
    const before = await schemaDump();
    await executeSql('UPDATE schema_version SET version = 12');

    await expect(initializeDatabase()).rejects.toThrow(/FOREIGN KEY constraint failed/);

    expect(await schemaVersion()).toBe(12);
    expect(await schemaDump()).toEqual(before);
    expect(await localRow('students', 'eleve-1')).toMatchObject({ pseudo: 'Lina Bo', has_pap: 1 });
    expect(await localCount('events')).toBe(1);
    expect(await foreignKeyViolations()).toEqual([]);
  });

  it('une migration interrompue avant son numéro de version reprend au lancement suivant', async () => {
    // État d'un téléphone dont la migration 19 a créé ses colonnes sans avoir pu noter la version.
    await seedClassroom();
    await executeSql('UPDATE schema_version SET version = 18');
    await executeSql('DROP TABLE group_session_photos');

    await initializeDatabase();

    expect(await schemaVersion()).toBe(SCHEMA_VERSION);
    expect(await localCount('group_session_photos')).toBe(0);
    expect(await localRow('session_groups', 'ilot-1')).toMatchObject({ position_x: 0.25 });
  });
});
