import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';
import type { SessionGroupWithDetails } from '../../stores/groupSessionStore';
import type { GradingCriteria } from '../../types';
import type { StudentWithMapping } from '../../stores';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDER_PADDING = 24;
const SLIDER_WIDTH = SCREEN_WIDTH - SLIDER_PADDING * 2 - 80;

interface GroupGradingOverlayProps {
  visible: boolean;
  group: SessionGroupWithDetails | null;
  criteria: GradingCriteria[];
  maxPossibleScore: number;
  students: StudentWithMapping[];
  onGradeChange: (groupId: string, criteriaId: string, points: number) => void;
  onApplyMalus: (groupId: string) => void;
  onResetMalus: (groupId: string) => void;
  onClose: () => void;
}

// ---- CriteriaSlider (same pattern as grade.tsx) ----

interface CriteriaSliderProps {
  criteria: GradingCriteria;
  value: number;
  onChange: (value: number) => void;
}

function CriteriaSlider({ criteria, value, onChange }: CriteriaSliderProps) {
  const progress = useRef(new Animated.Value(value / criteria.maxPoints)).current;
  const lastValue = useRef(value);

  const updateValue = useCallback((newProgress: number) => {
    const clampedProgress = Math.max(0, Math.min(1, newProgress));
    const newValue = Math.round(clampedProgress * criteria.maxPoints * 2) / 2;
    if (newValue !== lastValue.current) {
      lastValue.current = newValue;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(newValue);
    }
  }, [criteria.maxPoints, onChange]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const newProgress = evt.nativeEvent.locationX / SLIDER_WIDTH;
        progress.setValue(Math.max(0, Math.min(1, newProgress)));
        updateValue(newProgress);
      },
      onPanResponderMove: (evt) => {
        const newProgress = evt.nativeEvent.locationX / SLIDER_WIDTH;
        progress.setValue(Math.max(0, Math.min(1, newProgress)));
        updateValue(newProgress);
      },
      onPanResponderRelease: () => {
        const finalProgress = lastValue.current / criteria.maxPoints;
        Animated.spring(progress, {
          toValue: finalProgress,
          useNativeDriver: false,
          friction: 8,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      Animated.spring(progress, {
        toValue: value / criteria.maxPoints,
        useNativeDriver: false,
        friction: 8,
      }).start();
    }
  }, [value, criteria.maxPoints, progress]);

  const fillWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const thumbLeft = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SLIDER_WIDTH - 24],
  });

  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.criteriaLabel}>{criteria.label}</Text>
      <View style={styles.sliderRow}>
        <View style={styles.sliderTrack} {...panResponder.panHandlers}>
          <Animated.View style={[styles.sliderFill, { width: fillWidth }]} />
          <Animated.View style={[styles.sliderThumb, { left: thumbLeft }]} />
        </View>
        <View style={styles.valueDisplay}>
          <Text style={styles.valueText}>{value}</Text>
          <Text style={styles.maxText}>/{criteria.maxPoints}</Text>
        </View>
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

export function GroupGradingOverlay({
  visible,
  group,
  criteria,
  maxPossibleScore,
  students,
  onGradeChange,
  onApplyMalus,
  onResetMalus,
  onClose,
}: GroupGradingOverlayProps) {
  const insets = useSafeAreaInsets();
  const malusScale = useRef(new Animated.Value(1)).current;

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

  const handleApplyMalus = () => {
    Animated.sequence([
      Animated.timing(malusScale, {
        toValue: 0.8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(malusScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onApplyMalus(group.id);
  };

  const handleResetMalus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onResetMalus(group.id);
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
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.groupName}>{group.name}</Text>
              <View style={styles.membersRow}>
                {memberNames.map((name, idx) => (
                  <Text key={idx} style={styles.memberText}>
                    {name}{idx < memberNames.length - 1 ? ', ' : ''}
                  </Text>
                ))}
              </View>
            </View>
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreValue}>{currentScore}</Text>
              <Text style={styles.scoreMax}>/{maxPossibleScore}</Text>
            </View>
          </View>

          {/* Criteria sliders */}
          <ScrollView
            style={styles.criteriaSection}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.criteriaSectionContent}
          >
            {criteria.map((crit) => (
              <CriteriaSlider
                key={`${group.id}-${crit.id}`}
                criteria={crit}
                value={getGradeForCriteria(crit.id)}
                onChange={(value) => onGradeChange(group.id, crit.id, value)}
              />
            ))}
          </ScrollView>

          {/* Malus section */}
          <View style={styles.malusSection}>
            <Animated.View style={{ transform: [{ scale: malusScale }] }}>
              <Pressable
                style={styles.malusButton}
                onPress={handleApplyMalus}
                onLongPress={handleResetMalus}
              >
                <Text style={styles.malusButtonText}>-1</Text>
              </Pressable>
            </Animated.View>
            <View style={styles.malusInfo}>
              <Text style={styles.malusLabel}>Malus conduite</Text>
              <Text style={styles.malusCount}>
                {group.conductMalus > 0 ? `-${group.conductMalus}` : '0'}
              </Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Fermer</Text>
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
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  headerLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  groupName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
  },
  membersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },

  // Criteria
  criteriaSection: {
    paddingHorizontal: theme.spacing.lg,
  },
  criteriaSectionContent: {
    paddingBottom: theme.spacing.md,
  },
  sliderContainer: {
    marginBottom: theme.spacing.lg,
  },
  criteriaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  sliderTrack: {
    flex: 1,
    height: 40,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.lg,
  },
  sliderThumb: {
    position: 'absolute',
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  valueDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minWidth: 60,
    justifyContent: 'flex-end',
  },
  valueText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  maxText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },

  // Malus
  malusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  malusButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  malusButtonText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  malusInfo: {
    flex: 1,
  },
  malusLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  malusCount: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.error,
  },
  closeButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceHover,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
});
