/**
 * Logique pure de la file d'envoi des copies — aucun I/O (testable).
 *
 * Garantie projet : "ne jamais perdre une copie scannée" (offline-first).
 * Tout ce que le prof fait sur l'écran de scan devient une OPÉRATION, persistée sur le
 * téléphone puis rejouée dans l'ordre vers Supabase : création d'éval, informations de copie
 * (absent, version du sujet, adaptée, annotée), envoi de page, suppression de page.
 * L'écran affiche l'état serveur (dernier instantané connu) + les opérations en attente.
 */

import { buildCopyPath } from './path';

export type CopyStatus = 'absent' | 'noted';

/** Informations de copie d'un élève (colonnes de assessment_grades). */
export interface CopyInfo {
  status?: CopyStatus;
  subjectVersion?: string | null;
  isAdapted?: boolean;
  copyAnnotated?: boolean;
}

interface OpBase {
  id: string;
  userId: string;
  assessmentId: string;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  /** ISO : pas de nouvel essai avant cette date (reprises espacées). */
  nextAttemptAt?: string | null;
}

export interface CreateAssessmentOp extends OpBase {
  kind: 'create_assessment';
  classId: string;
  name: string;
  date: string;
  baremeTotal: number;
  sessionId: string | null;
}

export interface CopyInfoOp extends OpBase {
  kind: 'copy_info';
  studentId: string;
  info: CopyInfo;
}

export interface UploadPageOp extends OpBase {
  kind: 'upload_page';
  studentId: string;
  pageId: string;
  pageOrder: number;
  /** Copie persistante dans documentDirectory (jamais le cache du scanner). */
  localPath: string;
  storagePath: string;
}

export interface DeletePageOp extends OpBase {
  kind: 'delete_page';
  studentId: string;
  pageId: string;
  storagePath: string;
}

/**
 * Photo du placement des élèves pour l'éval (migration 055) : prise automatiquement au premier
 * scan ('auto', n'écrase jamais une photo existante) ou corrigée à la main ('manual').
 * Annexe : son échec ne bloque jamais l'envoi des copies.
 */
export interface SavePlacementOp extends OpBase {
  kind: 'save_placement';
  mode: 'auto' | 'manual';
  roomId: string | null;
  /** {"r-c": student_id}, comme class_room_plans. */
  positions: Positions;
  /** ["r,c"], comme rooms ; null = la base reprend celles de la salle. */
  disabledCells: string[] | null;
}

export type Positions = Record<string, string>;

export type OutboxOp = CreateAssessmentOp | CopyInfoOp | UploadPageOp | DeletePageOp | SavePlacementOp;

/** Opération propre à un élève (pages, informations de copie). */
type StudentOp = CopyInfoOp | UploadPageOp | DeletePageOp;

function isStudentOp(op: OutboxOp): op is StudentOp {
  return op.kind === 'copy_info' || op.kind === 'upload_page' || op.kind === 'delete_page';
}

/** Instantané serveur d'une éval (mis en cache pour travailler hors ligne). */
export interface ServerPage {
  id: string;
  student_id: string;
  page_order: number;
  storage_path: string;
}

export interface ServerCopyInfo {
  student_id: string;
  status: string | null;
  subject_version: string | null;
  is_adapted: boolean | null;
  copy_annotated: boolean | null;
}

export interface ScanSnapshot {
  pages: ServerPage[];
  infos: ServerCopyInfo[];
  fetchedAt: string | null;
}

export const EMPTY_SNAPSHOT: ScanSnapshot = { pages: [], infos: [], fetchedAt: null };

export interface CopyPageView {
  pageId: string;
  pageOrder: number;
  storagePath: string;
  /** false : encore sur le téléphone, en attente d'envoi. */
  uploaded: boolean;
  localPath?: string;
}

export type CopyState = 'done' | 'todo' | 'absent';

export interface StudentCopyState {
  studentId: string;
  pages: CopyPageView[];
  uploadedCount: number;
  pendingCount: number;
  absent: boolean;
  subjectVersion: string | null;
  isAdapted: boolean;
  copyAnnotated: boolean;
  state: CopyState;
}

/**
 * État d'un élève = serveur + opérations en attente (dans l'ordre).
 * Une page a des pages → « done » même si elle n'est pas encore envoyée : elle est en sécurité
 * sur le téléphone. Absent l'emporte seulement s'il n'y a aucune page.
 */
