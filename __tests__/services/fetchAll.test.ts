import { selectAll, selectAllIn, type PageableQuery, type SyncQueryResult } from '../../services/sync/fetchAll';

/**
 * La synchro supprime du téléphone ce qui est absent de la réponse du serveur. Une lecture
 * tronquée à 1 000 lignes effacerait donc des données valides : ces tests tiennent la lecture
 * complète, et le refus de rendre une liste partielle.
 */

const SERVER_CAP = 1000;

interface Row {
  id: string;
  parent: string;
}

interface Call {
  after: string | null;
  limit: number;
  parents: string[] | null;
}

/** Faux serveur : applique filtre, tri, « après tel identifiant », limite, et son propre plafond. */
function fakeServer(rows: Row[], options: { failAtCall?: number } = {}) {
  const calls: Call[] = [];
  const table = { rows };
  const query = (parents: string[] | null = null): PageableQuery<Row> => {
    let after: string | null = null;
    const api: PageableQuery<Row> = {
      gt: (_column, value) => { after = value; return api; },
      order: () => ({
        limit: (count: number) => {
          calls.push({ after, limit: count, parents });
          const result: SyncQueryResult<Row> = options.failAtCall === calls.length
            ? { data: null, error: { message: 'coupure' } }
            : {
              data: table.rows
                .filter((r) => (parents === null || parents.includes(r.parent)) && (after === null || r.id > after))
                .sort((a, b) => (a.id < b.id ? -1 : 1))
                .slice(0, Math.min(count, SERVER_CAP)),
              error: null,
            };
          return Promise.resolve(result);
        },
      }),
    };
    return api;
  };
  return { query, calls, table };
}

function makeRows(count: number, parentCount = 1): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${String(i).padStart(6, '0')}`,
    parent: `p-${i % parentCount}`,
  }));
}

describe('selectAll', () => {
  it('ramène toutes les lignes au-delà du plafond de 1 000', async () => {
    const server = fakeServer(makeRows(2600));
    const { data, error } = await selectAll(() => server.query());
    expect(error).toBeNull();
    expect(data).toHaveLength(2600);
    expect(new Set(data!.map((r) => r.id)).size).toBe(2600);
    expect(server.calls.map((c) => c.after)).toEqual([null, 'id-000999', 'id-001999']);
  });

  it('demande une page de plus quand la dernière est exactement pleine', async () => {
    const server = fakeServer(makeRows(1000));
    const { data } = await selectAll(() => server.query());
    expect(data).toHaveLength(1000);
    expect(server.calls).toHaveLength(2);
  });

  it('rend une liste vide pour une table vide, en un seul appel', async () => {
    const server = fakeServer([]);
    expect(await selectAll(() => server.query())).toEqual({ data: [], error: null });
    expect(server.calls).toHaveLength(1);
  });

  it('rend l’erreur et aucune ligne quand une page échoue', async () => {
    const server = fakeServer(makeRows(2600), { failAtCall: 2 });
    const { data, error } = await selectAll(() => server.query());
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'coupure' });
  });

  it('ne saute aucune ligne quand le serveur en supprime une pendant la lecture', async () => {
    const rows = makeRows(2500);
    const server = fakeServer(rows);
    let firstPageDone = false;
    const { data } = await selectAll(() => {
      // Après la première page, une ligne déjà lue disparaît du serveur : avec des pages par
      // position, la ligne suivante la limite serait sautée, et effacée du téléphone.
      if (firstPageDone) server.table.rows = rows.filter((r) => r.id !== 'id-000010');
      firstPageDone = true;
      return server.query();
    });
    const ids = new Set(data!.map((r) => r.id));
    expect(ids.has('id-001000')).toBe(true);
    expect(ids.size).toBe(2500);
  });
});

describe('selectAllIn', () => {
  it('passe les identifiants par paquets et réunit les lignes', async () => {
    const server = fakeServer(makeRows(900, 250));
    const parents = Array.from({ length: 250 }, (_, i) => `p-${i}`);
    const { data, error } = await selectAllIn(parents, (chunk) => server.query(chunk));
    expect(error).toBeNull();
    expect(data).toHaveLength(900);
    expect(server.calls.map((c) => c.parents!.length)).toEqual([100, 100, 50]);
  });

  it('lit toutes les pages d’un paquet qui dépasse le plafond', async () => {
    const server = fakeServer(makeRows(3200, 2));
    const { data } = await selectAllIn(['p-0', 'p-1'], (chunk) => server.query(chunk));
    expect(data).toHaveLength(3200);
    expect(server.calls).toHaveLength(4);
  });

  it('ne rend pas deux fois la même ligne quand un identifiant est répété', async () => {
    const server = fakeServer(makeRows(30, 3));
    const { data } = await selectAllIn(['p-0', 'p-1', 'p-0', 'p-2', 'p-1'], (chunk) => server.query(chunk));
    expect(data).toHaveLength(30);
    expect(server.calls[0].parents).toEqual(['p-0', 'p-1', 'p-2']);
  });

  it('ne contacte pas le serveur pour une liste vide', async () => {
    const server = fakeServer(makeRows(10));
    expect(await selectAllIn([], (chunk) => server.query(chunk))).toEqual({ data: [], error: null });
    expect(server.calls).toHaveLength(0);
  });

  it('rend l’erreur et aucune ligne quand un paquet échoue', async () => {
    const server = fakeServer(makeRows(900, 250), { failAtCall: 2 });
    const parents = Array.from({ length: 250 }, (_, i) => `p-${i}`);
    const { data, error } = await selectAllIn(parents, (chunk) => server.query(chunk));
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'coupure' });
  });
});
