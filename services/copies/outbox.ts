import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  documentDirectory,
  makeDirectoryAsync,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  copyAsync,
  deleteAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, isSupabaseConfigured } from '../supabase';
import { BUCKET_NAME, buildCopyPath } from './path';
import {
  isNetworkError,
  pickNext,
  markFailed,
  migrateLegacyQueue,
  cancelPendingUpload,
  type OutboxOp,
  type CopyInfo,
  type CreateAssessmentOp,
  type CopyInfoOp,
  type UploadPageOp,
  type DeletePageOp,
} from './outboxLogic';

/**
 * File d'envoi des copies (persistée sur disque). Garantie : "ne jamais perdre une copie scannée".
 *
 * Chaque page est COPIÉE dans documentDirectory avant toute chose (le cache du scanner peut être
 * purgé par l'OS), puis une opération est ajoutée à `queue.json`. drainOutbox() rejoue les
 * opérations dans l'ordre ; une coupure réseau arrête le vidage sans rien perdre, une erreur
 * propre à une éval bloque seulement cette éval (l'ordre création → pages est préservé).
 * startOutboxDriver() relance le vidage au retour du réseau, au retour au premier plan et
 * à intervalles espacés tant qu'il reste quelque chose.
 */

const QUEUE_DIR = `${documentDirectory}pending_copies/`;
const QUEUE_FILE = `${QUEUE_DIR}queue.json`;

let draining = false;
let cache: OutboxOp[] | null = null;
type OutboxListener = (ops: OutboxOp[], completed: OutboxOp | null) => void;
const listeners = new Set<OutboxListener>();

export interface DrainResult {
  done: number;
  remaining: number;
  offline: boolean;
}

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