export function mergeStudentState(
  studentId: string,
  snapshot: ScanSnapshot,
  ops: OutboxOp[]
): StudentCopyState {
  const mine = ops.filter((op): op is StudentOp => isStudentOp(op) && op.studentId === studentId);

  const deleted = new Set(
    mine.filter((op): op is DeletePageOp => op.kind === 'delete_page').map((op) => op.pageId)
  );

  const pages: CopyPageView[] = snapshot.pages
    .filter((p) => p.student_id === studentId && !deleted.has(p.id))
    .map((p) => ({
      pageId: p.id,
      pageOrder: p.page_order,
      storagePath: p.storage_path,
      uploaded: true,
    }));
  const known = new Set(pages.map((p) => p.pageId));

  for (const op of mine) {
    if (op.kind !== 'upload_page' || known.has(op.pageId)) continue;
    pages.push({
      pageId: op.pageId,
      pageOrder: op.pageOrder,
      storagePath: op.storagePath,
      uploaded: false,
      localPath: op.localPath,
    });
  }
  pages.sort((a, b) => a.pageOrder - b.pageOrder);

  const server = snapshot.infos.find((i) => i.student_id === studentId);
  let status: string | null = server?.status ?? null;
  let subjectVersion = server?.subject_version ?? null;
  let isAdapted = server?.is_adapted ?? false;
  let copyAnnotated = server?.copy_annotated ?? false;
  for (const op of mine) {
    if (op.kind !== 'copy_info') continue;
    if (op.info.status !== undefined) status = op.info.status;
    if (op.info.subjectVersion !== undefined) subjectVersion = op.info.subjectVersion;
    if (op.info.isAdapted !== undefined) isAdapted = op.info.isAdapted;
    if (op.info.copyAnnotated !== undefined) copyAnnotated = op.info.copyAnnotated;
  }

  const absent = status === 'absent';
  const pendingCount = pages.filter((p) => !p.uploaded).length;
  return {
    studentId,
    pages,
    uploadedCount: pages.length - pendingCount,
    pendingCount,
    absent,
    subjectVersion,
    isAdapted,
    copyAnnotated,
    state: pages.length > 0 ? 'done' : absent ? 'absent' : 'todo',
  };
}

/** Numéro de la prochaine page d'un élève (après la dernière, serveur ou en attente). */
export function nextPageOrder(pages: CopyPageView[]): number {
  return pages.length > 0 ? Math.max(...pages.map((p) => p.pageOrder)) + 1 : 1;
}

/** Délai avant le prochain essai d'une opération qui a échoué : 5 s, 15 s, 1 min, puis 5 min. */
export function nextRetryDelayMs(attempts: number): number {
  const steps = [5_000, 15_000, 60_000, 300_000];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

/**
 * Erreur de réseau (coupure, Wi-Fi du collège) : on arrête le vidage et on réessaiera.
 * Toute autre erreur est propre à l'opération : on la note et on passe aux autres évals.
 */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|network ?error|timed? ?out|aborted|fetch failed/i.test(
    msg
  );
}

/** L'opération peut-elle être tentée maintenant ? (éval non bloquée, délai de reprise écoulé) */
export function isRunnable(op: OutboxOp, blockedAssessments: Set<string>, now: number): boolean {
  if (blockedAssessments.has(op.assessmentId)) return false;
  if (op.nextAttemptAt && Date.parse(op.nextAttemptAt) > now) return false;
  return true;
}

/** Annote une opération après un échec (le compteur pilote le délai de reprise). */
export function markFailed(op: OutboxOp, error: string, now: number): OutboxOp {
  const attempts = op.attempts + 1;
  return {
    ...op,
    attempts,
    lastError: error,
    nextAttemptAt: new Date(now + nextRetryDelayMs(attempts)).toISOString(),
  };
}

export interface OutboxSummary {
  /** Pages encore sur le téléphone. */
  pendingPages: number;
  /** Toutes opérations confondues. */
  total: number;
  /** Dernière erreur non réseau rencontrée, à montrer au prof. */
  lastError: string | null;
}

export function summarize(ops: OutboxOp[], assessmentId?: string): OutboxSummary {
  const scoped = assessmentId ? ops.filter((op) => op.assessmentId === assessmentId) : ops;
  const withError = scoped.filter((op) => op.lastError);
  return {
    pendingPages: scoped.filter((op) => op.kind === 'upload_page').length,
    total: scoped.length,
    lastError: withError.length > 0 ? withError[withError.length - 1].lastError ?? null : null,
  };
}

/** Évals créées sur le téléphone et pas encore arrivées sur le serveur. */
export function pendingCreations(ops: OutboxOp[]): CreateAssessmentOp[] {
  return ops.filter((op): op is CreateAssessmentOp => op.kind === 'create_assessment');
}

/**
 * Format v1 de la file (avant le 01/11/2026) : un tableau de pages sans `kind`, rangées
 * sous `{page}.jpg`. Converti en opérations d'envoi (avec un chemin par identifiant).
 */
export function migrateLegacyQueue(raw: unknown): OutboxOp[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === 'object')
    .map((it: Record<string, unknown>) => {
      if (typeof it.kind === 'string') return it as unknown as OutboxOp;
      const id = String(it.id);
      const userId = String(it.userId);
      const assessmentId = String(it.assessmentId);
      const studentId = String(it.studentId);
      const op: UploadPageOp = {
        kind: 'upload_page',
        id,
        userId,
        assessmentId,
        studentId,
        pageId: id,
        pageOrder: Number(it.pageOrder) || 1,
        localPath: String(it.localPath),
        storagePath: buildCopyPath(userId, assessmentId, studentId, id),
        createdAt: typeof it.createdAt === 'string' ? it.createdAt : new Date(0).toISOString(),
        attempts: 0,
      };
      return op;
    });
}

