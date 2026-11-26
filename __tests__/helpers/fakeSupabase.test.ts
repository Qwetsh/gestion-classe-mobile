/**
 * Le faux serveur est lui-même vérifié : les tests de synchro ne valent que s'il filtre, trie,
 * limite et refuse comme le vrai.
 */
import { FakeSupabaseServer } from './fakeSupabase';

function serverWithStudents(count: number): FakeSupabaseServer {
  const server = new FakeSupabaseServer();
  server.seed('students', Array.from({ length: count }, (_, i) => ({
    id: `eleve-${String(i).padStart(4, '0')}`,
    user_id: i % 2 === 0 ? 'prof-a' : 'prof-b',
    class_id: `classe-${i % 3}`,
    pseudo: 'Lina Bo',
  })));
  return server;
}

describe('lecture', () => {
  it('ne rend jamais plus de 1 000 lignes, même sans limite demandée, et sans erreur', async () => {
    const server = serverWithStudents(1500);

    const { data, error } = await server.client.from('students').select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
  });

  it('applique eq, in, gt, le tri et la limite', async () => {
    const server = serverWithStudents(30);

    const { data } = await server.client
      .from('students')
      .select('id, class_id')
      .eq('user_id', 'prof-a')
      .in('class_id', ['classe-0', 'classe-1'])
      .gt('id', 'eleve-0004')
      .order('id', { ascending: true })
      .limit(3);

    expect(data).toEqual([
      { id: 'eleve-0006', class_id: 'classe-0' },
      { id: 'eleve-0010', class_id: 'classe-1' },
      { id: 'eleve-0012', class_id: 'classe-0' },
    ]);
  });

  it('ne rend que les colonnes demandées, et des copies (le serveur ne peut pas être modifié par mégarde)', async () => {
    const server = serverWithStudents(1);

    const { data } = await server.client.from('students').select('id, pseudo');
    data[0].pseudo = 'modifié';

    expect(Object.keys(data[0])).toEqual(['id', 'pseudo']);
    expect(server.find('students', 'eleve-0000')).toMatchObject({ pseudo: 'Lina Bo' });
  });

  it('single exige exactement une ligne, maybeSingle accepte zéro', async () => {
    const server = serverWithStudents(2);
    const none = () => server.client.from('students').select('id').eq('id', 'absent');

    expect((await none().single()).error).toMatchObject({ code: 'PGRST116' });
    expect(await none().maybeSingle()).toEqual({ data: null, error: null });
    expect((await server.client.from('students').select('id').eq('id', 'eleve-0001').single()).data).toEqual({ id: 'eleve-0001' });
    expect((await server.client.from('students').select('id').maybeSingle()).error).toMatchObject({ code: 'PGRST116' });
  });

  it('refuse une liste .in() trop longue quand une taille maximale est fixée', async () => {
    const server = serverWithStudents(5);
    server.maxInValues = 2;

    const { data, error } = await server.client.from('students').select('id').in('class_id', ['a', 'b', 'c']);

    expect(data).toBeNull();
    expect(error).toMatchObject({ message: 'URI too long' });
  });
});

