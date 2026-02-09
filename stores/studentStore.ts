import { create } from 'zustand';
import {
  getStudentsByClassId,
  createStudent,
  deleteStudent as dbDeleteStudent,
  getLocalMappingsByClassId,
  createLocalMapping,
  LocalStudentMapping,
} from '../services/database';
import {
  importStudentsFromExcel,
  ImportResult,
} from '../services/import';
import {
  generatePseudonym,
  normalizeName,
  generateFullName,
} from '../utils';
import { Student } from '../types';

/**
 * Extended student with full name from local mapping
 */
export interface StudentWithMapping extends Student {
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

interface StudentState {
  // State per class
  studentsByClass: Record<string, StudentWithMapping[]>;
  isLoading: boolean;
  error: string | null;
  lastImportResult: ImportResult | null;

  // Actions
  loadStudentsForClass: (classId: string) => Promise<void>;
  addStudent: (userId: string, classId: string, firstName: string, lastName: string) => Promise<StudentWithMapping | null>;
  importFromExcel: (fileUri: string, userId: string, classId: string) => Promise<ImportResult>;
  removeStudent: (studentId: string, classId: string) => Promise<void>;
  clearError: () => void;
  clearImportResult: () => void;
  reset: () => void;
}

export const useStudentStore = create<StudentState>((set, get) => ({
  // Initial state
  studentsByClass: {},
  isLoading: false,
  error: null,
  lastImportResult: null,

  // Load all students for a class (with local mappings)
  loadStudentsForClass: async (classId: string): Promise<void> => {
    set({ isLoading: true, error: null });

    try {
      // Get students
      const students = await getStudentsByClassId(classId);

      // Get local mappings
      const mappings = await getLocalMappingsByClassId(classId);

      // Create a map for quick lookup
      const mappingByStudentId = new Map<string, LocalStudentMapping>();
      mappings.forEach((m) => mappingByStudentId.set(m.studentId, m));

      // Merge students with mappings
      const studentsWithMappings: StudentWithMapping[] = students.map((s) => {
        const mapping = mappingByStudentId.get(s.id);
        return {
          ...s,
          firstName: mapping?.firstName,
          lastName: mapping?.lastName,
          fullName: mapping?.fullName,
        };
      });

      set((state) => ({
        studentsByClass: {
          ...state.studentsByClass,
          [classId]: studentsWithMappings,
        },
        isLoading: false,
      }));

      console.log('[StudentStore] Loaded students for class:', classId, studentsWithMappings.length);
    } catch (err) {
      console.error('[StudentStore] Error loading students:', err);
      set({
        isLoading: false,
        error: 'Erreur lors du chargement des élèves',
      });
    }
  },

  // Add a single student manually
  addStudent: async (
    userId: string,
    classId: string,
    firstName: string,
    lastName: string
  ): Promise<StudentWithMapping | null> => {
    // Validate inputs
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    if (!cleanFirstName) {
      set({ error: 'Le prénom est requis' });
      return null;
    }

    if (!cleanLastName) {
      set({ error: 'Le nom est requis' });
      return null;
    }

    set({ isLoading: true, error: null });

    try {
      // Generate pseudonym
      const normalizedFirstName = normalizeName(cleanFirstName);
      const normalizedLastName = normalizeName(cleanLastName);
      const pseudo = generatePseudonym(normalizedFirstName, normalizedLastName);
      const fullName = generateFullName(normalizedFirstName, normalizedLastName);

      // Create student
      const student = await createStudent(userId, pseudo, classId);

      // Create local mapping (RGPD - never synced)
      await createLocalMapping(
        student.id,
        normalizedFirstName,
        normalizedLastName,
        fullName
      );

      // Create StudentWithMapping
      const studentWithMapping: StudentWithMapping = {
        ...student,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
        fullName,
      };

      // Update local state
      set((state) => ({
        studentsByClass: {
          ...state.studentsByClass,
          [classId]: [...(state.studentsByClass[classId] || []), studentWithMapping].sort(
            (a, b) => (a.fullName || a.pseudo).localeCompare(b.fullName || b.pseudo)
          ),
        },
        isLoading: false,
      }));

      console.log('[StudentStore] Added student:', studentWithMapping.fullName);
      return studentWithMapping;
    } catch (err) {
      console.error('[StudentStore] Error adding student:', err);
      set({
        isLoading: false,
        error: 'Erreur lors de l\'ajout de l\'élève',
      });
      return null;
    }
  },

  // Import students from Excel
  importFromExcel: async (
    fileUri: string,
    userId: string,
    classId: string
  ): Promise<ImportResult> => {
    set({ isLoading: true, error: null, lastImportResult: null });

    try {
      const result = await importStudentsFromExcel(fileUri, userId, classId);

      set({ lastImportResult: result });

      if (result.success) {
        // Reload students for this class
        await get().loadStudentsForClass(classId);
      } else {
        set({
          isLoading: false,
          error: result.errors.join('\n'),
        });
      }

      return result;
    } catch (err) {
      console.error('[StudentStore] Import failed:', err);
      const error = 'Erreur lors de l\'import';
      const result: ImportResult = {
        success: false,
        studentsImported: 0,
        errors: [error],
      };

      set({
        isLoading: false,
        error,
        lastImportResult: result,
      });

      return result;
    }
  },

  // Remove a student
  removeStudent: async (studentId: string, classId: string): Promise<void> => {
    set({ isLoading: true, error: null });

    try {
      await dbDeleteStudent(studentId);

      // Update local state
      set((state) => ({
        studentsByClass: {
          ...state.studentsByClass,
          [classId]: state.studentsByClass[classId]?.filter(
            (s) => s.id !== studentId
          ) || [],
        },
        isLoading: false,
      }));

      console.log('[StudentStore] Removed student:', studentId);
    } catch (err) {
      console.error('[StudentStore] Error removing student:', err);
      set({
        isLoading: false,
        error: 'Erreur lors de la suppression de l\'élève',
      });
    }
  },

  // Clear error
  clearError: (): void => {
    set({ error: null });
  },

  // Clear import result
  clearImportResult: (): void => {
    set({ lastImportResult: null });
  },

  // Reset store (on logout)
  reset: (): void => {
    set({
      studentsByClass: {},
      isLoading: false,
      error: null,
      lastImportResult: null,
    });
  },
}));
