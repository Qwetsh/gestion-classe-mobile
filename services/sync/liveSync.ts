/**
 * Envoi immédiat ("live") vers Supabase pendant une séance.
 *
 * Le téléphone reste offline-first : SQLite est la source de vérité et la synchro
 * complète (syncService) reste le filet de sécurité. Ce module tente simplement
 * de pousser tout de suite ce qui vient d'être enregistré, pour que le tableau
 * blanc (mode « en classe ») le voie en direct.
 *
 * - En cas d'échec (pas de réseau, erreur serveur), rien n'est marqué : la synchro
 *   de fin de séance rattrapera.
 * - En cas de succès, `synced_at` est posé : la synchro ignorera l'enregistrement.
 */
import { supabase, isSupabaseConfigured } from '../supabase';
import { executeSql, queryAll } from '../database/client';
import { deleteEvent, type Event } from '../database';
import { useNetworkStore } from '../../stores/networkStore';

export function isOnline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkStore.getState();
  return isConnected === true && isInternetReachable !== false;
}

function canReachServer(): boolean {
  return isSupabaseConfigured && !!supabase && isOnline();
}

/** Forme de l'événement telle qu'attendue par la table Supabase `events`. */
export function toRemoteEvent(e: Event) {
  return {
    id: e.id,
    session_id: e.session_id,
    student_id: e.student_id,
    type: e.type,
    subtype: e.subtype,
    note: e.note,
    photo_path: e.photo_path,
    timestamp: e.timestamp,
  };
}

/**
 * Pousse un événement tout de suite. Retourne true s'il est arrivé sur le serveur.
 * Ne lève jamais : un échec est silencieux (sauf log en dev) et sans conséquence.
 */
export async function pushEventNow(event: Event): Promise<boolean> {
  if (!canReachServer() || !supabase) return false;

  try {
    const { error } = await supabase
      .from('events')
      .upsert(toRemoteEvent(event), { onConflict: 'id' });

    if (error) {
      if (__DEV__) console.warn('[liveSync] Event push failed:', error.message);
      return false;
    }

    await executeSql(`UPDATE events SET synced_at = ? WHERE id = ?`, [new Date().toISOString(), event.id]);
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[liveSync] Event push error:', err);
    return false;
  }
}

interface PendingDeletion {
  id: string;
  table_name: string;
  record_id: string;
}

let flushInProgress = false;

/**
 * Propage au serveur les suppressions en attente (table pending_deletions).
 * Appelée par la synchro complète et, en direct, après chaque suppression.
 * Retourne le nombre de suppressions propagées.
 */
export async function flushPendingDeletions(): Promise<number> {
  if (!canReachServer() || !supabase || flushInProgress) return 0;

  flushInProgress = true;
  let done = 0;
  try {
    const pending = await queryAll<PendingDeletion>(
      `SELECT id, table_name, record_id FROM pending_deletions ORDER BY created_at ASC`
    );

    for (const p of pending) {
      const { error } = await supabase.from(p.table_name).delete().eq('id', p.record_id);
      if (error) {
        if (__DEV__) console.warn('[liveSync] Remote delete failed:', p.table_name, p.record_id, error.message);
        continue;
      }
      await executeSql(`DELETE FROM pending_deletions WHERE id = ?`, [p.id]);
      done++;
    }
  } catch (err) {
    if (__DEV__) console.warn('[liveSync] flushPendingDeletions error:', err);
  } finally {
    flushInProgress = false;
  }
  return done;
}

/**
 * Supprime un événement en local puis tente immédiatement de propager la
 * suppression au serveur (sans bloquer l'appelant).
 */
export async function deleteEventNow(id: string): Promise<void> {
  await deleteEvent(id);
  void flushPendingDeletions();
}
