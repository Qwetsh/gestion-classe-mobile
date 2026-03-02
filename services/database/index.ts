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
  GROUP_EVENT_TYPES,
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
  createGroupGradeEvent,
  createGroupGradeEventsForMembers,
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

// Group Templates
export {
  createGroupTemplate,
  getTemplatesByClassId,
  getTemplateById,
  updateGroupTemplate,
  deleteGroupTemplate,
  getUnsyncedTemplates,
  markTemplateSynced,
  type GroupTemplateRow,
} from './groupTemplateRepository';

// Session Groups
export {
  createSessionGroup,
  createSessionGroups,
  getGroupsBySessionId,
  getGroupById,
  getGroupByNumber,
  deleteSessionGroup,
  deleteGroupsBySessionId,
  getUnsyncedGroups,
  markGroupSynced,
  getNextGroupNumber,
  type SessionGroupRow,
} from './sessionGroupRepository';

// Group Members
export {
  addMemberToGroup,
  addMembersToGroup,
  getActiveMembers,
  getAllMembers,
  getMemberById,
  getStudentGroup,
  removeMemberFromGroup,
  moveStudentToGroup,
  deleteGroupMembers,
  getUnsyncedMembers,
  markMemberSynced,
  isStudentInAnyGroup,
  type GroupMemberRow,
} from './groupMemberRepository';

// Group Events
export {
  createGroupRemark,
  createGroupGrade,
  getEventsByGroupId,
  getEventsByType,
  getEventById as getGroupEventById,
  getEventsBySessionId as getGroupEventsBySessionId,
  updateGroupEvent,
  deleteGroupEvent,
  deleteEventsByGroupId,
  getUnsyncedEvents as getUnsyncedGroupEvents,
  markEventSynced as markGroupEventSynced,
  getGradeStatsBySession,
  type GroupEventRow,
} from './groupEventRepository';