/**
 * Retire de la file l'envoi d'une page pas encore partie (supprimer une page en attente
 * ne doit rien envoyer au serveur). Renvoie la file filtrée et l'opération retirée.
 */
export function cancelPendingUpload(
  ops: OutboxOp[],
  pageId: string
): { ops: OutboxOp[]; removed: UploadPageOp | null } {
  const removed =
    (ops.find((op) => op.kind === 'upload_page' && op.pageId === pageId) as UploadPageOp) ?? null;
  return { ops: removed ? ops.filter((op) => op !== removed) : ops, removed };
}

/**
 * Prochaine opération à tenter, dans l'ordre de la file. Une opération qui ne peut pas partir
 * maintenant (délai de reprise, éval bloquée) bloque toute la suite de son éval : une page ne
 * part jamais avant la création de son éval, ni une suppression avant l'envoi de la page.
 * `blocked` est complété au passage. `now = +Infinity` ignore les délais (« Réessayer »).
 */
export function pickNext(
  ops: OutboxOp[],
  blocked: Set<string>,
  now: number
): OutboxOp | null {
  for (const op of ops) {
    if (isRunnable(op, blocked, now)) return op;
    // Une photo de placement en attente ne retient pas les copies derrière elle.
    if (!isAnnexOp(op)) blocked.add(op.assessmentId);
  }
  return null;
}

/** Opération annexe : en échec, elle attend son tour sans bloquer le reste de l'éval. */
export function isAnnexOp(op: OutboxOp): boolean {
  return op.kind === 'save_placement';
}

/**
 * Reporte dans l'instantané une opération que le serveur vient d'accepter : la page envoyée
 * ne doit pas disparaître de l'écran entre la sortie de la file et le prochain rechargement.
 */
export function applyToSnapshot(snapshot: ScanSnapshot, op: OutboxOp): ScanSnapshot {
  switch (op.kind) {
    case 'upload_page':
      if (snapshot.pages.some((p) => p.id === op.pageId)) return snapshot;
      return {
        ...snapshot,
        pages: [
          ...snapshot.pages,
          { id: op.pageId, student_id: op.studentId, page_order: op.pageOrder, storage_path: op.storagePath },
        ],
      };
    case 'delete_page':
      return { ...snapshot, pages: snapshot.pages.filter((p) => p.id !== op.pageId) };
    case 'copy_info': {
      const current = snapshot.infos.find((i) => i.student_id === op.studentId) ?? {
        student_id: op.studentId,
        status: null,
        subject_version: null,
        is_adapted: false,
        copy_annotated: false,
      };
      const next = {
        ...current,
        ...(op.info.status !== undefined && { status: op.info.status }),
        ...(op.info.subjectVersion !== undefined && { subject_version: op.info.subjectVersion }),
        ...(op.info.isAdapted !== undefined && { is_adapted: op.info.isAdapted }),
        ...(op.info.copyAnnotated !== undefined && { copy_annotated: op.info.copyAnnotated }),
      };
      return {
        ...snapshot,
        infos: [...snapshot.infos.filter((i) => i.student_id !== op.studentId), next],
      };
    }
    case 'create_assessment':
    case 'save_placement':
      return snapshot;
  }
}

// ---------------------------------------------------------------------------
// Placement de l'éval (migration 055)
// ---------------------------------------------------------------------------

/**
 * Clés de positions au format des plans de classe, "r-c". Les plans de groupe ont pu être
 * écrits en "r,c" : on normalise, pour que le Correcteur lise toujours la même chose.
 */
export function normalizePositions(positions: Record<string, string> | null | undefined): Positions {
  const out: Positions = {};
  for (const [key, studentId] of Object.entries(positions ?? {})) {
    if (!studentId) continue;
    out[key.replace(',', '-')] = studentId;
  }
  return out;
}

/** Case occupée par un élève, ou null. */
export function seatOf(positions: Positions, studentId: string): string | null {
  return Object.keys(positions).find((k) => positions[k] === studentId) ?? null;
}

/**
 * Place un élève sur une case. Si la case est prise, les deux élèves échangent leurs places ;
 * un élève qui n'avait pas de place prend la case et l'occupant la perd.
 */
export function placeStudent(positions: Positions, studentId: string, cell: string): Positions {
  const next: Positions = { ...positions };
  const from = seatOf(next, studentId);
  const occupant = next[cell];
  if (from === cell) return next;
  if (from) delete next[from];
  next[cell] = studentId;
  if (occupant && occupant !== studentId && from) next[from] = occupant;
  return next;
}

/** Retire un élève du placement (absent ce jour-là, par exemple). */
export function unseatStudent(positions: Positions, studentId: string): Positions {
  const next: Positions = { ...positions };
  const from = seatOf(next, studentId);
  if (from) delete next[from];
  return next;
}
