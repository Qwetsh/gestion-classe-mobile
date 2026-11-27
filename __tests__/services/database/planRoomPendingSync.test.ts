/**
 * Une retouche faite sur le téléphone (plan de classe, salle) doit être marquée « à envoyer »
 * (synced_at = NULL) : sinon elle ne part jamais au serveur et la synchronisation suivante
 * la remplace par la version du site.
 */

import * as dbClient from '../../../services/database/client';
import { removeStudentFromPlan, setStudentPosition, updatePositions } from '../../../services/database/classRoomPlanRepository';
import { updateRoom, updateRoomGrid } from '../../../services/database/roomRepository';

jest.mock('../../../services/database/client', () => ({
  executeSql: jest.fn(),
  queryAll: jest.fn(),
  queryFirst: jest.fn(),
  executeTransaction: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-test'),
}));

const mockDb = dbClient as jest.Mocked<typeof dbClient>;

const planRow = {
  id: 'plan-1', class_id: 'class-1', room_id: 'room-1',
  positions: '{"0-0":"s1"}', created_at: '2026-11-01T00:00:00Z',
  updated_at: null, synced_at: '2026-11-02T00:00:00Z',
};

function planUpdates(): string[] {
  return mockDb.executeSql.mock.calls
    .map(c => String(c[0]))
    .filter(sql => sql.startsWith('UPDATE class_room_plans'));
}

describe('plan de classe retouché sur le téléphone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue(planRow);
  });

  it('updatePositions marque le plan à envoyer', async () => {
    await updatePositions('class-1', 'room-1', { '1-1': 's2' });
    expect(planUpdates()).toHaveLength(1);
    expect(planUpdates()[0]).toContain('synced_at = NULL');
  });

  it('placer un élève marque le plan à envoyer', async () => {
    await setStudentPosition('class-1', 'room-1', 's1', 2, 3);
    expect(planUpdates()[0]).toContain('synced_at = NULL');
  });

  it('retirer un élève marque le plan à envoyer', async () => {
    await removeStudentFromPlan('class-1', 'room-1', 's1');
    expect(planUpdates()[0]).toContain('synced_at = NULL');
  });
});

describe('salle retouchée sur le téléphone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.executeSql.mockResolvedValue({ changes: 1, lastInsertRowId: 1 });
    mockDb.queryFirst.mockResolvedValue(null);
  });

  it('renommer la salle la marque à envoyer', async () => {
    await updateRoom('room-1', 'Salle B12');
    expect(String(mockDb.executeSql.mock.calls[0][0])).toContain('synced_at = NULL');
  });

  it('changer la grille la marque à envoyer', async () => {
    await updateRoomGrid('room-1', 6, 8);
    expect(String(mockDb.executeSql.mock.calls[0][0])).toContain('synced_at = NULL');
  });
});
