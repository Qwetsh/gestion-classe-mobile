/**
 * Outils communs aux tests de synchro sur vraie base SQLite.
 *
 * Chaque fichier de test pose lui-même ses remplaçants (jest.mock doit être dans le fichier) :
 *
 *   jest.mock('expo-sqlite', () => require('../../helpers/expoSqliteNode'));
 *   jest.mock('../../../services/supabase', () => require('../../helpers/fakeSupabase').mockSupabaseModule());
 *   jest.mock('../../../services/photos/tpPhotos', () => ({ uploadTpPhotoFile: jest.fn(async () => true) }));
 *   jest.mock('@react-native-community/netinfo', () => ({ __esModule: true, default: { fetch: jest.fn(), addEventListener: jest.fn() } }));
 *
 * puis appelle `useSyncTestEnvironment()` une fois : base locale neuve (créée par l'app elle-même,
 * `initializeDatabase`), serveur vide avec les contraintes du vrai, horloge maîtrisée.
 */
import { closeDatabase, getDatabase, queryAll, queryFirst } from '../../services/database/client';
import { initializeDatabase } from '../../services/database/migrations';
import { useNetworkStore } from '../../stores/networkStore';
import { __deleteAllDatabases } from './expoSqliteNode';
import { fakeServer, type FakeSupabaseServer, type ServerRow } from './fakeSupabase';

/** Compte enseignant fictif. */
export const USER = 'prof-test';
/** Un autre compte, pour vérifier qu'on ne touche pas à ses données. */
export const OTHER_USER = 'prof-autre';

const START = Date.parse('2026-09-07T08:00:00.000Z');

/**
 * Contraintes du serveur dont la synchro dépend (relevées dans supabase-schema.sql et les
 * migrations du dépôt web : 008, 011, 037, 049, v8, v9).
 */
export function declareServerConstraints(server: FakeSupabaseServer): void {
  server.foreignKey('students', 'class_id', 'classes');
  server.foreignKey('class_room_plans', 'class_id', 'classes');
  server.foreignKey('class_room_plans', 'room_id', 'rooms');
  server.unique('class_room_plans', ['class_id', 'room_id']);
  server.foreignKey('sessions', 'class_id', 'classes');
  server.foreignKey('sessions', 'room_id', 'rooms');
  server.foreignKey('sessions', 'group_id', 'class_groups', 'set null');
  server.foreignKey('events', 'session_id', 'sessions');
  server.foreignKey('events', 'student_id', 'students');

  server.foreignKey('class_groups', 'class_id', 'classes');
  server.foreignKey('class_group_members', 'group_id', 'class_groups');
  server.foreignKey('class_group_members', 'student_id', 'students');
  server.unique('class_group_members', ['group_id', 'student_id']);
  server.foreignKey('class_group_plans', 'group_id', 'class_groups');
  server.foreignKey('class_group_plans', 'room_id', 'rooms');
  server.unique('class_group_plans', ['class_id', 'room_id', 'group_id']);

  server.foreignKey('group_sessions', 'class_id', 'classes');
  server.foreignKey('grading_criteria', 'session_id', 'group_sessions');
  server.foreignKey('session_groups', 'session_id', 'group_sessions');
  server.foreignKey('session_group_members', 'group_id', 'session_groups');
  server.foreignKey('session_group_members', 'student_id', 'students');
  server.unique('session_group_members', ['group_id', 'student_id']);
  server.foreignKey('group_grades', 'group_id', 'session_groups');
  server.foreignKey('group_grades', 'criteria_id', 'grading_criteria');
  server.unique('group_grades', ['group_id', 'criteria_id']);
  server.foreignKey('tp_template_criteria', 'template_id', 'tp_templates');

  server.unique('stamp_categories', ['user_id', 'label']);
  server.unique('bonuses', ['user_id', 'label']);
  server.foreignKey('stamp_cards', 'student_id', 'students');
  server.unique('stamp_cards', ['student_id', 'card_number']);
  server.foreignKey('stamps', 'card_id', 'stamp_cards');
  server.foreignKey('stamps', 'student_id', 'students');
  server.foreignKey('stamps', 'category_id', 'stamp_categories', 'set null');
  server.unique('stamps', ['card_id', 'slot_number']);
  server.foreignKey('bonus_selections', 'card_id', 'stamp_cards');
  server.foreignKey('bonus_selections', 'bonus_id', 'bonuses', 'set null');
  server.foreignKey('bonus_selections', 'student_id', 'students');
  server.unique('bonus_selections', ['card_id']);
}

/** Avance l'horloge des tests (les `new Date()` de l'app), sans toucher aux minuteries. */
export function advanceClock(ms = 1000): void {
  jest.setSystemTime(Date.now() + ms);
}

/** Dit à l'app si le réseau est joignable (`null` : pas encore su, comme au lancement). */
export function setOnline(online: boolean | null): void {
  useNetworkStore.setState({ isConnected: online, isInternetReachable: online });
}

/**
 * À appeler une fois par fichier de test, au niveau du `describe` racine.
 * Rend le faux serveur.
 */
export function useSyncTestEnvironment(): FakeSupabaseServer {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const realFetch = globalThis.fetch;

  beforeEach(async () => {
    // Seule l'horloge est simulée : les promesses et minuteries restent réelles.
    jest.useFakeTimers({
      now: START,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame',
        'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'setImmediate',
        'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
      ],
    });
    // La synchro journalise chaque erreur simulée : on garde la sortie des tests lisible.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Ceinture et bretelles : un appel réseau réel ferait échouer le test.
    globalThis.fetch = (() => {
      throw new Error('Appel réseau interdit dans les tests de synchro');
    }) as typeof fetch;

    fakeServer.reset();
    declareServerConstraints(fakeServer);
    setOnline(true);
    await initializeDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
    __deleteAllDatabases();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    globalThis.fetch = realFetch;
    jest.useRealTimers();
  });

  return fakeServer;
}

