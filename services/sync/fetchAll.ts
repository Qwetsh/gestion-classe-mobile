/**
 * Lecture complète d'une table Supabase, page par page.
 *
 * Supabase ne rend que 1 000 lignes par requête. Sans pagination, la réception recevait une liste
 * tronquée, et pour certaines tables (tampons, cartes, élèves, membres de groupe) elle effaçait
 * ensuite sur le téléphone ce qui manquait à cette liste. La requête de chaque page doit être triée
 * (`.order('id')`) pour que les pages se suivent sans trou ni doublon.
 */

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export const PAGE_SIZE = 1000;
/** Taille des paquets pour un filtre `.in()` : l'adresse de la requête reste courte. */
export const IN_CHUNK = 200;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE
): Promise<PageResult<T>> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return { data: all, error: null };
  }
}

/** Même chose pour un filtre `.in(colonne, ids)` : les ids sont envoyés par paquets. */
export async function fetchAllRowsIn<T>(
  ids: string[],
  page: (chunk: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
  chunkSize = IN_CHUNK,
  pageSize = PAGE_SIZE
): Promise<PageResult<T>> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const res = await fetchAllRows<T>((from, to) => page(chunk, from, to), pageSize);
    if (res.error) return res;
    all.push(...(res.data ?? []));
  }
  return { data: all, error: null };
}
