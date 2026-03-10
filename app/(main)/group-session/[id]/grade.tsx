import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '../../../../constants/theme';
import { useGroupSessionStore, useStudentStore, type StudentWithMapping } from '../../../../stores';
import type { GradingCriteria } from '../../../../stores';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SLIDER_PADDING = 32;
const SLIDER_WIDTH = SCREEN_WIDTH - SLIDER_PADDING * 2 - 80; // Account for value display

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
    const newValue = Math.round(clampedProgress * criteria.maxPoints * 2) / 2; // Round to 0.5
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
        // Snap to final value
        const finalProgress = lastValue.current / criteria.maxPoints;
        Animated.spring(progress, {
          toValue: finalProgress,
          useNativeDriver: false,
          friction: 8,
        }).start();
      },
    })
  ).current;

  // Sync external value changes
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

export default function GradeGroupSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    activeSession,
    loadSession,
    setGrade,
    applyMalus,
    resetMalus,
    completeSession,
    getGroupScore,
    getMaxScore,
  } = useGroupSessionStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();

  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);

  // Animation for malus button
  const malusScale = useRef(new Animated.Value(1)).current;

  const session = activeSession?.session;
  const criteria = activeSession?.criteria || [];
  const groups = activeSession?.groups || [];
  const currentGroup = groups[selectedGroupIndex];

  // Get students for the class
  const students = useMemo(() => {
    return session?.classId ? (studentsByClass[session.classId] || []) : [];
  }, [session?.classId, studentsByClass]);

  // Load session on mount
  useEffect(() => {
    if (id) {
      loadSession(id);
    }
  }, [id, loadSession]);

  // Load students for the class
  useEffect(() => {
    if (session?.classId) {
      loadStudentsForClass(session.classId);
    }
  }, [session?.classId, loadStudentsForClass]);

  const maxScore = getMaxScore();
  const currentScore = currentGroup ? getGroupScore(currentGroup.id) : 0;

  const getStudentName = (studentId: string): string => {
    const student = students.find((s: StudentWithMapping) => s.id === studentId);
    if (!student) return '?';
    const firstName = student.firstName || student.pseudo;
    const lastName = student.lastName ? `${student.lastName.substring(0, 2)}.` : '';
    return `${firstName} ${lastName}`.trim();
  };

  const handleGradeChange = async (criteriaId: string, points: number) => {
    if (!currentGroup) return;
    await setGrade(currentGroup.id, criteriaId, points);
  };

  const handleApplyMalus = async () => {
    if (!currentGroup) return;

    // Animate button
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
    await applyMalus(currentGroup.id, 1);
  };

  const handleResetMalus = async () => {
    if (!currentGroup) return;
    Alert.alert(
      'Réinitialiser le malus',
      'Voulez-vous remettre le malus à 0 ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await resetMalus(currentGroup.id);
          },
        },
      ]
    );
  };

  const handleComplete = () => {
    Alert.alert(
      'Terminer la séance',
      'Voulez-vous finaliser et enregistrer les notes ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Terminer',
          onPress: async () => {
            setIsCompleting(true);
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await completeSession();
              router.replace(`/(main)/group-session/${id}/summary`);
            } catch (error) {
              console.error('Error completing session:', error);
              Alert.alert('Erreur', 'Impossible de terminer la séance');
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ]
    );
  };

  const getGradeForCriteria = (criteriaId: string): number => {
    if (!currentGroup) return 0;
    const grade = currentGroup.grades.find(g => g.criteriaId === criteriaId);
    return grade?.pointsAwarded ?? 0;
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerInfo}>
          <Text style={styles.sessionName}>{session.name}</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>EN COURS</Text>
          </View>
        </View>
      </View>

      {/* Group tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.groupTabs}
        contentContainerStyle={styles.groupTabsContent}
      >
        {groups.map((group, index) => {
          const groupScore = getGroupScore(group.id);
          return (
            <Pressable
              key={group.id}
              style={[
                styles.groupTab,
                selectedGroupIndex === index && styles.groupTabSelected,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedGroupIndex(index);
              }}
            >
              <Text style={[
                styles.groupTabName,
                selectedGroupIndex === index && styles.groupTabNameSelected,
              ]}>
                {group.name}
              </Text>
              <Text style={[
                styles.groupTabScore,
                selectedGroupIndex === index && styles.groupTabScoreSelected,
              ]}>
                {groupScore}/{maxScore}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Current group content */}
      {currentGroup && (
        <>
          {/* Score display */}
          <View style={styles.scoreSection}>
            <View style={styles.scoreDisplay}>
              <Text style={styles.scoreValue}>{currentScore}</Text>
              <Text style={styles.scoreMax}>/{maxScore}</Text>
            </View>
            {currentGroup.conductMalus > 0 && (
              <Text style={styles.malusInfo}>
                (dont {currentGroup.conductMalus} malus)
              </Text>
            )}
          </View>

          {/* Group members */}
          <View style={styles.membersSection}>
            <Text style={styles.membersLabel}>Membres :</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.membersList}>
                {currentGroup.memberIds.map(studentId => (
                  <View key={studentId} style={styles.memberChip}>
                    <Text style={styles.memberChipText}>
                      {getStudentName(studentId)}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Criteria sliders */}
          <ScrollView style={styles.criteriaSection} showsVerticalScrollIndicator={false}>
            {criteria.map(crit => (
              <CriteriaSlider
                key={`${currentGroup.id}-${crit.id}`}
                criteria={crit}
                value={getGradeForCriteria(crit.id)}
                onChange={(value) => handleGradeChange(crit.id, value)}
              />
            ))}
          </ScrollView>

          {/* Malus button */}
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
            <View style={styles.malusInfo2}>
              <Text style={styles.malusLabel}>Malus conduite</Text>
              <Text style={styles.malusCount}>
                {currentGroup.conductMalus > 0 ? `-${currentGroup.conductMalus}` : '0'}
              </Text>
            </View>
          </View>
        </>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.completeButton, isCompleting && styles.completeButtonDisabled]}
          onPress={handleComplete}
          disabled={isCompleting}
        >
          <Text style={styles.completeButtonText}>
            {isCompleting ? 'Enregistrement...' : 'Terminer la séance'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },

  // Header
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginRight: theme.spacing.xs,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.success,
    letterSpacing: 0.5,
  },

  // Group tabs
  groupTabs: {
    flexGrow: 0,
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  groupTabsContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  groupTab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    marginRight: theme.spacing.sm,
    alignItems: 'center',
    minWidth: 100,
  },
  groupTabSelected: {
    backgroundColor: theme.colors.primary,
  },
  groupTabName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  groupTabNameSelected: {
    color: theme.colors.textInverse,
  },
  groupTabScore: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  groupTabScoreSelected: {
    color: 'rgba(255,255,255,0.8)',
  },

  // Score display
  scoreSection: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  scoreDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  scoreMax: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.colors.textTertiary,
  },
  malusInfo: {
    fontSize: 14,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },

  // Members
  membersSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  membersLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  membersList: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  memberChip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  memberChipText: {
    fontSize: 13,
    color: theme.colors.text,
  },

  // Criteria sliders
  criteriaSection: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
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

  // Malus section
  malusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.lg,
  },
  malusButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  malusButtonText: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  malusInfo2: {
    alignItems: 'flex-start',
  },
  malusLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  malusCount: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.error,
  },

  // Footer
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  completeButton: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  completeButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  completeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
});
