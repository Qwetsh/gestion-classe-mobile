/**
 * Canal de commandes vers l'écran projeté (mode « en classe », page web /classe).
 *
 * Realtime broadcast Supabase, sans persistance : perdre une commande n'a aucune
 * conséquence (l'enseignant la renvoie). Le canal est nommé par séance, l'écran
 * s'y abonne dès qu'il voit la séance ouverte.
 *
 * Le protocole (ClassroomCommand) doit rester identique à celui de
 * gestion-classe-web/src/lib/classroomProtocol.ts.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../supabase';

export type ClassroomCommand =
  | { kind: 'timer'; action: 'start'; seconds: number; label?: string }
  | { kind: 'timer'; action: 'stop' }
  /** Tirage au sort ; `source: 'board'` quand il vient du tableau (le téléphone l'affiche). */
  | { kind: 'pick'; studentId: string | null; label?: string; source?: 'phone' | 'board' }
  | { kind: 'curtain'; on: boolean }
  | { kind: 'view'; mode: 'plan' | 'board' }
  /** Téléphone → écran : photo déposée dans le bucket board-assets, à poser sur la page du tableau. */
  | { kind: 'photo'; path: string; width: number; height: number; caption?: string }
  /** Écran → téléphone : « +1 tampon » demandé depuis le tableau (le téléphone reste la source de vérité). */
  | { kind: 'stamp'; studentId: string; source: 'board' }
  /** Caméra du téléphone en direct (WebRTC) : signalisation dans les deux sens. */
  | { kind: 'camera'; action: 'offer'; sdp: string }
  | { kind: 'camera'; action: 'answer'; sdp?: string }
  | { kind: 'camera'; action: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'camera'; action: 'stop' };

export const CLASSROOM_EVENT = 'cmd';
export const classroomChannelName = (sessionId: string) => `classroom:${sessionId}`;

let channel: RealtimeChannel | null = null;
let channelSessionId: string | null = null;

/** Rejoint le canal de la séance (idempotent). */
export function connectClassroomChannel(sessionId: string): void {
  if (!isSupabaseConfigured || !supabase) return;
  if (channel && channelSessionId === sessionId) return;
  disconnectClassroomChannel();

  channelSessionId = sessionId;
  channel = supabase.channel(classroomChannelName(sessionId), {
    config: { broadcast: { ack: false, self: false } },
  });
  channel.subscribe((status) => {
    if (__DEV__) console.log('[classroomChannel]', status);
  });
}

export function disconnectClassroomChannel(): void {
  if (channel && supabase) {
    void supabase.removeChannel(channel);
  }
  channel = null;
  channelSessionId = null;
}

/**
 * Envoie une commande à l'écran. Ne bloque pas, ne lève pas.
 * Si le canal n'est pas joint, supabase-js passe par l'API HTTP de broadcast.
 */
export async function sendClassroomCommand(cmd: ClassroomCommand): Promise<boolean> {
  if (!channel) return false;
  try {
    const res = await channel.send({
      type: 'broadcast',
      event: CLASSROOM_EVENT,
      payload: { ...cmd, sentAt: Date.now() },
    });
    return res === 'ok';
  } catch (err) {
    if (__DEV__) console.warn('[classroomChannel] send failed:', err);
    return false;
  }
}
