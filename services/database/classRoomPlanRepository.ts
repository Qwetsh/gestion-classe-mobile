import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

// Positions are stored as JSON: { "row-col": "studentId", ... }
export type Positions = Record<string, string>;

export interface ClassRoomPlan {
  id: string;
  class_id: string;
  room_id: string;
  positions: Positions;
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
}

interface ClassRoomPlanRow {
  id: string;
  class_id: string;
  room_id: string;
  positions: string; // JSON string
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
}

/**
 * Parse positions from JSON string
 */
function parsePositions(positionsJson: string): Positions {
  try {
    return JSON.parse(positionsJson);
  } catch {
    return {};
  }
}

/**
 * Convert row to ClassRoomPlan with parsed positions
 */
function rowToPlan(row: ClassRoomPlanRow): ClassRoomPlan {
  return {
    ...row,
    positions: parsePositions(row.positions),
  };
}

/**
 * Get or create a class-room plan
 */
export async function getOrCreatePlan(
  classId: string,
  roomId: string
): Promise<ClassRoomPlan> {
  // Try to find existing plan
  const existing = await queryFirst<ClassRoomPlanRow>(
    `SELECT * FROM class_room_plans WHERE class_id = ? AND room_id = ?`,
    [classId, roomId]
  );

  if (existing) {
    return rowToPlan(existing);
  }

  // Create new plan
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO class_room_plans (id, class_id, room_id, positions, created_at)
     VALUES (?, ?, ?, '{}', ?)`,
    [id, classId, roomId, now]
  );

  console.log('[classRoomPlanRepository] Created plan for class', classId, 'in room', roomId);

  return {
    id,
    class_id: classId,
    room_id: roomId,
    positions: {},
    created_at: now,
    updated_at: null,
    synced_at: null,
  };
}

/**
 * Get a plan by class and room
 */
export async function getPlan(
  classId: string,
  roomId: string
): Promise<ClassRoomPlan | null> {
  const row = await queryFirst<ClassRoomPlanRow>(
    `SELECT * FROM class_room_plans WHERE class_id = ? AND room_id = ?`,
    [classId, roomId]
  );

  return row ? rowToPlan(row) : null;
}

/**
 * Get all plans for a class
 */
export async function getPlansByClassId(classId: string): Promise<ClassRoomPlan[]> {
  const rows = await queryAll<ClassRoomPlanRow>(
    `SELECT * FROM class_room_plans WHERE class_id = ?`,
    [classId]
  );

  return rows.map(rowToPlan);
}

/**
 * Update the positions in a plan
 */
export async function updatePositions(
  classId: string,
  roomId: string,
  positions: Positions
): Promise<ClassRoomPlan> {
  const now = new Date().toISOString();
  const positionsJson = JSON.stringify(positions);

  // First ensure the plan exists
  await getOrCreatePlan(classId, roomId);

  await executeSql(
    `UPDATE class_room_plans SET positions = ?, updated_at = ? WHERE class_id = ? AND room_id = ?`,
    [positionsJson, now, classId, roomId]
  );

  console.log('[classRoomPlanRepository] Updated positions for class', classId, 'in room', roomId);

  const plan = await getPlan(classId, roomId);
  return plan!;
}

/**
 * Set a student's position
 */
export async function setStudentPosition(
  classId: string,
  roomId: string,
  studentId: string,
  row: number,
  col: number
): Promise<ClassRoomPlan> {
  const plan = await getOrCreatePlan(classId, roomId);
  const positions = { ...plan.positions };

  // Remove student from any existing position
  for (const key of Object.keys(positions)) {
    if (positions[key] === studentId) {
      delete positions[key];
    }
  }

  // Set new position
  const positionKey = `${row}-${col}`;
  positions[positionKey] = studentId;

  return updatePositions(classId, roomId, positions);
}

/**
 * Remove a student from the plan
 */
export async function removeStudentFromPlan(
  classId: string,
  roomId: string,
  studentId: string
): Promise<ClassRoomPlan> {
  const plan = await getOrCreatePlan(classId, roomId);
  const positions = { ...plan.positions };

  // Remove student from any position
  for (const key of Object.keys(positions)) {
    if (positions[key] === studentId) {
      delete positions[key];
    }
  }

  return updatePositions(classId, roomId, positions);
}

/**
 * Clear all positions in a plan
 */
export async function clearPositions(
  classId: string,
  roomId: string
): Promise<ClassRoomPlan> {
  return updatePositions(classId, roomId, {});
}

/**
 * Get the position of a student in a plan
 */
export function getStudentPosition(
  positions: Positions,
  studentId: string
): { row: number; col: number } | null {
  for (const [key, id] of Object.entries(positions)) {
    if (id === studentId) {
      const [row, col] = key.split('-').map(Number);
      return { row, col };
    }
  }
  return null;
}

/**
 * Get the student at a position
 */
export function getStudentAtPosition(
  positions: Positions,
  row: number,
  col: number
): string | null {
  const key = `${row}-${col}`;
  return positions[key] || null;
}

/**
 * Delete all plans for a class
 */
export async function deletePlansByClassId(classId: string): Promise<void> {
  await executeSql(
    `DELETE FROM class_room_plans WHERE class_id = ?`,
    [classId]
  );
  console.log('[classRoomPlanRepository] Deleted all plans for class', classId);
}

/**
 * Delete all plans for a room
 */
export async function deletePlansByRoomId(roomId: string): Promise<void> {
  await executeSql(
    `DELETE FROM class_room_plans WHERE room_id = ?`,
    [roomId]
  );
  console.log('[classRoomPlanRepository] Deleted all plans for room', roomId);
}
