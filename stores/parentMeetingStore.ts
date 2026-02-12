import { create } from 'zustand';
import { queryAll, queryFirst } from '../services/database/client';
import { supabase } from '../services/supabase/client';
import { StudentWithMapping } from './studentStore';
import { Event } from '../services/database';
import { OralEvaluation } from './oralEvaluationStore';
import { Period } from '../constants/periods';

export interface StudentStats {
  participation: number;
  bavardage: number;
  absence: number;
  remarque: number;
  sortie: number;
  score: number; // participation - bavardage
}

export interface WeeklyData {
  week: string; // "S1", "S2", etc.
  participation: number;
  bavardage: number;
}

export interface StudentDashboard {
  student: StudentWithMapping;
  stats: StudentStats;
  weeklyEvolution: WeeklyData[];
  oralEvaluation: OralEvaluation | null;
  remarks: Event[]; // type === 'remarque'
}

export interface StudentQuickStats {
  score: number;
  oralGrade: number | null;
}

// Re-export Period from constants for backwards compatibility
export type { Period } from '../constants/periods';

interface ParentMeetingState {
  // Period
  selectedPeriod: Period;

  // All students with quick stats
  allStudents: StudentWithMapping[];
  studentQuickStats: Record<string, StudentQuickStats>;

  // Selected student dashboard
  currentDashboard: StudentDashboard | null;

  // Loading
  isLoading: boolean;
  isLoadingDashboard: boolean;
  error: string | null;

  // Actions
  setSelectedPeriod: (period: Period) => void;
  loadAllStudents: (userId: string) => Promise<void>;
  loadStudentDashboard: (studentId: string) => Promise<void>;
  clearDashboard: () => void;
  clearError: () => void;
}

/**
 * Get start and end dates for a school period
 */
function getPeriodDates(period: Period): { start: Date; end: Date } {
  const now = new Date();
  // School year starts in September (month 8)
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  switch (period) {
    case 'T1':
      return { start: new Date(year, 8, 1), end: new Date(year, 11, 31) }; // Sept-Dec
    case 'T2':
      return { start: new Date(year + 1, 0, 1), end: new Date(year + 1, 2, 31) }; // Jan-Mar
    case 'T3':
      return { start: new Date(year + 1, 3, 1), end: new Date(year + 1, 6, 31) }; // Apr-Jul
    case 'year':
      return { start: new Date(year, 8, 1), end: new Date(year + 1, 6, 31) }; // Sept-Jul
  }
}

/**
 * Get current school year as string (e.g., "2025-2026")
 */
function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

/**
 * Get trimester number from period
 */
function getTrimesterFromPeriod(period: Period): number | null {
  switch (period) {
    case 'T1': return 1;
    case 'T2': return 2;
    case 'T3': return 3;
    case 'year': return null;
  }
}

/**
 * Calculate stats from events
 */
function calculateStats(events: Event[]): StudentStats {
  const stats: StudentStats = {
    participation: 0,
    bavardage: 0,
    absence: 0,
    remarque: 0,
    sortie: 0,
    score: 0,
  };

  for (const event of events) {
    switch (event.type) {
      case 'participation':
        stats.participation++;
        break;
      case 'bavardage':
        stats.bavardage++;
        break;
      case 'absence':
        stats.absence++;
        break;
      case 'remarque':
        stats.remarque++;
        break;
      case 'sortie':
        stats.sortie++;
        break;
    }
  }

  stats.score = stats.participation - stats.bavardage;
  return stats;
}

/**
 * Aggregate events by week
 */
function aggregateByWeek(events: Event[], start: Date, end: Date): WeeklyData[] {
  const now = new Date();
  const effectiveEnd = end > now ? now : end;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const weeks: WeeklyData[] = [];

  for (let i = 7; i >= 0; i--) {
    const weekEnd = new Date(effectiveEnd.getTime() - i * weekMs);
    const weekStart = new Date(weekEnd.getTime() - weekMs);

    let participation = 0;
    let bavardage = 0;

    for (const event of events) {
      const eventDate = new Date(event.timestamp);
      if (eventDate >= weekStart && eventDate < weekEnd) {
        if (event.type === 'participation') participation++;
        if (event.type === 'bavardage') bavardage++;
      }
    }

    weeks.push({
      week: `S${8 - i}`,
      participation,
      bavardage,
    });
  }

  return weeks;
}

