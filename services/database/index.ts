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
  GROUP_SESSION_STATUSES,
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
  updateSessionNotes,
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
  getClassStudentEventCounts,
  deleteEvent,
  deleteEventsByStudentId,
  type Event,
  type EventType,
  type SortieSubtype,
  type StudentEventCounts,
  type ClassStudentEventCounts,
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

// Group Sessions (Séances de groupe notées)
export {
  // Group Session CRUD
  createGroupSession,
  getGroupSessionsByUserId,
  getActiveGroupSession,
  getGroupSessionsByClassId,
  getGroupSessionById,
  updateGroupSessionStatus,
  updateGroupSessionName,
  deleteGroupSession,
  // Grading Criteria CRUD
  createGradingCriteria,
  getCriteriaBySessionId,
  updateGradingCriteria,
  deleteGradingCriteria,
  reorderCriteria,
  // Session Groups CRUD
  createSessionGroup,
  getGroupsBySessionId,
  getSessionGroupById,
  updateSessionGroupName,
  applyGroupMalus,
  setGroupMalus,
  deleteSessionGroup,
  // Group Members CRUD
  addGroupMember,
  addGroupMembersBatch,
  getGroupMembers,
  getGroupMemberIds,
  removeGroupMember,
  clearGroupMembers,
  // Group Grades CRUD
  setGroupGrade,
  getGradesByGroupId,
  getGrade,
  getGradesBySessionId,
  // Computed values
  calculateGroupScore,
  calculateMaxScore,
  getStudentGroupSessionGrades,
  // Sync helpers
  getUnsyncedGroupSessions,
  getUnsyncedGradingCriteria,
  getUnsyncedSessionGroups,
  getUnsyncedGroupMembers,
  getUnsyncedGroupGrades,
  markGroupSessionsSynced,
  markGradingCriteriaSynced,
  markSessionGroupsSynced,
  markGroupMembersSynced,
  markGroupGradesSynced,
} from './groupSessionRepository';

// TP Templates (modèles de TP)
export {
  createTpTemplate,
  getTpTemplatesByUserId,
  getTpTemplateById,
  getTpTemplateWithCriteria,
  getTpTemplatesWithCriteria,
  updateTpTemplateName,
  deleteTpTemplate,
  createTpTemplateCriteria,
  createTpTemplateCriteriaBatch,
  getTpTemplateCriteria,
  updateTpTemplateCriteria,
  deleteTpTemplateCriteria,
  replaceTpTemplateCriteria,
  type TpTemplate,
  type TpTemplateCriteria,
  type TpTemplateWithCriteria,
} from './tpTemplateRepository';
