/**
 * La synchro complète telle que l'app la lance (stores/syncStore.ts) : téléchargement, puis envoi.
 */
jest.mock('expo-sqlite', () => require('../helpers/expoSqliteNode'));
jest.mock('../../services/supabase', () => require('../helpers/fakeSupabase').mockSupabaseModule());
jest.mock('../../services/photos/tpPhotos', () => ({ uploadTpPhotoFile: jest.fn(async () => true) }));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));

import { createEvent } from '../../services/database/eventRepository';
import { useSyncStore } from '../../stores/syncStore';
import {
  USER,
  localCount,
  localIds,
  seedServerClassroom,
  serverStudent,
  useSyncTestEnvironment,
} from '../helpers/syncHarness';

const server = useSyncTestEnvironment();

beforeEach(async () => {
  useSyncStore.setState({ isSyncing: false, lastSyncResult: null, unsyncedCount: 0, error: null });
  seedServerClassroom(server);
  await useSyncStore.getState().sync(USER);
});

it('reçoit ce qui est nouveau sur le serveur et envoie ce qui attend sur le téléphone, en une fois', async () => {
  server.seed('students', [serverStudent('eleve-3', 'classe-1', 'Iris Ka')]);
  const event = await createEvent('seance-1', 'eleve-2', 'participation');

  const result = await useSyncStore.getState().sync(USER);

  expect(result).toMatchObject({ success: true, errors: [], eventsSync: 1 });
  expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2', 'eleve-3']);
  expect(server.find('events', event.id)).toMatchObject({ student_id: 'eleve-2' });
  expect(useSyncStore.getState()).toMatchObject({ isSyncing: false, unsyncedCount: 0, error: null });
});

it('un téléchargement en erreur n’empêche pas l’envoi, et ne supprime rien', async () => {
  const event = await createEvent('seance-1', 'eleve-2', 'participation');
  for (const table of ['classes', 'students', 'rooms', 'sessions', 'events', 'stamp_cards']) {
    server.failOn({ table, operation: 'select', message: 'coupure', times: 1 });
  }

  const result = await useSyncStore.getState().sync(USER);

  expect(result.eventsSync).toBe(1);
  expect(server.find('events', event.id)).toBeDefined();
  expect(await localIds('classes')).toEqual(['classe-1']);
  expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2']);
  expect(await localCount('events')).toBe(2);
});

it('le compteur « en attente » dit ce qui n’a pas pu partir', async () => {
  await createEvent('seance-1', 'eleve-1', 'participation');
  await createEvent('seance-1', 'eleve-2', 'bavardage');
  server.failOn({ table: 'events', operation: 'upsert', message: 'délai dépassé' });

  const result = await useSyncStore.getState().sync(USER);

  expect(result.success).toBe(false);
  expect(useSyncStore.getState()).toMatchObject({ unsyncedCount: 2, error: 'Events: délai dépassé' });
});

// BOGUE (stores/syncStore.ts, `sync` : `await withTimeout(pullFromServer(userId), …)`). Le
// résultat du téléchargement est jeté : seules les exceptions comptent, or `pullFromServer` n'en
// lève pas, il range ses erreurs dans `errors`. Une lecture impossible, ou l'arrêt du
// téléchargement sur une erreur SQLite (voir pull.sqlite.test.ts, salle supprimée), ne se voit
// donc nulle part : la synchro s'affiche réussie alors que le téléphone n'a pas reçu ce qui a
// changé sur le serveur.
it.failing('une erreur de téléchargement apparaît dans le résultat de la synchro', async () => {
  server.seed('students', [serverStudent('eleve-3', 'classe-1', 'Iris Ka')]);
  server.failOn({ table: 'students', operation: 'select', message: 'coupure' });

  const result = await useSyncStore.getState().sync(USER);

  expect(await localIds('students')).toEqual(['eleve-1', 'eleve-2']);
  expect(result.success).toBe(false);
  expect(result.errors).toContain('Students: coupure');
});
