/**
 * Les commandes venues de l'écran projeté (« +1 tampon », tirage du tableau) doivent arriver
 * au téléphone : avant, le canal ne faisait qu'émettre.
 */
type BroadcastHandler = (msg: { payload: unknown }) => void;

const handlers: BroadcastHandler[] = [];
interface FakeChannel {
  on: jest.Mock;
  subscribe: jest.Mock;
  send: jest.Mock;
}
const fakeChannel: FakeChannel = {
  on: jest.fn((_type: string, _filter: unknown, cb: BroadcastHandler): FakeChannel => { handlers.push(cb); return fakeChannel; }),
  subscribe: jest.fn((): FakeChannel => fakeChannel),
  send: jest.fn(async () => 'ok'),
};

jest.mock('../../services/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    channel: jest.fn(() => fakeChannel),
    removeChannel: jest.fn(),
  },
}));

import { connectClassroomChannel, disconnectClassroomChannel, onClassroomCommand } from '../../services/sync/classroomChannel';

describe('classroomChannel', () => {
  afterEach(() => { disconnectClassroomChannel(); handlers.length = 0; jest.clearAllMocks(); });

  it('écoute les commandes avant de rejoindre le canal', () => {
    connectClassroomChannel('session-1');
    expect(fakeChannel.on).toHaveBeenCalledWith('broadcast', { event: 'cmd' }, expect.any(Function));
    expect(fakeChannel.on.mock.invocationCallOrder[0]).toBeLessThan(fakeChannel.subscribe.mock.invocationCallOrder[0]);
  });

  it('transmet « +1 tampon » du tableau aux écouteurs, et plus après désabonnement', () => {
    const received: unknown[] = [];
    const stop = onClassroomCommand((cmd) => received.push(cmd));
    connectClassroomChannel('session-2');
    handlers[0]({ payload: { kind: 'stamp', studentId: 's1', source: 'board' } });
    expect(received).toEqual([{ kind: 'stamp', studentId: 's1', source: 'board' }]);
    stop();
    handlers[0]({ payload: { kind: 'pick', studentId: 's2', source: 'board' } });
    expect(received).toHaveLength(1);
  });
});
