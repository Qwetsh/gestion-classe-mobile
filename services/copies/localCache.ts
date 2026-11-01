import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import type { ScanSnapshot } from './outboxLogic';
import type { WrittenAssessment } from '../../types';

/**
 * Dernier état connu du serveur, pour scanner sans réseau (Wi-Fi du collège) :
 * évals de chaque classe, instantané des copies de chaque éval, éval active de chaque séance
 * et dernière version de sujet saisie. Un seul petit fichier JSON, réécrit à chaque changement.
 */

const CACHE_FILE = `${documentDirectory}copies_cache.json`;
const MAX_SNAPSHOTS = 30;

export interface ActiveCopyAssessment {
  assessmentId: string;
  classId: string;
  name: string;
}

interface CacheShape {
  assessmentsByClass: Record<string, WrittenAssessment[]>;
  snapshots: Record<string, ScanSnapshot>;
  activeBySession: Record<string, ActiveCopyAssessment>;
  lastVersion: Record<string, string | null>;
}

let memory: CacheShape | null = null;

async function load(): Promise<CacheShape> {
  if (memory) return memory;
  const empty: CacheShape = { assessmentsByClass: {}, snapshots: {}, activeBySession: {}, lastVersion: {} };
  try {
    const info = await getInfoAsync(CACHE_FILE);
    memory = info.exists ? { ...empty, ...JSON.parse(await readAsStringAsync(CACHE_FILE)) } : empty;
  } catch (err) {
    console.error('[CopyCache] read failed:', err);
    memory = empty;
  }
  return memory!;
}

async function save(update: (c: CacheShape) => void): Promise<void> {
  const c = await load();
  update(c);
  try {
    await writeAsStringAsync(CACHE_FILE, JSON.stringify(c));
  } catch (err) {
    console.error('[CopyCache] write failed:', err);
  }
}

export async function getCachedAssessments(classId: string): Promise<WrittenAssessment[]> {
  return (await load()).assessmentsByClass[classId] ?? [];
}

export async function setCachedAssessments(classId: string, list: WrittenAssessment[]): Promise<void> {
  await save((c) => {
    c.assessmentsByClass[classId] = list;
  });
}

export async function getCachedSnapshot(assessmentId: string): Promise<ScanSnapshot | null> {
  return (await load()).snapshots[assessmentId] ?? null;
}

export async function setCachedSnapshot(assessmentId: string, snapshot: ScanSnapshot): Promise<void> {
  await save((c) => {
    c.snapshots[assessmentId] = snapshot;
    const ids = Object.keys(c.snapshots);
    if (ids.length > MAX_SNAPSHOTS) {
      ids
        .sort((a, b) => (c.snapshots[a].fetchedAt ?? '').localeCompare(c.snapshots[b].fetchedAt ?? ''))
        .slice(0, ids.length - MAX_SNAPSHOTS)
        .forEach((id) => delete c.snapshots[id]);
    }
  });
}

export async function getActiveForSession(sessionId: string): Promise<ActiveCopyAssessment | null> {
  return (await load()).activeBySession[sessionId] ?? null;
}

export async function setActiveForSession(
  sessionId: string,
  active: ActiveCopyAssessment | null
): Promise<void> {
  await save((c) => {
    if (active) c.activeBySession[sessionId] = active;
    else delete c.activeBySession[sessionId];
  });
}

export async function getLastVersion(assessmentId: string): Promise<string | null> {
  return (await load()).lastVersion[assessmentId] ?? null;
}

export async function setLastVersion(assessmentId: string, version: string | null): Promise<void> {
  await save((c) => {
    c.lastVersion[assessmentId] = version;
  });
}
