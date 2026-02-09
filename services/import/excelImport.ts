import * as XLSX from 'xlsx';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import {
  createStudentsBatch,
  createLocalMappingsBatch,
} from '../database';
import {
  generatePseudonym,
  normalizeName,
  generateFullName,
} from '../../utils';

/**
 * Excel import result
 */
export interface ImportResult {
  success: boolean;
  studentsImported: number;
  errors: string[];
}

/**
 * Student data from Excel
 */
interface ExcelStudent {
  firstName: string;
  lastName: string;
}

/**
 * Parse Excel file and return student data
 */
async function parseExcelFile(fileUri: string): Promise<ExcelStudent[]> {
  // Read file as base64
  const base64 = await readAsStringAsync(fileUri, {
    encoding: EncodingType.Base64,
  });

  // Parse Excel
  const workbook = XLSX.read(base64, { type: 'base64' });

  // Get first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Le fichier Excel est vide');
  }

  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: '',
  });

  if (data.length < 2) {
    throw new Error('Le fichier doit contenir au moins un en-tete et une ligne de donnees');
  }

  // Find column indices
  const headers = data[0].map((h) => h?.toString().toLowerCase().trim() || '');

  // Look for "Nom" and "Prénom" columns (case insensitive)
  let lastNameIndex = headers.findIndex((h) =>
    h === 'nom' || h === 'nom de famille' || h === 'lastname' || h === 'last name'
  );
  let firstNameIndex = headers.findIndex((h) =>
    h === 'prenom' || h === 'prénom' || h === 'firstname' || h === 'first name'
  );

  // If not found by name, try first two columns
  if (lastNameIndex === -1 || firstNameIndex === -1) {
    if (data[0].length >= 2) {
      // Assume Nom is first, Prénom is second
      lastNameIndex = 0;
      firstNameIndex = 1;
      console.log('[ExcelImport] Using column positions: Nom=0, Prénom=1');
    } else {
      throw new Error('Le fichier doit contenir les colonnes "Nom" et "Prénom"');
    }
  }

  // Parse student rows
  const students: ExcelStudent[] = [];
  const errors: string[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lastName = row[lastNameIndex]?.toString().trim() || '';
    const firstName = row[firstNameIndex]?.toString().trim() || '';

    if (!lastName && !firstName) {
      // Skip empty rows
      continue;
    }

    if (!lastName) {
      errors.push(`Ligne ${i + 1}: Nom manquant`);
      continue;
    }

    if (!firstName) {
      errors.push(`Ligne ${i + 1}: Prénom manquant`);
      continue;
    }

    students.push({
      firstName: normalizeName(firstName),
      lastName: normalizeName(lastName),
    });
  }

  if (errors.length > 0) {
    console.warn('[ExcelImport] Parse warnings:', errors);
  }

  return students;
}

/**
 * Import students from an Excel file into a class
 */
export async function importStudentsFromExcel(
  fileUri: string,
  userId: string,
  classId: string
): Promise<ImportResult> {
  const errors: string[] = [];

  try {
    // Parse Excel file
    const excelStudents = await parseExcelFile(fileUri);

    if (excelStudents.length === 0) {
      return {
        success: false,
        studentsImported: 0,
        errors: ['Aucun élève valide trouvé dans le fichier'],
      };
    }

    // Prepare student data with pseudonyms
    const studentsToCreate = excelStudents.map((s) => ({
      pseudo: generatePseudonym(s.firstName, s.lastName),
      classId,
    }));

    // Create students in batch
    const studentIds = await createStudentsBatch(userId, studentsToCreate);

    // Create local mappings in batch (RGPD - never synced)
    const mappingsToCreate = excelStudents.map((s, index) => ({
      studentId: studentIds[index],
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: generateFullName(s.firstName, s.lastName),
    }));

    await createLocalMappingsBatch(mappingsToCreate);

    console.log('[ExcelImport] Successfully imported', studentIds.length, 'students');

    return {
      success: true,
      studentsImported: studentIds.length,
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[ExcelImport] Import failed:', message);

    return {
      success: false,
      studentsImported: 0,
      errors: [message],
    };
  }
}
