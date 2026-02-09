import { create } from 'zustand';
import {
  createRoom,
  getRoomsByUserId,
  getRoomById,
  updateRoom as updateRoomDb,
  updateRoomGrid as updateRoomGridDb,
  deleteRoom as deleteRoomDb,
  type Room,
} from '../services/database';

interface RoomState {
  rooms: Room[];
  currentRoom: Room | null;
  isLoading: boolean;
  error: string | null;
}

interface RoomActions {
  loadRooms: (userId: string) => Promise<void>;
  addRoom: (userId: string, name: string, gridRows?: number, gridCols?: number) => Promise<Room>;
  updateRoomName: (id: string, name: string) => Promise<void>;
  updateRoomDimensions: (id: string, gridRows: number, gridCols: number) => Promise<void>;
  removeRoom: (id: string) => Promise<void>;
  setCurrentRoom: (room: Room | null) => void;
  loadRoomById: (id: string) => Promise<Room | null>;
  clearError: () => void;
  reset: () => void;
}

type RoomStore = RoomState & RoomActions;

const initialState: RoomState = {
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,
};

export const useRoomStore = create<RoomStore>((set, get) => ({
  ...initialState,

  loadRooms: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const rooms = await getRoomsByUserId(userId);
      set({ rooms, isLoading: false });
    } catch (error) {
      console.error('[roomStore] Failed to load rooms:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement des salles',
        isLoading: false,
      });
    }
  },

  addRoom: async (userId: string, name: string, gridRows = 6, gridCols = 5) => {
    set({ isLoading: true, error: null });
    try {
      const room = await createRoom(userId, name, gridRows, gridCols);
      set((state) => ({
        rooms: [...state.rooms, room].sort((a, b) => a.name.localeCompare(b.name)),
        isLoading: false,
      }));
      return room;
    } catch (error) {
      console.error('[roomStore] Failed to add room:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la création de la salle',
        isLoading: false,
      });
      throw error;
    }
  },

  updateRoomName: async (id: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const updatedRoom = await updateRoomDb(id, name);
      if (updatedRoom) {
        set((state) => ({
          rooms: state.rooms
            .map((r) => (r.id === id ? updatedRoom : r))
            .sort((a, b) => a.name.localeCompare(b.name)),
          currentRoom: state.currentRoom?.id === id ? updatedRoom : state.currentRoom,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('[roomStore] Failed to update room:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la modification de la salle',
        isLoading: false,
      });
      throw error;
    }
  },

  updateRoomDimensions: async (id: string, gridRows: number, gridCols: number) => {
    set({ isLoading: true, error: null });
    try {
      const updatedRoom = await updateRoomGridDb(id, gridRows, gridCols);
      if (updatedRoom) {
        set((state) => ({
          rooms: state.rooms.map((r) => (r.id === id ? updatedRoom : r)),
          currentRoom: state.currentRoom?.id === id ? updatedRoom : state.currentRoom,
          isLoading: false,
        }));
      }
    } catch (error) {
      console.error('[roomStore] Failed to update room dimensions:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la modification des dimensions',
        isLoading: false,
      });
      throw error;
    }
  },

  removeRoom: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await deleteRoomDb(id);
      set((state) => ({
        rooms: state.rooms.filter((r) => r.id !== id),
        currentRoom: state.currentRoom?.id === id ? null : state.currentRoom,
        isLoading: false,
      }));
    } catch (error) {
      console.error('[roomStore] Failed to remove room:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors de la suppression de la salle',
        isLoading: false,
      });
      throw error;
    }
  },

  setCurrentRoom: (room: Room | null) => {
    set({ currentRoom: room });
  },

  loadRoomById: async (id: string) => {
    try {
      const room = await getRoomById(id);
      if (room) {
        set({ currentRoom: room });
      }
      return room;
    } catch (error) {
      console.error('[roomStore] Failed to load room:', error);
      return null;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
