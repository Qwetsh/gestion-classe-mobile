// Database client
export {
  getDatabase,
  closeDatabase,
  executeSql,
  queryAll,
  queryFirst,
  executeTransaction,
} from './client';

// Schema
export {
  SCHEMA_VERSION,
  CREATE_TABLES_SQL,
  EVENT_TYPES,
  SORTIE_SUBTYPES,
} from './schema';

// Migrations
export {
  initializeDatabase,
  resetDatabase,
  getDatabaseStats,
} from './migrations';

// Repositories
export {
  createClass,
  getClassesByUserId,
  getClassById,
  updateClass,
  deleteClass,
  getClassCount,
} from './classRepository';

export {
  createStudent,
  createStudentsBatch,
  getStudentsByClassId,
  getStudentById,
  updateStudent,
  deleteStudent,
  getStudentCount,
} from './studentRepository';

export {
  createLocalMapping,
  createLocalMappingsBatch,
  getLocalMappingByStudentId,
  getLocalMappingsByClassId,
  deleteLocalMapping,
  deleteLocalMappingsByClassId,
  type LocalStudentMapping,
} from './localMappingRepository';

export {
  createRoom,
  getRoomsByUserId,
  getRoomById,
  updateRoom,
  updateRoomGrid,
  deleteRoom,
  getRoomCount,
  type Room,
} from './roomRepository';

export {
  getOrCreatePlan,
  getPlan,
  getPlansByClassId,
  updatePositions,
  setStudentPosition,
  removeStudentFromPlan,
  clearPositions,
  getStudentPosition,
  getStudentAtPosition,
  deletePlansByClassId,
  deletePlansByRoomId,
  type ClassRoomPlan,
  type Positions,
} from './classRoomPlanRepository';

export {
  createSession,
  endSession,
  getSessionById,
  getActiveSession,
  getSessionsByUserId,
  getSessionsByClassId,
  getSessionsByDateRange,
  deleteSession,
  cleanupOrphanSessions,
  type Session,
} from './sessionRepository';

export {
  createEvent,
  getEventsBySessionId,
  getEventsByStudentId,
  getStudentEventsInSession,
  getStudentEventCounts,
  getAllStudentEventCounts,
  deleteEvent,
  deleteEventsByStudentId,
  type Event,
  type EventType,
  type SortieSubtype,
  type StudentEventCounts,
} from './eventRepository';

// Delete Service (RGPD)
export {
  deleteStudentCompletely,
  deleteClassCompletely,
  deleteAllUserData,
  getStudentDeleteStats,
  getClassDeleteStats,
  getAllDataDeleteStats,
  type DeleteStudentResult,
  type DeleteClassResult,
  type DeleteAllDataResult,
} from './deleteService';
