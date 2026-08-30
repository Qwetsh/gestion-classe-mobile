import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';
import type { SessionGroupWithDetails } from '../../stores/groupSessionStore';
import type { GradingCriteria } from '../../types';
import type { StudentWithMapping } from '../../stores';

interface GroupGradingOverlayProps {
  visible: boolean;
  group: SessionGroupWithDetails | null;
  /** Tous les groupes de la seance (navigation inter-groupes + pastilles). */
  groups: SessionGroupWithDetails[];
  criteria: GradingCriteria[];
  maxPossibleScore: number;
  students: StudentWithMapping[];
  onGradeChange: (groupId: string, criteriaId: string, points: number) => void;
  /** Stepper malus explicite : delta = +1 ou -1. */
  onMalusChange: (groupId: string, delta: number) => void;
  onSelectGroup: (group: SessionGroupWithDetails) => void;
  onClose: () => void;
}

/** Affiche 3,5 au lieu de 3.5 */
function formatPoints(value: number): string {
  return value.toLocaleString('fr-FR');
}

// ---- Stepper de critere (remplace les sliders, maquette 10b) ----

interface CriteriaStepperProps {
  criteria: GradingCriteria;
  value: number;
  onChange: (value: number) => void;
}

function CriteriaStepper({ criteria, value, onChange }: CriteriaStepperProps) {
  const step = 0.5;

  const change = (delta: number) => {
    const next = Math.max(0, Math.min(criteria.maxPoints, value + delta));
    if (next !== value) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(next);
    }
  };

  const progress = criteria.maxPoints > 0 ? value / criteria.maxPoints : 0;

  return (
    <View style={styles.criteriaRow}>
      <View style={styles.criteriaInfo}>
        <Text style={styles.criteriaLabel} numberOfLines={1}>
          {criteria.label}
        </Text>
        <View style={styles.criteriaProgressTrack}>
          <View style={[styles.criteriaProgressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      </View>
      <View style={styles.stepperRow}>
        <Pressable
          style={({ pressed }) => [
            styles.stepperMinus,
            value <= 0 && styles.stepperDisabled,
            pressed && styles.stepperPressed,
          ]}
          onPress={() => change(-step)}
          disabled={value <= 0}
          hitSlop={6}
        >
          <Minus size={17} color={value <= 0 ? theme.colors.textTertiary : theme.colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.stepperValue}>
          {formatPoints(value)}/{criteria.maxPoints}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.stepperPlus,
            value >= criteria.maxPoints && styles.stepperDisabled,
            pressed && styles.stepperPressed,
          ]}
          onPress={() => change(step)}
          disabled={value >= criteria.maxPoints}
          hitSlop={6}
        >
          <Plus size={17} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

// ---- Main Overlay ----

function getDisplayName(student: StudentWithMapping): string {
  if (student.firstName) {
    const lastName = student.lastName ? ` ${student.lastName.substring(0, 2)}.` : '';
    return `${student.firstName}${lastName}`;
  }
  return student.fullName || student.pseudo;
}

function isGraded(group: SessionGroupWithDetails, criteriaCount: number): boolean {
  return criteriaCount > 0 && group.grades.length >= criteriaCount;
}

export function GroupGradingOverlay({
  visible,
  group,
  groups,
  criteria,
  maxPossibleScore,
  students,
  onGradeChange,
  onMalusChange,
  onSelectGroup,
  onClose,
}: GroupGradingOverlayProps) {
  const insets = useSafeAreaInsets();

  if (!group) return null;

  const currentScore = group.totalScore;
  const memberNames = group.memberIds
    .map((id) => students.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => getDisplayName(s!));

  const getGradeForCriteria = (criteriaId: string): number => {
    const grade = group.grades.find((g) => g.criteriaId === criteriaId);
    return grade?.pointsAwarded ?? 0;
  };

  const currentIndex = groups.findIndex((g) => g.id === group.id);
  const prevGroup = currentIndex > 0 ? groups[currentIndex - 1] : null;
  const nextGroup = currentIndex >= 0 && currentIndex < groups.length - 1 ? groups[currentIndex + 1] : null;
  const isLast = !nextGroup;

  const handleMalus = (delta: number) => {
    if (delta < 0 && group.conductMalus <= 0) return;
    Haptics.notificationAsync(
      delta > 0 ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success
    );
    onMalusChange(group.id, delta);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Titre + navigation inter-groupes */}
          <View style={styles.navRow}>
            <Pressable
              style={[styles.navArrow, !prevGroup && styles.navArrowDisabled]}
              onPress={() => prevGroup && onSelectGroup(prevGroup)}
              disabled={!prevGroup}
              hitSlop={8}
            >
              <ChevronLeft
                size={22}
                color={prevGroup ? theme.colors.text : theme.colors.textTertiary}
                strokeWidth={2}
              />
            </Pressable>
            <View style={styles.navCenter}>
              <Text style={styles.groupName}>{group.name}</Text>
              <Text style={styles.membersLine} numberOfLines={1}>
                {memberNames.join(', ')}
              </Text>
            </View>
            <Pressable
              style={[styles.navArrow, !nextGroup && styles.navArrowDisabled]}
              onPress={() => nextGroup && onSelectGroup(nextGroup)}
              disabled={!nextGroup}
              hitSlop={8}
            >
              <ChevronRight
                size={22}
                color={nextGroup ? theme.colors.text : theme.colors.textTertiary}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          {/* Pastilles de progression */}
          <View style={styles.dotsRow}>
            {groups.map((g) => {
              const graded = isGraded(g, criteria.length);
              const isCurrent = g.id === group.id;
              return (
                <Pressable key={g.id} onPress={() => onSelectGroup(g)} hitSlop={6}>
                  <View
                    style={[
                      styles.dot,
                      graded && styles.dotGraded,
                      isCurrent && styles.dotCurrent,
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>

          {/* Criteres en steppers */}
          <ScrollView
            style={styles.criteriaSection}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.criteriaSectionContent}
          >
            {criteria.map((crit) => (
              <CriteriaStepper
                key={`${group.id}-${crit.id}`}
                criteria={crit}
                value={getGradeForCriteria(crit.id)}
                onChange={(value) => onGradeChange(group.id, crit.id, value)}
              />
            ))}

            {/* Malus conduite : ligne rouge avec steppers explicites */}
            <View style={styles.malusRow}>
              <View style={styles.malusInfo}>
                <Text style={styles.malusLabel}>Malus conduite</Text>
                <Text style={styles.malusCount}>
                  {group.conductMalus > 0 ? `−${group.conductMalus} pt${group.conductMalus > 1 ? 's' : ''}` : 'Aucun'}
                </Text>
              </View>
              <View style={styles.stepperRow}>
                <Pressable
                  style={({ pressed }) => [
                    styles.stepperMinus,
                    group.conductMalus <= 0 && styles.stepperDisabled,
                    pressed && styles.stepperPressed,
                  ]}
                  onPress={() => handleMalus(-1)}
                  disabled={group.conductMalus <= 0}
                  hitSlop={6}
                >
                  <Minus
                    size={17}
                    color={group.conductMalus <= 0 ? theme.colors.textTertiary : theme.colors.text}
                    strokeWidth={2}
                  />
                </Pressable>
                <Text style={[styles.stepperValue, styles.malusValue]}>
                  {group.conductMalus}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.malusPlus, pressed && styles.stepperPressed]}
                  onPress={() => handleMalus(1)}
                  hitSlop={6}
                >
                  <Plus size={17} color="#FFFFFF" strokeWidth={2} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          {/* Footer : total + groupe suivant */}
          <View style={styles.footer}>
            <View style={styles.totalContainer}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>
                {formatPoints(currentScore)}
                <Text style={styles.totalMax}>/{maxPossibleScore}</Text>
              </Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.nextButton, pressed && styles.stepperPressed]}
              onPress={() => (isLast ? onClose() : onSelectGroup(nextGroup!))}
            >
              <Text style={styles.nextButtonText}>
                {isLast ? 'Terminer la notation' : 'Groupe suivant →'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.sheetBackdrop,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingHorizontal: 24,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm + 2,
    marginBottom: theme.spacing.md,
  },

  // Navigation
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  navArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navArrowDisabled: {
    borderColor: theme.colors.borderLight,
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  groupName: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
  },
  membersLine: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },

  // Pastilles
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.md,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.segmentTrack,
  },
  dotGraded: {
    backgroundColor: theme.colors.action,
  },
  dotCurrent: {
    width: 18,
    backgroundColor: theme.colors.primary,
  },

  // Criteres
  criteriaSection: {
    flexGrow: 0,
  },
  criteriaSectionContent: {
    paddingBottom: theme.spacing.sm,
  },
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    gap: theme.spacing.md,
  },
  criteriaInfo: {
    flex: 1,
  },
  criteriaLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: 6,
  },
  criteriaProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.segmentTrack,
    overflow: 'hidden',
  },
  criteriaProgressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },

  // Steppers
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  stepperMinus: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperPlus: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperDisabled: {
    opacity: 0.45,
  },
  stepperPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  stepperValue: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 17,
    color: theme.colors.text,
    minWidth: 52,
    textAlign: 'center',
  },

  // Malus
  malusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.absentBg,
    borderWidth: 1,
    borderColor: theme.colors.absentBorder,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  malusInfo: {
    flex: 1,
  },
  malusLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.absentText,
  },
  malusCount: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.absentText,
    marginTop: 1,
  },
  malusValue: {
    color: theme.colors.absentText,
    minWidth: 30,
  },
  malusPlus: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  totalContainer: {},
  totalLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 20,
    color: theme.colors.text,
  },
  totalMax: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  nextButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nextButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.textInverse,
  },
});
