import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { theme } from '../../constants/theme';
import { getGroupColor } from '../../constants/groups';
import { StudentWithMapping } from '../../stores';

interface StudentSelectorProps {
  students: StudentWithMapping[];
  studentGroups: Record<string, number>; // studentId -> groupNumber
  selectedStudentIds: string[];
  onSelectionChange: (studentIds: string[]) => void;
  absentStudentIds?: string[];
}

/**
 * Multi-select list of students for group creation
 * Shows which students are already in groups
 */
export function StudentSelector({
  students,
  studentGroups,
  selectedStudentIds,
  onSelectionChange,
  absentStudentIds = [],
}: StudentSelectorProps) {
  const toggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      onSelectionChange(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      onSelectionChange([...selectedStudentIds, studentId]);
    }
  };

  // Sort students: available first, then in groups
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const aInGroup = studentGroups[a.id] !== undefined;
      const bInGroup = studentGroups[b.id] !== undefined;
      const aAbsent = absentStudentIds.includes(a.id);
      const bAbsent = absentStudentIds.includes(b.id);

      // Absent students at the end
      if (aAbsent && !bAbsent) return 1;
      if (!aAbsent && bAbsent) return -1;

      // Students in groups after available ones
      if (aInGroup && !bInGroup) return 1;
      if (!aInGroup && bInGroup) return -1;

      // Alphabetical by name
      const aName = a.fullName || a.pseudo;
      const bName = b.fullName || b.pseudo;
      return aName.localeCompare(bName);
    });
  }, [students, studentGroups, absentStudentIds]);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator>
      {sortedStudents.map((student) => {
        const groupNumber = studentGroups[student.id];
        const isInGroup = groupNumber !== undefined;
        const isAbsent = absentStudentIds.includes(student.id);
        const isSelected = selectedStudentIds.includes(student.id);
        const isDisabled = isInGroup || isAbsent;

        return (
          <Pressable
            key={student.id}
            style={[
              styles.studentRow,
              isSelected && styles.studentRowSelected,
              isDisabled && styles.studentRowDisabled,
            ]}
            onPress={() => !isDisabled && toggleStudent(student.id)}
            disabled={isDisabled}
          >
            <View style={styles.checkbox}>
              {isSelected && <View style={styles.checkboxInner} />}
            </View>

            <Text
              style={[
                styles.studentName,
                isDisabled && styles.studentNameDisabled,
              ]}
              numberOfLines={1}
            >
              {student.fullName || student.pseudo}
            </Text>

            {isInGroup && (
              <View
                style={[
                  styles.groupIndicator,
                  { backgroundColor: getGroupColor(groupNumber) },
                ]}
              >
                <Text style={styles.groupIndicatorText}>G{groupNumber}</Text>
              </View>
            )}

            {isAbsent && (
              <View style={styles.absentIndicator}>
                <Text style={styles.absentIndicatorText}>ABS</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 300,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  studentRowSelected: {
    borderColor: theme.colors.participation,
    backgroundColor: theme.colors.participation + '10',
  },
  studentRowDisabled: {
    opacity: 0.5,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInner: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: theme.colors.participation,
  },
  studentName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  studentNameDisabled: {
    color: theme.colors.textTertiary,
  },
  groupIndicator: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.sm,
  },
  groupIndicatorText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  absentIndicator: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    marginLeft: theme.spacing.sm,
  },
  absentIndicatorText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
