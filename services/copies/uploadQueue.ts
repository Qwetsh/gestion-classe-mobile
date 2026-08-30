import * as Crypto from 'expo-crypto';
import {
  documentDirectory,
  makeDirectoryAsync,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  copyAsync,
  deleteAsync,
} from 'expo-file-system/legacy';
import { uploadCopyPage } from './index';
import {
  countPendingByStudent,
  pendingOrdersFor,
  type PendingUpload,
} from './queueLogic';

/**
 * File d'upload offline des copies. Garantie : "ne jamais perdre une copie scannée".
 *
 * A la capture, l'image est COPIEE dans documentDirectory (persistant) — le cache camera
 * peut etre purge par l'OS — et un item est ajoute a une file JSON sur disque.
 * drainQueue() uploade tout ce qui peut l'etre (a la reconnexion ou immediatement si en ligne).
 */

const QUEUE_DIR = `${documentDirectory}pending_copies/`;
const QUEUE_FILE = `${QUEUE_DIR}queue.json`;

let draining = false;

export interface DrainResult {
  uploaded: number;
  remaining: number;
}

async function ensureDir(): Promise<void> {
  const info = await getInfoAsync(QUEUE_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(QUEUE_DIR, { intermediates: true });
  }
}

export async function readQueue(): Promise<PendingUpload[]> {
  try {
    await ensureDir();
    const info = await getInfoAsync(QUEUE_FILE);
    if (!info.exists) return [];
    const raw = await readAsStringAsync(QUEUE_FILE);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingUpload[]) : [];
  } catch (err) {
    console.error('[CopyQueue] readQueue failed:', err);
    return [];
  }
}

async function writeQueue(items: PendingUpload[]): Promise<void> {
  await ensureDir();
  await writeAsStringAsync(QUEUE_FILE, JSON.stringify(items));
}

/**
 * Persiste l'image et met l'upload en file. Renvoie l'item cree.
 * NE PERD JAMAIS la copie : la source est copiee dans documentDirectory avant tout.
 */
export async function enqueueCopy(params: {
  userId: string;
  assessmentId: string;
  studentId: string;
  pageOrder: number;
  sourceUri: string;
}): Promise<PendingUpload> {
  await ensureDir();
  const id = Crypto.randomUUID();
  const localPath = `${QUEUE_DIR}${id}.jpg`;
  await copyAsync({ from: params.sourceUri, to: localPath });

  const item: PendingUpload = {
    id,
    userId: params.userId,
    assessmentId: params.assessmentId,
    studentId: params.studentId,
    pageOrder: params.pageOrder,
    localPath,
    createdAt: new Date().toISOString(),
  };

  const items = await readQueue();
  items.push(item);
  await writeQueue(items);
  return item;
}

/**
 * Tente d'uploader tous les items en attente. Garde en file ceux qui echouent
 * (hors-ligne / erreur reseau). Idempotent : uploadCopyPage upsert sur (assessment,student,page).
 */
export async function drainQueue(): Promise<DrainResult> {
  if (draining) {
    const items = await readQueue();
    return { uploaded: 0, remaining: items.length };
  }
  draining = true;
  try {
    const items = await readQueue();
    if (items.length === 0) return { uploaded: 0, remaining: 0 };

    const remaining: PendingUpload[] = [];
    let uploaded = 0;

    for (const it of items) {
      try {
        const result = await uploadCopyPage(
          it.userId,
          it.assessmentId,
          it.studentId,
          it.pageOrder,
          it.localPath
        );
        if (result.success) {
          uploaded += 1;
          await deleteAsync(it.localPath, { idempotent: true });
        } else {
          remaining.push(it); // echec applicatif (ex: hors-ligne) -> on garde
        }
      } catch (err) {
        console.error('[CopyQueue] drain item failed, keeping in queue:', err);
        remaining.push(it);
      }
    }

    await writeQueue(remaining);
    return { uploaded, remaining: remaining.length };
  } finally {
    draining = false;
  }
}

/**
 * Compteurs de pages en attente par eleve pour une eval (UI scan).
 */
export async function getPendingCountsByStudent(
  assessmentId: string
): Promise<Record<string, number>> {
  const items = await readQueue();
  return countPendingByStudent(items, assessmentId);
}

/**
 * Numeros de page en attente pour un eleve (pour calculer le prochain page_order).
 */
export async function getPendingOrders(
  assessmentId: string,
  studentId: string
): Promise<number[]> {
  const items = await readQueue();
  return pendingOrdersFor(items, assessmentId, studentId);
}

/**
 * Retire de la file tous les items d'une eval et supprime leurs fichiers locaux.
 * Appele lors de la purge d'une eval pour ne pas re-uploader des copies effacees.
 * Renvoie le nombre d'items retires.
 */
export async function removeQueuedForAssessment(assessmentId: string): Promise<number> {
  const items = await readQueue();
  const toRemove = items.filter((i) => i.assessmentId === assessmentId);
  if (toRemove.length === 0) return 0;

  for (const it of toRemove) {
    try {
      await deleteAsync(it.localPath, { idempotent: true });
    } catch (err) {
      console.error('[CopyQueue] removeQueuedForAssessment: delete file failed:', err);
    }
  }

  const kept = items.filter((i) => i.assessmentId !== assessmentId);
  await writeQueue(kept);
  return toRemove.length;
}