// ---------------------------------------------------------------------------------------------
// Lecture de la base locale
// ---------------------------------------------------------------------------------------------

type LocalValue = string | number | null;
export type LocalRow = Record<string, LocalValue>;

export async function localRows(table: string, where = '1 = 1', params: LocalValue[] = []): Promise<LocalRow[]> {
  return queryAll<LocalRow>(`SELECT * FROM ${table} WHERE ${where} ORDER BY 1`, params);
}

export async function localRow(table: string, id: string): Promise<LocalRow | null> {
  return queryFirst<LocalRow>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

export async function localCount(table: string, where = '1 = 1', params: LocalValue[] = []): Promise<number> {
  const row = await queryFirst<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, params);
  return row?.n ?? 0;
}

export async function localIds(table: string, where = '1 = 1', params: LocalValue[] = []): Promise<string[]> {
  const rows = await queryAll<{ id: string }>(`SELECT id FROM ${table} WHERE ${where} ORDER BY id`, params);
  return rows.map((r) => r.id);
}

/** Écrit une ligne locale telle quelle (pour poser un état de départ précis). */
export async function insertLocal(table: string, row: LocalRow): Promise<void> {
  const columns = Object.keys(row);
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map((c) => row[c]),
  );
}

/** Lignes qui violent une clé étrangère locale (doit rester vide). */
export async function foreignKeyViolations(): Promise<unknown[]> {
  return queryAll('PRAGMA foreign_key_check');
}

// ---------------------------------------------------------------------------------------------
// Lignes du serveur (données fictives : un élève est un prénom et deux lettres)
// ---------------------------------------------------------------------------------------------

const T0 = '2026-09-01T07:00:00.000Z';

export function serverClass(id: string, name: string, over: ServerRow = {}): ServerRow {
  return { id, user_id: USER, name, created_at: T0, updated_at: T0, ...over };
}

export function serverStudent(id: string, classId: string | null, pseudo: string, over: ServerRow = {}): ServerRow {
  return {
    id, user_id: USER, class_id: classId, pseudo, created_at: T0,
    has_pap: false, has_ppre: false, has_pai: false, ...over,
  };
}

export function serverRoom(id: string, name: string, over: ServerRow = {}): ServerRow {
  return { id, user_id: USER, name, grid_rows: 6, grid_cols: 5, disabled_cells: [], created_at: T0, ...over };
}

export function serverSession(id: string, classId: string, roomId: string, over: ServerRow = {}): ServerRow {
  return {
    id, user_id: USER, class_id: classId, room_id: roomId, topic: null, notes: null,
    started_at: '2026-09-02T08:00:00.000Z', ended_at: '2026-09-02T08:55:00.000Z', group_id: null, ...over,
  };
}

export function serverEvent(id: string, sessionId: string, studentId: string, over: ServerRow = {}): ServerRow {
  return {
    id, session_id: sessionId, student_id: studentId, type: 'participation', subtype: null,
    note: null, photo_path: null, timestamp: '2026-09-02T08:10:00.000Z', ...over,
  };
}

export function serverClassGroup(id: string, classId: string, name: string, over: ServerRow = {}): ServerRow {
  return {
    id, user_id: USER, class_id: classId, name, color: null, sort_order: 0,
    created_at: T0, updated_at: null, ...over,
  };
}

export function serverStampCard(id: string, studentId: string, cardNumber = 1, over: ServerRow = {}): ServerRow {
  return {
    id, user_id: USER, student_id: studentId, card_number: cardNumber, status: 'active',
    completed_at: null, created_at: T0, ...over,
  };
}

export function serverStamp(id: string, cardId: string, studentId: string, slot: number, over: ServerRow = {}): ServerRow {
  return {
    id, user_id: USER, card_id: cardId, student_id: studentId, category_id: null,
    slot_number: slot, awarded_at: '2026-09-02T08:20:00.000Z', ...over,
  };
}

/** Identifiant à largeur fixe, pour que l'ordre du serveur soit prévisible : `eleve-000042`. */
export function numberedId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

const FIRST_NAMES = ['Lina', 'Noé', 'Iris', 'Tom', 'Maya', 'Hugo', 'Zoé', 'Sami', 'Jade', 'Axel'];

/** Pseudonyme fictif au format de l'app : un prénom et deux lettres (« Lina Bo »). */
export function fakePseudo(n: number): string {
  const first = String.fromCharCode(65 + (Math.floor(n / FIRST_NAMES.length) % 26));
  const second = String.fromCharCode(97 + (Math.floor(n / (FIRST_NAMES.length * 26)) % 26));
  return `${FIRST_NAMES[n % FIRST_NAMES.length]} ${first}${second}`;
}

/**
 * Une petite classe déjà en ligne : la 5A, le Labo 1, deux élèves, une séance terminée et une
 * participation de Lina Bo.
 */
export function seedServerClassroom(server: FakeSupabaseServer): void {
  server.seed('classes', [serverClass('classe-1', '5A')]);
  server.seed('rooms', [serverRoom('salle-1', 'Labo 1')]);
  server.seed('students', [
    serverStudent('eleve-1', 'classe-1', 'Lina Bo'),
    serverStudent('eleve-2', 'classe-1', 'Noé Ma'),
  ]);
  server.seed('sessions', [serverSession('seance-1', 'classe-1', 'salle-1')]);
  server.seed('events', [serverEvent('evt-1', 'seance-1', 'eleve-1')]);
}
