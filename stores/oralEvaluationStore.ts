import { create } from 'zustand';
import { supabase } from '../services/supabase/client';
import { StudentWithMapping } from './studentStore';

export interface OralEvaluation {
  id: string;
  student_id: string;
  class_id: string;
  user_id: string;
  trimester: number;
  school_year: string;
  grade: number;
  evaluated_at: string;
}

// Grade labels for display
export const ORAL_GRADE_LABELS: Record<number, string> = {
  1: 'Insuffisant',
  2: 'Fragile',
  3: 'Satisfaisant',
  4: 'Bien',
  5: 'Tres bien',
};

function getCurrentSchoolYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // School year starts in September (month 8)
  if (month >= 8) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

interface OralEvaluationState {
  evaluations: OralEvaluation[];
  currentTrimester: number;
  currentSchoolYear: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadTrimesterSettings: (userId: string) => Promise<void>;
  loadForClass: (classId: string) => Promise<void>;
  addEvaluation: (
    userId: string,
    studentId: string,
    classId: string,
    grade: number
  ) => Promise<OralEvaluation | null>;
  getUnevaluatedStudents: (classId: string, students: StudentWithMapping[]) => StudentWithMapping[];
  getEvaluatedCount: (classId: string) => number;
  resetClassEvaluations: (classId: string) => Promise<boolean>;
  clearEvaluations: () => void;
}

export const useOralEvaluationStore = create<OralEvaluationState>((set, get) => ({
  evaluations: [],
  currentTrimester: 1,
  currentSchoolYear: getCurrentSchoolYear(),
  isLoading: false,
  error: null,

  loadTrimesterSettings: async (userId: string) => {
    if (!supabase) return;

    try {
      const { data: settingsData } = await supabase
        .from('trimester_settings')
        .select('current_trimester, school_year')
        .eq('user_id', userId)
        .single();

      if (settingsData) {
        set({
          currentTrimester: settingsData.current_trimester,
          currentSchoolYear: settingsData.school_year,
        });
      }
    } catch (error) {
      console.error('[oralEvaluationStore] Failed to load trimester settings:', error);
    }
  },

  loadForClass: async (classId: string) => {
    if (!supabase) return;

    const { currentTrimester, currentSchoolYear } = get();

    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('oral_evaluations')
        .select('*')
        .eq('class_id', classId)
        .eq('trimester', currentTrimester)
        .eq('school_year', currentSchoolYear);

      if (error) throw error;

      set({ evaluations: data || [], isLoading: false });
      console.log('[oralEvaluationStore] Loaded', data?.length || 0, 'evaluations for class');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load evaluations';
      console.error('[oralEvaluationStore] Error:', error);
      set({ error: message, isLoading: false });
    }
  },

  addEvaluation: async (
    userId: string,
    studentId: string,
    classId: string,
    grade: number
  ) => {
    if (!supabase) return null;

    const { currentTrimester, currentSchoolYear, evaluations } = get();

    try {
      const newEvaluation = {
        student_id: studentId,
        class_id: classId,
        user_id: userId,
        trimester: currentTrimester,
        school_year: currentSchoolYear,
        grade,
      };

      const { data, error } = await supabase
        .from('oral_evaluations')
        .upsert(newEvaluation, {
          onConflict: 'student_id,class_id,trimester,school_year',
        })
        .select()
        .single();

      if (error) throw error;

      // Update local state
      const existingIndex = evaluations.findIndex(e => e.student_id === studentId);
      if (existingIndex >= 0) {
        const newEvaluations = [...evaluations];
        newEvaluations[existingIndex] = data;
        set({ evaluations: newEvaluations });
      } else {
        set({ evaluations: [...evaluations, data] });
      }

      console.log('[oralEvaluationStore] Evaluation added for student:', studentId, 'grade:', grade);
      return data;
    } catch (error) {
      console.error('[oralEvaluationStore] Failed to add evaluation:', error);
      return null;
    }
  },

  getUnevaluatedStudents: (classId: string, students: StudentWithMapping[]) => {
    const { evaluations } = get();
    const evaluatedStudentIds = new Set(
      evaluations
        .filter(e => e.class_id === classId)
        .map(e => e.student_id)
    );

    return students.filter(s => !evaluatedStudentIds.has(s.id));
  },

  getEvaluatedCount: (classId: string) => {
    const { evaluations } = get();
    return evaluations.filter(e => e.class_id === classId).length;
  },

  resetClassEvaluations: async (classId: string) => {
    if (!supabase) return false;

    const { currentTrimester, currentSchoolYear } = get();

    try {
      const { error } = await supabase
        .from('oral_evaluations')
        .delete()
        .eq('class_id', classId)
        .eq('trimester', currentTrimester)
        .eq('school_year', currentSchoolYear);

      if (error) throw error;

      // Clear local state for this class
      set((state) => ({
        evaluations: state.evaluations.filter(e => e.class_id !== classId),
      }));

      console.log('[oralEvaluationStore] Reset evaluations for class:', classId);
      return true;
    } catch (error) {
      console.error('[oralEvaluationStore] Failed to reset evaluations:', error);
      return false;
    }
  },

  clearEvaluations: () => {
    set({ evaluations: [], error: null });
  },
}));
