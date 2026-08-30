import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import { ORAL_GRADE_LABELS, type StudentWithMapping } from '../../stores';
import { triggerLightFeedback } from '../../utils/haptics';

interface OralEvaluationSheetProps {
  visible: boolean;
  /** Eleves presents non evalues ce trimestre. */
  unevaluated: StudentWithMapping[];
  evaluatedCount: number;
  totalPresent: number;
  trimester: number;
  isSaving: boolean;
  onSave: (student: StudentWithMapping, grade: number) => void;
  onChooseStudent: () => void;
  /** Eleve choisi manuellement via le picker (sinon tirage au hasard). */
  pickedStudent: StudentWithMapping | null;
  onClose: () => void;
}

/** Sheet "Évaluation orale" (maquette 9b) : eleve tire + notes 0-5 + CTA vert. */
export function OralEvaluationSheet({
  visible,
  unevaluated,
  evaluatedCount,
  totalPresent,
  trimester,
  isSaving,
  onSave,
  onChooseStudent,
  pickedStudent,
  onClose,
}: OralEvaluationSheetProps) {
  const [student, setStudent] = useState<StudentWithMapping | null>(null);
  const [grade, setGrade] = useState<number | null>(null);

  const drawRandom = useCallback(() => {
    if (unevaluated.length === 0) return;
    const index = Math.floor(Math.random() * unevaluated.length);
    setStudent(unevaluated[index]);
    setGrade(null);
  }, [unevaluated]);

  useEffect(() => {
    if (visible) {
      if (pickedStudent) {
        setStudent(pickedStudent);
        setGrade(null);
      } else {
        drawRandom();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pickedStudent]);

  const initial = student ? (student.fullName || student.pseudo).charAt(0).toUpperCase() : '';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Évaluation orale</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {evaluatedCount}/{totalPresent} évalués
          </Text>
        </View>
      </View>
      <Text style={styles.trimesterLine}>
        Trimestre {trimester} · {unevaluated.length} restant{unevaluated.length > 1 ? 's' : ''}
      </Text>

      {/* Eleve tire */}
      <View style={styles.studentCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>
            {student ? student.fullName || student.pseudo : '—'}
          </Text>
          <Text style={styles.studentHint}>Tiré parmi les non-évalués</Text>
        </View>
        <Pressable onPress={onChooseStudent} hitSlop={8}>
          <Text style={styles.chooseLink}>Choisir</Text>
        </Pressable>
      </View>

      {/* Notes 0-5 */}
      <View style={styles.gradesRow}>
        {[0, 1, 2, 3, 4, 5].map((g) => (
          <Pressable
            key={g}
            style={[styles.gradeButton, grade === g && styles.gradeButtonSelected]}
            onPress={() => {
              setGrade(g);
              triggerLightFeedback();
            }}
          >
            <Text style={[styles.gradeButtonText, grade === g && styles.gradeButtonTextSelected]}>
              {g}
            </Text>
          </Pressable>
        ))}
      </View>
      {grade !== null && ORAL_GRADE_LABELS[grade] ? (
        <Text style={styles.gradeLabel}>{ORAL_GRADE_LABELS[grade]}</Text>
      ) : (
        <Text style={styles.gradeLabel}> </Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          (grade === null || !student || isSaving) && styles.saveButtonDisabled,
          pressed && styles.buttonPressed,
        ]}
        onPress={() => {
          if (student && grade !== null) onSave(student, grade);
        }}
        disabled={grade === null || !student || isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color={theme.colors.textInverse} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>
            Enregistrer {grade !== null ? `${grade}/5` : ''}
          </Text>
        )}
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
  },
  countBadge: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  countBadgeText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.primary,
  },
  trimesterLine: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 17,
    color: theme.colors.textInverse,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 16,
    color: theme.colors.text,
  },
  studentHint: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  chooseLink: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.primary,
  },
  gradesRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  gradeButton: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradeButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  gradeButtonText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 17,
    color: theme.colors.text,
  },
  gradeButtonTextSelected: {
    color: theme.colors.textInverse,
  },
  gradeLabel: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  saveButton: {
    backgroundColor: theme.colors.action,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: theme.colors.segmentTrack,
  },
  saveButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 16,
    color: theme.colors.textInverse,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