export async function readOutbox(): Promise<OutboxOp[]> {
  if (cache) return cache;
  try {
    await ensureDir();
    const info = await getInfoAsync(QUEUE_FILE);
    cache = info.exists ? migrateLegacyQueue(JSON.parse(await readAsStringAsync(QUEUE_FILE))) : [];
  } catch (err) {
    console.error('[CopyOutbox] read failed:', err);
    cache = [];
  }
  return cache;
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Seule façon de modifier la file : les modifications passent l'une après l'autre (sinon une
 * page scannée pendant un envoi pourrait écraser l'opération voisine), et la file en mémoire
 * est à jour avant l'écriture du fichier.
 */
function mutate(
  fn: (ops: OutboxOp[]) => OutboxOp[],
  completed: OutboxOp | null = null
): Promise<OutboxOp[]> {
  const run = chain.then(async () => {
    const next = fn(await readOutbox());
    cache = next;
    await ensureDir();
    await writeAsStringAsync(QUEUE_FILE, JSON.stringify(next));
    for (const l of listeners) l(next, completed);
    return next;
  });
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Abonnement aux changements de la file (compteurs de l'écran de scan). `completed` est
 * l'opération que le serveur vient d'accepter, le cas échéant.
 */
export function subscribeOutbox(listener: OutboxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function base<T extends OutboxOp['kind']>(kind: T, userId: string, assessmentId: string) {
  return {
    kind,
    id: Crypto.randomUUID(),
    userId,
    assessmentId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
}

/** Éval créée sur le téléphone : l'identifiant est généré ici, l'insertion part avec la file. */
export async function enqueueCreateAssessment(params: {
  userId: string;
  classId: string;
  name: string;
  date: string;
  baremeTotal: number;
  sessionId: string | null;
}): Promise<CreateAssessmentOp> {
  const assessmentId = Crypto.randomUUID();
  const op: CreateAssessmentOp = {
    ...base('create_assessment', params.userId, assessmentId),
    classId: params.classId,
    name: params.name,
    date: params.date,
    baremeTotal: params.baremeTotal,
    sessionId: params.sessionId,
  };
  await mutate((ops) => [...ops, op]);
  return op;
}

export async function enqueueCopyInfo(params: {
  userId: string;
  assessmentId: string;
  studentId: string;
  info: CopyInfo;
}): Promise<void> {
  const op: CopyInfoOp = {
    ...base('copy_info', params.userId, params.assessmentId),
    studentId: params.studentId,
    info: params.info,
  };
  await mutate((ops) => [...ops, op]);
}

/**
 * Met en file les pages d'une copie (déjà compressées), dans l'ordre donné, à partir de
 * `firstOrder`. Les fichiers sont copiés dans la file AVANT l'écriture de queue.json.
 */
export async function enqueuePages(params: {
  userId: string;
  assessmentId: string;
  studentId: string;
  firstOrder: number;
  sourceUris: string[];
}): Promise<UploadPageOp[]> {
  await ensureDir();
  const created: UploadPageOp[] = [];
  for (let i = 0; i < params.sourceUris.length; i++) {
    const pageId = Crypto.randomUUID();
    const localPath = `${QUEUE_DIR}${pageId}.jpg`;
    await copyAsync({ from: params.sourceUris[i], to: localPath });
    created.push({
      ...base('upload_page', params.userId, params.assessmentId),
      studentId: params.studentId,
      pageId,
      pageOrder: params.firstOrder + i,
      localPath,
      storagePath: buildCopyPath(params.userId, params.assessmentId, params.studentId, pageId),
    });
  }
  await mutate((ops) => [...ops, ...created]);
  return created;
}

/**
 * Supprime une page : si elle n'est pas encore partie, on l'enlève simplement de la file ;
 * sinon on met en file sa suppression côté serveur.
 */
export async function enqueueDeletePage(params: {
  userId: string;
  assessmentId: string;
  studentId: string;
  pageId: string;
  storagePath: string;
}): Promise<void> {
  let removed: UploadPageOp | null = null;
  await mutate((current) => {
    const res = cancelPendingUpload(current, params.pageId);
    removed = res.removed;
    if (removed) return res.ops;
    const op: DeletePageOp = {
      ...base('delete_page', params.userId, params.assessmentId),
      studentId: params.studentId,
      pageId: params.pageId,
      storagePath: params.storagePath,
    };
    return [...current, op];
  });
  // Page en cours d'envoi au même moment : drainOutbox() verra qu'elle a été retirée et
  // mettra sa suppression en file une fois l'envoi terminé.
  if (removed) await deleteAsync((removed as UploadPageOp).localPath, { idempotent: true }).catch(() => undefined);
}

/** Retire de la file tout ce qui concerne une éval (purge) et supprime les fichiers locaux. */
export async function removeQueuedForAssessment(assessmentId: string): Promise<number> {
  let removed: OutboxOp[] = [];
  await mutate((ops) => {
    removed = ops.filter((op) => op.assessmentId === assessmentId);
    return ops.filter((op) => op.assessmentId !== assessmentId);
  });
  for (const op of removed) {
    if (op.kind === 'upload_page') {
      await deleteAsync(op.localPath, { idempotent: true }).catch(() => undefined);
    }
  }
  return removed.length;
}

// ---------------------------------------------------------------------------
// Exécution des opérations
// ---------------------------------------------------------------------------

function fail(error: { message: string } | null | undefined): void {
  if (error) throw new Error(error.message);
}

async function runCreateAssessment(op: CreateAssessmentOp): Promise<void> {
  const { data: settings } = await supabase!
    .from('trimester_settings')
    .select('current_trimester, school_year')
    .eq('user_id', op.userId)
    .maybeSingle();
  const { error } = await supabase!.from('written_assessments').upsert(
    {
      id: op.assessmentId,
      user_id: op.userId,
      class_id: op.classId,
      name: op.name,
      date: op.date,
      bareme_total: op.baremeTotal,
      session_id: op.sessionId,
      kind: 'ecrit',
      period: settings?.current_trimester ?? null,
      school_year: settings?.school_year ?? null,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  fail(error);
}

async function runCopyInfo(op: CopyInfoOp): Promise<void> {
  const row: Record<string, unknown> = {
    user_id: op.userId,
    assessment_id: op.assessmentId,
    student_id: op.studentId,
  };
  if (op.info.status !== undefined) row.status = op.info.status;
  if (op.info.subjectVersion !== undefined) row.subject_version = op.info.subjectVersion;
  if (op.info.isAdapted !== undefined) row.is_adapted = op.info.isAdapted;
  if (op.info.copyAnnotated !== undefined) row.copy_annotated = op.info.copyAnnotated;
  // upsert = INSERT … ON CONFLICT DO UPDATE des seules colonnes fournies : la note, le
  // commentaire et le détail éventuels ne sont jamais écrasés.
  const { error } = await supabase!
    .from('assessment_grades')
    .upsert(row, { onConflict: 'assessment_id,student_id' });
  fail(error);
}

async function upsertPageRow(op: UploadPageOp, pageOrder: number) {
  return supabase!.from('assessment_copy_pages').upsert(
    {
      id: op.pageId,
      user_id: op.userId,
      assessment_id: op.assessmentId,
      student_id: op.studentId,
      page_order: pageOrder,
      storage_path: op.storagePath,
    },
    { onConflict: 'id' }
  );
}

async function runUploadPage(op: UploadPageOp): Promise<void> {
  const info = await getInfoAsync(op.localPath);
  if (!info.exists) {
    // Fichier disparu (purge manuelle) : rien à envoyer, on ne bloque pas la file pour autant.
    console.warn('[CopyOutbox] local file missing, dropping op:', op.localPath);
    return;
  }
  const base64 = await readAsStringAsync(op.localPath, { encoding: EncodingType.Base64 });
  const { error: uploadError } = await supabase!.storage
    .from(BUCKET_NAME)
    .upload(op.storagePath, decode(base64), { contentType: 'image/jpeg', upsert: true });
  fail(uploadError);

  let { error } = await upsertPageRow(op, op.pageOrder);
  if (error?.code === '23505') {
    // Numéro déjà pris côté serveur (instantané périmé quand la page a été scannée) :
    // on range la page après la dernière connue, sans rien perdre.
    const { data } = await supabase!
      .from('assessment_copy_pages')
      .select('page_order')
      .eq('assessment_id', op.assessmentId)
      .eq('student_id', op.studentId)
      .order('page_order', { ascending: false })
      .limit(1);
    const last = (data?.[0] as { page_order: number } | undefined)?.page_order ?? 0;
    ({ error } = await upsertPageRow(op, last + 1));
  }
  fail(error);
  await deleteAsync(op.localPath, { idempotent: true });
}

async function runDeletePage(op: DeletePageOp): Promise<void> {
  const { error: storageError } = await supabase!.storage.from(BUCKET_NAME).remove([op.storagePath]);
  fail(storageError);
  const { error } = await supabase!.from('assessment_copy_pages').delete().eq('id', op.pageId);
  fail(error);
}

async function runOp(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'create_assessment':
      return runCreateAssessment(op);
    case 'copy_info':
      return runCopyInfo(op);
    case 'upload_page':
      return runUploadPage(op);
    case 'delete_page':
      return runDeletePage(op);
  }
}

/**
 * Rejoue la file dans l'ordre. Une erreur réseau arrête tout (on réessaiera) ; une autre erreur
 * est notée sur l'opération (reprise espacée) et bloque seulement son éval pour ce passage.
 * `force` ignore les délais de reprise (bouton « Réessayer »).
 */
export async function drainOutbox(force = false): Promise<DrainResult> {
  if (draining || !isSupabaseConfigured || !supabase) {
    const ops = await readOutbox();
    return { done: 0, remaining: ops.length, offline: false };
  }
  draining = true;
  let done = 0;
  let offline = false;
  try {
    const blocked = new Set<string>();
    // On relit la file à chaque tour : le prof peut scanner pendant l'envoi.
    for (;;) {
      const ops = await readOutbox();
      const next = pickNext(ops, blocked, force ? Number.POSITIVE_INFINITY : Date.now());
      if (!next) break;
      try {
        await runOp(next);
        done += 1;
        await mutate((ops) => {
          const stillQueued = ops.some((op) => op.id === next.id);
          if (!stillQueued && next.kind === 'upload_page') {
            // Supprimée par le prof pendant son envoi : on efface aussi la copie serveur.
            const del: DeletePageOp = {
              ...base('delete_page', next.userId, next.assessmentId),
              studentId: next.studentId,
              pageId: next.pageId,
              storagePath: next.storagePath,
            };
            return [...ops, del];
          }
          return ops.filter((op) => op.id !== next.id);
        }, next);
      } catch (err) {
        if (isNetworkError(err)) {
          offline = true;
          break;
        }
        const message = err instanceof Error ? err.message : String(err);
        console.error('[CopyOutbox] op failed:', next.kind, message);
        blocked.add(next.assessmentId);
        await mutate((ops) =>
          ops.map((op) => (op.id === next.id ? markFailed(op, message, Date.now()) : op))
        );
      }
    }
  } finally {
    draining = false;
  }
  const remaining = (await readOutbox()).length;
  return { done, remaining, offline };
}

// ---------------------------------------------------------------------------
// Pilote : vide la file dès que c'est possible
// ---------------------------------------------------------------------------

const DRIVER_TICK_MS = 20_000;

/**
 * À monter une fois (layout racine). Vide la file au démarrage, au retour du réseau, au retour
 * au premier plan et toutes les 20 s tant qu'elle n'est pas vide (les délais de reprise propres
 * à chaque opération évitent de marteler le serveur).
 */
export function startOutboxDriver(): () => void {
  let online = true;
  const kick = () => {
    if (!online) return;
    void readOutbox().then((ops) => {
      if (ops.length > 0) void drainOutbox();
    });
  };

  const netSub = NetInfo.addEventListener((state) => {
    const nowOnline = state.isConnected === true && state.isInternetReachable !== false;
    const cameBack = nowOnline && !online;
    online = nowOnline;
    if (cameBack) kick();
  });
  const appSub = AppState.addEventListener('change', (next) => {
    if (next === 'active') kick();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') kick();
  }, DRIVER_TICK_MS);
  kick();

  return () => {
    netSub();
    appSub.remove();
    clearInterval(timer);
  };
}