// Aggregated stats from SQL
interface AggregatedStats {
  student_id: string;
  participation: number;
  bavardage: number;
}

export const useParentMeetingStore = create<ParentMeetingState>((set, get) => ({
  selectedPeriod: 'year',
  allStudents: [],
  studentQuickStats: {},
  currentDashboard: null,
  isLoading: false,
  isLoadingDashboard: false,
  error: null,

  setSelectedPeriod: (period: Period) => {
    set({ selectedPeriod: period, studentQuickStats: {} });
  },

  loadAllStudents: async (userId: string) => {
    set({ isLoading: true, error: null });

    try {
      const { selectedPeriod } = get();
      const { start, end } = getPeriodDates(selectedPeriod);

      // 1. Load all students in a single query (FAST)
      const studentsQuery = `
        SELECT
          s.id, s.pseudo, s.class_id as classId, s.created_at as createdAt,
          lm.first_name as firstName, lm.last_name as lastName, lm.full_name as fullName
        FROM students s
        LEFT JOIN local_student_mapping lm ON s.id = lm.student_id
        JOIN classes c ON s.class_id = c.id
        WHERE c.user_id = ? AND s.is_deleted = 0 AND c.is_deleted = 0
        ORDER BY lm.full_name ASC, s.pseudo ASC
      `;
      const students = await queryAll<StudentWithMapping>(studentsQuery, [userId]);

      // Show students immediately (no stats yet)
      set({ allStudents: students, isLoading: false });

      // 2. Load aggregated stats in a single query (background)
      // SECURITY: Filter by user_id to prevent data leakage
      const statsQuery = `
        SELECT
          e.student_id,
          SUM(CASE WHEN e.type = 'participation' THEN 1 ELSE 0 END) as participation,
          SUM(CASE WHEN e.type = 'bavardage' THEN 1 ELSE 0 END) as bavardage
        FROM events e
        JOIN sessions sess ON e.session_id = sess.id
        WHERE sess.user_id = ?
          AND e.timestamp >= ?
          AND e.timestamp <= ?
        GROUP BY e.student_id
      `;
      const aggregatedStats = await queryAll<AggregatedStats>(statsQuery, [
        userId,
        start.toISOString(),
        end.toISOString(),
      ]);

      // Build quick stats map
      const quickStats: Record<string, StudentQuickStats> = {};
      for (const stat of aggregatedStats) {
        quickStats[stat.student_id] = {
          score: (stat.participation || 0) - (stat.bavardage || 0),
          oralGrade: null,
        };
      }

      // Fill missing students with 0 score
      for (const student of students) {
        if (!quickStats[student.id]) {
          quickStats[student.id] = { score: 0, oralGrade: null };
        }
      }

      set({ studentQuickStats: quickStats });

      // 3. Load oral evaluations in batch (optional, background)
      if (supabase && students.length > 0) {
        const schoolYear = getCurrentSchoolYear();
        const trimester = getTrimesterFromPeriod(selectedPeriod);
        const studentIds = students.map(s => s.id);

        let query = supabase
          .from('oral_evaluations')
          .select('student_id, grade')
          .in('student_id', studentIds)
          .eq('school_year', schoolYear);

        if (trimester !== null) {
          query = query.eq('trimester', trimester);
        }

        const { data: evaluations, error: supabaseError } = await query;
        if (supabaseError) {
          console.warn('[parentMeetingStore] Failed to load oral evaluations:', supabaseError.message);
          // Non-blocking: continue without oral grades
        } else if (evaluations) {
          const updatedStats = { ...quickStats };
          for (const ev of evaluations) {
            if (updatedStats[ev.student_id]) {
              updatedStats[ev.student_id].oralGrade = ev.grade;
            }
          }
          set({ studentQuickStats: updatedStats });
        }
      }

      if (__DEV__) {
        console.log('[parentMeetingStore] Loaded', students.length, 'students');
      }
    } catch (error) {
      console.error('[parentMeetingStore] Failed to load students:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoading: false,
      });
    }
  },

  loadStudentDashboard: async (studentId: string) => {
    set({ isLoadingDashboard: true, error: null, currentDashboard: null });

    try {
      const { selectedPeriod } = get();
      const { start, end } = getPeriodDates(selectedPeriod);
      const schoolYear = getCurrentSchoolYear();
      const trimester = getTrimesterFromPeriod(selectedPeriod);

      // 1. Load student info
      const studentQuery = `
        SELECT
          s.id, s.pseudo, s.class_id as classId, s.created_at as createdAt,
          lm.first_name as firstName, lm.last_name as lastName, lm.full_name as fullName
        FROM students s
        LEFT JOIN local_student_mapping lm ON s.id = lm.student_id
        WHERE s.id = ?
      `;
      const student = await queryFirst<StudentWithMapping>(studentQuery, [studentId]);

      if (!student) {
        set({ error: 'Eleve introuvable', isLoadingDashboard: false });
        return;
      }

      // 2. Get all events for student in period
      // SECURITY: Filter by user_id to prevent data leakage
      // We need to get the user_id from the student's class
      const userQuery = `
        SELECT c.user_id FROM students s
        JOIN classes c ON s.class_id = c.id
        WHERE s.id = ?
      `;
      const userResult = await queryFirst<{ user_id: string }>(userQuery, [studentId]);
      const studentUserId = userResult?.user_id;

      if (!studentUserId) {
        set({ error: 'Eleve introuvable ou acces refuse', isLoadingDashboard: false });
        return;
      }

      const eventsQuery = `
        SELECT e.* FROM events e
        JOIN sessions sess ON e.session_id = sess.id
        WHERE e.student_id = ?
          AND sess.user_id = ?
          AND e.timestamp >= ?
          AND e.timestamp <= ?
        ORDER BY e.timestamp DESC
      `;
      const allEvents = await queryAll<Event>(eventsQuery, [
        studentId,
        studentUserId,
        start.toISOString(),
        end.toISOString(),
      ]);

      // Calculate stats
      const stats = calculateStats(allEvents);

      // Calculate weekly evolution
      const weeklyEvolution = aggregateByWeek(allEvents, start, end);

      // Get remarks only
      const remarks = allEvents.filter(e => e.type === 'remarque');

      // Get oral evaluation
      let oralEvaluation: OralEvaluation | null = null;
      if (supabase) {
        let query = supabase
          .from('oral_evaluations')
          .select('*')
          .eq('student_id', studentId)
          .eq('school_year', schoolYear);

        if (trimester !== null) {
          query = query.eq('trimester', trimester);
        }

        const { data, error: supabaseError } = await query.maybeSingle();
        if (supabaseError) {
          console.warn('[parentMeetingStore] Failed to load oral evaluation:', supabaseError.message);
          // Non-blocking: continue without oral grade
        } else if (data) {
          oralEvaluation = data;
        }
      }

      const dashboard: StudentDashboard = {
        student,
        stats,
        weeklyEvolution,
        oralEvaluation,
        remarks,
      };

      set({
        currentDashboard: dashboard,
        isLoadingDashboard: false,
      });

      if (__DEV__) {
        console.log('[parentMeetingStore] Loaded dashboard for', student.fullName || student.pseudo);
      }
    } catch (error) {
      console.error('[parentMeetingStore] Failed to load dashboard:', error);
      set({
        error: error instanceof Error ? error.message : 'Erreur lors du chargement',
        isLoadingDashboard: false,
      });
    }
  },

  clearDashboard: () => {
    set({ currentDashboard: null });
  },

  clearError: () => {
    set({ error: null });
  },
}));
