import { useRoomStore } from '../../stores/roomStore';
import * as database from '../../services/database';

// Mock the database module
jest.mock('../../services/database', () => ({
  createRoom: jest.fn(),
  getRoomsByUserId: jest.fn(),
  getRoomById: jest.fn(),
  updateRoom: jest.fn(),
  updateRoomGrid: jest.fn(),
  deleteRoom: jest.fn(),
}));

const mockDatabase = database as jest.Mocked<typeof database>;

describe('roomStore', () => {
  const mockUserId = 'user-123';
  const mockRoomId = 'room-456';

  const mockRoom = {
    id: mockRoomId,
    user_id: mockUserId,
    name: 'Salle 204',
    grid_rows: 6,
    grid_cols: 5,
    disabled_cells: '[]',
    created_at: '2026-02-04T10:00:00.000Z',
    updated_at: null,
    synced_at: null,
    is_deleted: 0,
  };

  beforeEach(() => {
    // Reset store state
    useRoomStore.setState({
      rooms: [],
      currentRoom: null,
      isLoading: false,
      error: null,
    });
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('loadRooms', () => {
    it('should load rooms for a user', async () => {
      const rooms = [mockRoom, { ...mockRoom, id: 'room-2', name: 'Salle 101' }];
      mockDatabase.getRoomsByUserId.mockResolvedValue(rooms);

      const store = useRoomStore.getState();
      await store.loadRooms(mockUserId);

      expect(mockDatabase.getRoomsByUserId).toHaveBeenCalledWith(mockUserId);

      const state = useRoomStore.getState();
      expect(state.rooms).toHaveLength(2);
      expect(state.isLoading).toBe(false);
    });

    it('should handle errors when loading rooms', async () => {
      mockDatabase.getRoomsByUserId.mockRejectedValue(new Error('Database error'));

      const store = useRoomStore.getState();
      await store.loadRooms(mockUserId);

      const state = useRoomStore.getState();
      expect(state.error).toBe('Database error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('addRoom', () => {
    it('should create a new room with default dimensions', async () => {
      mockDatabase.createRoom.mockResolvedValue(mockRoom);

      const store = useRoomStore.getState();
      const result = await store.addRoom(mockUserId, 'Salle 204');

      expect(mockDatabase.createRoom).toHaveBeenCalledWith(
        mockUserId,
        'Salle 204',
        6, // default gridRows
        5  // default gridCols
      );
      expect(result).toEqual(mockRoom);

      const state = useRoomStore.getState();
      expect(state.rooms).toHaveLength(1);
    });

    it('should create a room with custom dimensions', async () => {
      mockDatabase.createRoom.mockResolvedValue({ ...mockRoom, grid_rows: 8, grid_cols: 6 });

      const store = useRoomStore.getState();
      await store.addRoom(mockUserId, 'Grande Salle', 8, 6);

      expect(mockDatabase.createRoom).toHaveBeenCalledWith(
        mockUserId,
        'Grande Salle',
        8,
        6
      );
    });
  });

  describe('updateRoomName', () => {
    it('should update room name', async () => {
      useRoomStore.setState({ rooms: [mockRoom] });
      mockDatabase.updateRoom.mockResolvedValue({ ...mockRoom, name: 'Salle 205' });

      const store = useRoomStore.getState();
      await store.updateRoomName(mockRoomId, 'Salle 205');

      expect(mockDatabase.updateRoom).toHaveBeenCalledWith(mockRoomId, 'Salle 205');

      const state = useRoomStore.getState();
      expect(state.rooms[0].name).toBe('Salle 205');
    });
  });

  describe('updateRoomDimensions', () => {
    it('should update room grid dimensions', async () => {
      useRoomStore.setState({ rooms: [mockRoom] });
      mockDatabase.updateRoomGrid.mockResolvedValue({ ...mockRoom, grid_rows: 8, grid_cols: 6 });

      const store = useRoomStore.getState();
      await store.updateRoomDimensions(mockRoomId, 8, 6);

      expect(mockDatabase.updateRoomGrid).toHaveBeenCalledWith(mockRoomId, 8, 6);

      const state = useRoomStore.getState();
      expect(state.rooms[0].grid_rows).toBe(8);
      expect(state.rooms[0].grid_cols).toBe(6);
    });
  });

  describe('removeRoom', () => {
    it('should remove a room', async () => {
      useRoomStore.setState({ rooms: [mockRoom] });
      mockDatabase.deleteRoom.mockResolvedValue(undefined);

      const store = useRoomStore.getState();
      await store.removeRoom(mockRoomId);

      expect(mockDatabase.deleteRoom).toHaveBeenCalledWith(mockRoomId);

      const state = useRoomStore.getState();
      expect(state.rooms).toHaveLength(0);
    });

    it('should clear currentRoom if removed', async () => {
      useRoomStore.setState({ rooms: [mockRoom], currentRoom: mockRoom });
      mockDatabase.deleteRoom.mockResolvedValue(undefined);

      const store = useRoomStore.getState();
      await store.removeRoom(mockRoomId);

      const state = useRoomStore.getState();
      expect(state.currentRoom).toBeNull();
    });
  });

  describe('loadRoomById', () => {
    it('should load and set current room', async () => {
      mockDatabase.getRoomById.mockResolvedValue(mockRoom);

      const store = useRoomStore.getState();
      const result = await store.loadRoomById(mockRoomId);

      expect(mockDatabase.getRoomById).toHaveBeenCalledWith(mockRoomId);
      expect(result).toEqual(mockRoom);

      const state = useRoomStore.getState();
      expect(state.currentRoom).toEqual(mockRoom);
    });

    it('should return null if room not found', async () => {
      mockDatabase.getRoomById.mockResolvedValue(null);

      const store = useRoomStore.getState();
      const result = await store.loadRoomById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('setCurrentRoom', () => {
    it('should set current room', () => {
      const store = useRoomStore.getState();
      store.setCurrentRoom(mockRoom);

      const state = useRoomStore.getState();
      expect(state.currentRoom).toEqual(mockRoom);
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      useRoomStore.setState({
        rooms: [mockRoom],
        currentRoom: mockRoom,
        isLoading: true,
        error: 'some error',
      });

      const store = useRoomStore.getState();
      store.reset();

      const state = useRoomStore.getState();
      expect(state.rooms).toHaveLength(0);
      expect(state.currentRoom).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });
});
