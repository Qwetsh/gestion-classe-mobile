import { getRoomById, getPlan, getGroupPlan } from '../database';
import { supabase, isSupabaseConfigured } from '../supabase';
import { normalizePositions, type Positions } from './outboxLogic';

/**
 * Placement des élèves le jour de l'éval (migration 055), pour l'alerte « copies de voisins qui
 * se ressemblent » du Correcteur. La photo part du plan affiché en séance — celui du téléphone,
 * modifications pas encore synchronisées comprises — puis peut être corrigée pour l'éval seule.
 */

export interface EvalPlacement {
  roomId: string | null;
  roomName: string | null;
  gridRows: number;
  gridCols: number;
  positions: Positions;
  /** ["r,c"] : allées et cases sans table. */
  disabledCells: string[];
  /** 'auto' : photo du plan ; 'manual' : placement spécial ; 'local' : pas encore de photo. */
  source: 'auto' | 'manual' | 'local';
}

function parseCells(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((c): c is string => typeof c === 'string');
  if (typeof raw === 'string') {
    try {
      return parseCells(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Plan de la séance lu sur le téléphone : plan du demi-groupe s'il existe, sinon celui de la
 * classe dans cette salle. null si la salle est inconnue du téléphone.
 */
export async function buildPlacementFromLocalPlan(
  classId: string,
  roomId: string,
  groupId: string | null
): Promise<EvalPlacement | null> {
  const room = await getRoomById(roomId);
  if (!room) return null;
  const groupPlan = groupId ? await getGroupPlan(classId, roomId, groupId) : null;
  const plan = groupPlan ?? (await getPlan(classId, roomId));
  return {
    roomId,
    roomName: room.name,
    gridRows: room.grid_rows,
    gridCols: room.grid_cols,
    positions: normalizePositions(plan?.positions),
    disabledCells: parseCells(room.disabled_cells),
    source: 'local',
  };
}

/** Photo enregistrée sur le serveur ; null hors ligne, sans photo, ou table pas encore créée. */
export async function fetchPlacement(assessmentId: string): Promise<EvalPlacement | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from('assessment_placements')
      .select('room_id, room_name, grid_rows, grid_cols, positions, disabled_cells, source')
      .eq('assessment_id', assessmentId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      roomId: data.room_id,
      roomName: data.room_name,
      gridRows: data.grid_rows ?? 0,
      gridCols: data.grid_cols ?? 0,
      positions: normalizePositions(data.positions as Record<string, string>),
      disabledCells: parseCells(data.disabled_cells),
      source: data.source === 'manual' ? 'manual' : 'auto',
    };
  } catch {
    return null;
  }
}
