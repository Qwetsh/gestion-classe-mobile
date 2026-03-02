/**
 * Group-related constants
 */

// Colors for group badges (up to 8 groups)
export const GROUP_COLORS = [
  '#3B82F6', // Bleu
  '#10B981', // Vert
  '#F59E0B', // Orange
  '#8B5CF6', // Violet
  '#EC4899', // Rose
  '#06B6D4', // Cyan
  '#EF4444', // Rouge
  '#84CC16', // Lime
] as const;

// Get color for a group number (1-indexed)
export function getGroupColor(groupNumber: number): string {
  const index = (groupNumber - 1) % GROUP_COLORS.length;
  return GROUP_COLORS[index];
}

// Available grade scales
export const GRADE_SCALES = [5, 10, 20] as const;
export type GradeScale = (typeof GRADE_SCALES)[number];

// Default grade scale
export const DEFAULT_GRADE_SCALE: GradeScale = 20;