describe('écriture', () => {
  it('upsert crée, puis met à jour sur la clé de conflit', async () => {
    const server = new FakeSupabaseServer();

    await server.client.from('classes').upsert([{ id: 'c1', name: '5A' }], { onConflict: 'id' });
    await server.client.from('classes').upsert([{ id: 'c1', name: '5B' }, { id: 'c2', name: '4C' }], { onConflict: 'id' });

    expect(server.rows('classes')).toEqual([{ id: 'c1', name: '5B' }, { id: 'c2', name: '4C' }]);
  });

  it('upsert sur une clé composée réécrit toutes les colonnes envoyées, identifiant compris', async () => {
    const server = new FakeSupabaseServer();
    server.unique('membres', ['group_id', 'student_id']);
    server.seed('membres', [{ id: 'serveur', group_id: 'g', student_id: 's' }]);

    const { data } = await server.client
      .from('membres')
      .upsert([{ id: 'local', group_id: 'g', student_id: 's' }], { onConflict: 'group_id,student_id' })
      .select('id');

    expect(data).toEqual([{ id: 'local' }]);
    expect(server.ids('membres')).toEqual(['local']);
  });

  it('ignoreDuplicates laisse en place la ligne existante', async () => {
    const server = new FakeSupabaseServer();
    server.seed('cartes', [{ id: 'k1', status: 'completed' }]);

    const { error } = await server.client.from('cartes').upsert({ id: 'k1', status: 'active' }, { onConflict: 'id', ignoreDuplicates: true });

    expect(error).toBeNull();
    expect(server.find('cartes', 'k1')).toMatchObject({ status: 'completed' });
  });

  it('refuse une violation de contrainte UNIQUE (23505) et n’écrit alors aucune ligne de l’envoi', async () => {
    const server = new FakeSupabaseServer();
    server.unique('cartes', ['student_id', 'card_number']);
    server.seed('cartes', [{ id: 'k1', student_id: 's1', card_number: 1 }]);

    const { error } = await server.client.from('cartes').upsert(
      [{ id: 'k2', student_id: 's2', card_number: 1 }, { id: 'k3', student_id: 's1', card_number: 1 }],
      { onConflict: 'id' },
    );

    expect(error).toMatchObject({ code: '23505' });
    expect(server.ids('cartes')).toEqual(['k1']);
  });

  it('refuse une clé étrangère sans parent (23503)', async () => {
    const server = new FakeSupabaseServer();
    server.foreignKey('students', 'class_id', 'classes');

    const { error } = await server.client.from('students').insert([{ id: 's1', class_id: 'absente' }]);

    expect(error).toMatchObject({ code: '23503' });
    expect(server.ids('students')).toEqual([]);
  });

  it('insert refuse un identifiant déjà pris', async () => {
    const server = new FakeSupabaseServer();
    server.seed('classes', [{ id: 'c1' }]);

    expect((await server.client.from('classes').insert({ id: 'c1' })).error).toMatchObject({ code: '23505' });
  });

  it('une écriture sans .select() ne rend pas de lignes', async () => {
    const server = new FakeSupabaseServer();

    expect(await server.client.from('classes').upsert({ id: 'c1' })).toEqual({ data: null, error: null });
  });

  it('update et delete ne touchent que les lignes filtrées ; delete applique les cascades déclarées', async () => {
    const server = new FakeSupabaseServer();
    server.foreignKey('students', 'class_id', 'classes');
    server.foreignKey('sessions', 'group_id', 'groupes', 'set null');
    server.seed('classes', [{ id: 'c1', name: '5A' }, { id: 'c2', name: '4C' }]);
    server.seed('students', [{ id: 's1', class_id: 'c1' }, { id: 's2', class_id: 'c2' }]);
    server.seed('groupes', [{ id: 'g1' }]);
    server.seed('sessions', [{ id: 'x1', group_id: 'g1' }]);

    await server.client.from('classes').update({ name: '5A SVT' }).eq('id', 'c1');
    await server.client.from('classes').delete().eq('id', 'c2');
    await server.client.from('groupes').delete().eq('id', 'g1');

    expect(server.rows('classes')).toEqual([{ id: 'c1', name: '5A SVT' }]);
    expect(server.ids('students')).toEqual(['s1']);
    expect(server.find('sessions', 'x1')).toEqual({ id: 'x1', group_id: null });
  });
});

describe('pannes programmées et journal', () => {
  it('échoue sur la table et l’opération visées, le nombre de fois demandé, sans rien écrire', async () => {
    const server = new FakeSupabaseServer();
    server.failOn({ table: 'classes', operation: 'upsert', message: 'coupure', times: 1 });

    const first = await server.client.from('classes').upsert({ id: 'c1' });
    const read = await server.client.from('classes').select('id');
    const second = await server.client.from('classes').upsert({ id: 'c1' });

    expect(first).toEqual({ data: null, error: { message: 'coupure', code: '' } });
    expect(read).toEqual({ data: [], error: null });
    expect(second.error).toBeNull();
    expect(server.ids('classes')).toEqual(['c1']);
  });

  it('peut laisser passer les premières requêtes (coupure en cours de lecture)', async () => {
    const server = serverWithStudents(3);
    server.failOn({ table: 'students', operation: 'select', after: 1 });

    expect((await server.client.from('students').select('id')).error).toBeNull();
    expect((await server.client.from('students').select('id')).error).not.toBeNull();
  });

  it('note chaque requête reçue', async () => {
    const server = serverWithStudents(3);

    await server.client.from('students').select('id').in('class_id', ['classe-0']).limit(2);
    await server.client.from('students').upsert([{ id: 'n1' }, { id: 'n2' }]);

    expect(server.requests).toEqual([
      expect.objectContaining({ table: 'students', operation: 'select', limit: 2, returned: 1, failed: false }),
      expect.objectContaining({ table: 'students', operation: 'upsert', sent: 2 }),
    ]);
  });
});
