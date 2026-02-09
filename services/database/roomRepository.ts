import * as Crypto from 'expo-crypto';
import { executeSql, queryAll, queryFirst } from './client';

export interface Room {
  id: string;
  user_id: string;
  name: string;
  grid_rows: number;
  grid_cols: number;
  disabled_cells: string; // JSON string: '["0,2", "1,3"]'
  created_at: string;
  updated_at: string | null;
  synced_at: string | null;
  is_deleted: number;
}

/**
 * Create a new room
 */
export async function createRoom(
  userId: string,
  name: string,
  gridRows: number = 6,
  gridCols: number = 5
): Promise<Room> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();

  await executeSql(
    `INSERT INTO rooms (id, user_id, name, grid_rows, grid_cols, disabled_cells, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, name, gridRows, gridCols, '[]', now]
  );

  console.log('[roomRepository] Created room:', name, 'with id:', id);

  return {
    id,
    user_id: userId,
    name,
    grid_rows: gridRows,
    grid_cols: gridCols,
    disabled_cells: '[]',
    created_at: now,
    updated_at: null,
    synced_at: null,
    is_deleted: 0,
  };
}

/**
 * Get all rooms for a user (not deleted)
 */
export async function getRoomsByUserId(userId: string): Promise<Room[]> {
  const rooms = await queryAll<Room>(
    `SELECT * FROM rooms
     WHERE user_id = ? AND is_deleted = 0
     ORDER BY name ASC`,
    [userId]
  );

  console.log('[roomRepository] Found', rooms.length, 'rooms for user');
  return rooms;
}

/**
 * Get a room by ID
 */
export async function getRoomById(id: string): Promise<Room | null> {
  return queryFirst<Room>(
    `SELECT * FROM rooms WHERE id = ? AND is_deleted = 0`,
    [id]
  );
}

/**
 * Update a room's name
 */
export async function updateRoom(
  id: string,
  name: string
): Promise<Room | null> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?`,
    [name, now, id]
  );

  console.log('[roomRepository] Updated room:', id);
  return getRoomById(id);
}

/**
 * Update room grid dimensions
 */
export async function updateRoomGrid(
  id: string,
  gridRows: number,
  gridCols: number
): Promise<Room | null> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE rooms SET grid_rows = ?, grid_cols = ?, updated_at = ? WHERE id = ?`,
    [gridRows, gridCols, now, id]
  );

  console.log('[roomRepository] Updated room grid:', id, gridRows, 'x', gridCols);
  return getRoomById(id);
}

/**
 * Soft delete a room
 */
export async function deleteRoom(id: string): Promise<void> {
  const now = new Date().toISOString();

  await executeSql(
    `UPDATE rooms SET is_deleted = 1, updated_at = ? WHERE id = ?`,
    [now, id]
  );

  console.log('[roomRepository] Soft deleted room:', id);
}

/**
 * Get room count for a user
 */
export async function getRoomCount(userId: string): Promise<number> {
  const result = await queryFirst<{ count: number }>(
    `SELECT COUNT(*) as count FROM rooms WHERE user_id = ? AND is_deleted = 0`,
    [userId]
  );
  return result?.count || 0;
}
