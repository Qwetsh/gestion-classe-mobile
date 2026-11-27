import { fetchAllRows, fetchAllRowsIn } from '../../services/sync/fetchAll';

/** Table simulée : renvoie la tranche [from, to] des lignes, comme `.range()`. */
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));
  const calls: [number, number][] = [];
  const page = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { page, calls };
}

describe('fetchAllRows', () => {
  it('lit toutes les lignes au-delà d’une page', async () => {
    const t = table(2500);
    const res = await fetchAllRows(t.page, 1000);
    expect(res.data).toHaveLength(2500);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('fait une seule requête quand tout tient dans une page', async () => {
    const t = table(10);
    const res = await fetchAllRows(t.page, 1000);
    expect(res.data).toHaveLength(10);
    expect(t.calls).toHaveLength(1);
  });

  it('demande une page de plus quand le compte tombe juste', async () => {
    const t = table(1000);
    const res = await fetchAllRows(t.page, 1000);
    expect(res.data).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it('rend l’erreur sans données partielles', async () => {
    let n = 0;
    const res = await fetchAllRows(() => {
      n++;
      return Promise.resolve(n === 1
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: 'réseau' } });
    }, 1000);
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('réseau');
  });
});

describe('fetchAllRowsIn', () => {
  it('découpe les ids en paquets et rassemble les lignes', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `s${i}`);
    const chunks: number[] = [];
    const res = await fetchAllRowsIn(ids, (chunk) => {
      chunks.push(chunk.length);
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
    }, 200);
    expect(chunks).toEqual([200, 200, 50]);
    expect(res.data).toHaveLength(450);
  });

  it('ne fait aucune requête sans ids', async () => {
    const res = await fetchAllRowsIn([], () => { throw new Error('appel inattendu'); });
    expect(res.data).toEqual([]);
  });
});
