import { executeSql, executeTransaction, queryFirst } from './client';

export type LocalRow = Record<string, string | number | null>;

/**
 * Écrit une ligne venue du serveur en local : UPDATE si elle existe, INSERT sinon.
 * Jamais d'INSERT OR REPLACE : sur une table parente (stamp_cards), REPLACE = DELETE + INSERT
 * et le DELETE cascade sur les enfants (stamps, bonus_selections), ce qui détruisait
 * à chaque pull les tampons locaux pas encore poussés (voir AUDIT_RECOMPENSES.md, A0).
 * `table` est toujours une constante du code, jamais une valeur externe.
 */
export async function upsertLocalRow(table: string, row: LocalRow): Promise<void> {
  const cols = Object.keys(row).filter(c => c !== 'id');
  const exists = await queryFirst<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [row.id as string]);
  if (exists) {
    await executeSql(
      `UPDATE ${table} SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map(c => row[c]), row.id]
    );
  } else {
    const all = ['id', ...cols];
    await executeSql(
      `INSERT INTO ${table} (${all.join(', ')}) VALUES (${all.map(() => '?').join(', ')})`,
      all.map(c => row[c])
    );
  }
}

/**
 * Fait pointer une carte locale (et ses tampons / choix de bonus) vers l'UUID serveur.
 * Cas : la même carte (élève, numéro) a été créée des deux côtés avec des UUID différents.
 * On change l'id en place (clés étrangères différées) : pas de DELETE, donc pas de cascade.
 */
export async function remapLocalCard(localId: string, serverId: string): Promise<void> {
  if (localId === serverId) return;
  await executeTransaction([
    { sql: 'PRAGMA defer_foreign_keys = ON' },
    { sql: 'UPDATE stamp_cards SET id = ? WHERE id = ?', params: [serverId, localId] },
    { sql: 'UPDATE stamps SET card_id = ? WHERE card_id = ?', params: [serverId, localId] },
    { sql: 'UPDATE bonus_selections SET card_id = ? WHERE card_id = ?', params: [serverId, localId] },
  ]);
  console.log(`[localUpsert] Remapped stamp_card ${localId} -> ${serverId}`);
}
