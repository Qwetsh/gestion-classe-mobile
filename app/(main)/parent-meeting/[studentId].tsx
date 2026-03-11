import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import { useParentMeetingStore } from '../../../stores/parentMeetingStore';
import { ORAL_GRADE_LABELS } from '../../../stores/oralEvaluationStore';
import { useGroupSessionStore } from '../../../stores';
import { theme, PERIOD_LABELS_FULL } from '../../../constants';

// Group session grade type
interface GroupSessionGrade {
  sessionId: string;
  sessionName: string;
  classId: string;
  completedAt: string;
  score: number;
  maxScore: number;
}

const screenWidth = Dimensions.get('window').width;

// Format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Get period date range (same logic as parentMeetingStore)
function getPeriodDates(period: string): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  switch (period) {
    case 'T1':
      return { start: new Date(year, 8, 1), end: new Date(year, 11, 31) };
    case 'T2':
      return { start: new Date(year + 1, 0, 1), end: new Date(year + 1, 2, 31) };
    case 'T3':
      return { start: new Date(year + 1, 3, 1), end: new Date(year + 1, 6, 31) };
    case 'year':
    default:
      return { start: new Date(year, 8, 1), end: new Date(year + 1, 6, 31) };
  }
}

export default function StudentDashboardScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const {
    selectedPeriod,
    currentDashboard,
    isLoadingDashboard,
    error,
    loadStudentDashboard,
    clearDashboard,
    clearError,
  } = useParentMeetingStore();
  const { getStudentGrades } = useGroupSessionStore();

  // State for group session grades
  const [groupGrades, setGroupGrades] = useState<GroupSessionGrade[]>([]);
  const [isLoadingGroupGrades, setIsLoadingGroupGrades] = useState(false);

  // Load dashboard on mount
  useEffect(() => {
    if (studentId) {
      loadStudentDashboard(studentId);
    }

    return () => {
      clearDashboard();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, selectedPeriod]);

  // Load group session grades filtered by period
  useEffect(() => {
    const loadGroupGrades = async () => {
      if (!studentId) return;
      setIsLoadingGroupGrades(true);
      try {
        const allGrades = await getStudentGrades(studentId);

        // Filter by selected period
        const { start, end } = getPeriodDates(selectedPeriod);
        const filteredGrades = allGrades.filter(grade => {
          const gradeDate = new Date(grade.completedAt);
          return gradeDate >= start && gradeDate <= end;
        });

        setGroupGrades(filteredGrades);
      } catch (err) {
        console.error('Error loading group grades:', err);
      } finally {
        setIsLoadingGroupGrades(false);
      }
    };
    loadGroupGrades();
  }, [studentId, selectedPeriod, getStudentGrades]);

  const dashboard = currentDashboard;
  const student = dashboard?.student;

  // Chart data
  const chartData = useMemo(() => {
    if (!dashboard) return null;

    return {
      labels: dashboard.weeklyEvolution.map(w => w.week),
      datasets: [
        {
          data: dashboard.weeklyEvolution.map(w => w.participation),
          color: () => theme.colors.participation,
          strokeWidth: 2,
        },
        {
          data: dashboard.weeklyEvolution.map(w => w.bavardage),
          color: () => theme.colors.bavardage,
          strokeWidth: 2,
        },
      ],
      legend: ['Participation', 'Bavardage'],
    };
  }, [dashboard]);

  const chartConfig = {
    backgroundColor: theme.colors.surface,
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
    labelColor: () => theme.colors.textSecondary,
    style: {
      borderRadius: theme.radius.lg,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
    },
  };

  // Show loading or error state when no dashboard yet
  if (!dashboard && !isLoadingDashboard && error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Erreur',
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
            headerShadowVisible: false,
            headerLeft: () => (
              <Pressable
                onPress={() => router.back()}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.backButtonPressed,
                ]}
              >
                <Text style={styles.backButtonText}>← Retour</Text>
              </Pressable>
            ),
          }}
        />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: student?.fullName || student?.pseudo || 'Chargement...',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
          },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
            >
              <Text style={styles.backButtonText}>← Retour</Text>
            </Pressable>
          ),
        }}
      />

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </Pressable>
      )}

      {isLoadingDashboard || !dashboard ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement du bilan...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Student Header */}
          <View style={styles.headerCard}>
            <View style={styles.headerLeft}>
              <View style={styles.studentPhotoPlaceholder}>
                <Text style={styles.studentPhotoEmoji}>👤</Text>
              </View>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.headerName}>
                {dashboard.student.fullName || dashboard.student.pseudo}
              </Text>
              {dashboard.student.fullName && (
                <Text style={styles.headerPseudo}>{dashboard.student.pseudo}</Text>
              )}
              <View style={styles.headerMeta}>
                <Text style={styles.headerPeriod}>
                  {PERIOD_LABELS_FULL[selectedPeriod]}
                </Text>
              </View>
            </View>
          </View>

          {/* Statistics */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📊</Text>
              <Text style={styles.sectionTitle}>STATISTIQUES</Text>
            </View>
            <View style={styles.statsCard}>
              <View style={styles.statsRow}>
                <View style={[styles.statItem, styles.statItemPositive]}>
                  <Text style={styles.statLabel}>Participation</Text>
                  <Text style={[styles.statValue, styles.statValuePositive]}>
                    +{dashboard.stats.participation}
                  </Text>
                </View>
                <View style={[styles.statItem, styles.statItemNegative]}>
                  <Text style={styles.statLabel}>Bavardages</Text>
                  <Text style={[styles.statValue, styles.statValueNegative]}>
                    -{dashboard.stats.bavardage}
                  </Text>
                </View>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Absences</Text>
                  <Text style={styles.statValue}>{dashboard.stats.absence}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Sorties</Text>
                  <Text style={styles.statValue}>{dashboard.stats.sortie}</Text>
                </View>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Score global</Text>
                <View style={[
                  styles.scoreBadge,
                  dashboard.stats.score > 0 && styles.scoreBadgePositive,
                  dashboard.stats.score < 0 && styles.scoreBadgeNegative,
                ]}>
                  <Text style={[
                    styles.scoreBadgeText,
                    dashboard.stats.score > 0 && styles.scoreBadgeTextPositive,
                    dashboard.stats.score < 0 && styles.scoreBadgeTextNegative,
                  ]}>
                    {dashboard.stats.score > 0 ? '+' : ''}{dashboard.stats.score}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Evolution Chart */}
          {chartData && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📈</Text>
                <Text style={styles.sectionTitle}>EVOLUTION (8 semaines)</Text>
              </View>
              <View style={styles.chartCard}>
                <LineChart
                  data={chartData}
                  width={screenWidth - theme.spacing.lg * 4}
                  height={180}
                  chartConfig={chartConfig}
                  bezier
                  style={styles.chart}
                  withInnerLines={false}
                  withOuterLines={false}
                  fromZero
                />
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.participation }]} />
                    <Text style={styles.legendText}>Participation</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: theme.colors.bavardage }]} />
                    <Text style={styles.legendText}>Bavardage</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Oral Evaluation */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🎤</Text>
              <Text style={styles.sectionTitle}>EVALUATION ORALE</Text>
            </View>
            <View style={styles.oralCard}>
              {dashboard.oralEvaluation ? (
                <>
                  <View style={styles.oralGradeRow}>
                    <Text style={styles.oralGradeNumber}>
                      {dashboard.oralEvaluation.grade}/5
                    </Text>
                    <Text style={styles.oralGradeLabel}>
                      {ORAL_GRADE_LABELS[dashboard.oralEvaluation.grade] || ''}
                    </Text>
                  </View>
                  <Text style={styles.oralDate}>
                    Evalue le {formatDate(dashboard.oralEvaluation.evaluated_at)}
                  </Text>
                </>
              ) : (
                <View style={styles.oralEmpty}>
                  <Text style={styles.oralEmptyText}>Non evalue</Text>
                  <Text style={styles.oralEmptySubtext}>
                    Aucune evaluation orale pour cette periode
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Group Session Grades */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>👥</Text>
              <Text style={styles.sectionTitle}>
                NOTES DE GROUPE ({groupGrades.length})
              </Text>
            </View>
            {isLoadingGroupGrades ? (
              <View style={styles.groupGradesLoading}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
              </View>
            ) : groupGrades.length > 0 ? (
              <View style={styles.groupGradesCard}>
                {groupGrades.map((grade, index) => {
                  const percentage = grade.maxScore > 0
                    ? Math.round((grade.score / grade.maxScore) * 100)
                    : 0;
                  return (
                    <View
                      key={grade.sessionId}
                      style={[
                        styles.groupGradeItem,
                        index < groupGrades.length - 1 && styles.groupGradeItemBorder,
                      ]}
                    >
                      <View style={styles.groupGradeHeader}>
                        <Text style={styles.groupGradeName}>{grade.sessionName}</Text>
                        <View style={styles.groupGradeScoreContainer}>
                          <Text style={styles.groupGradeScore}>
                            {grade.score}/{grade.maxScore}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.groupGradeProgressBar}>
                        <View
                          style={[
                            styles.groupGradeProgressFill,
                            { width: `${percentage}%` },
                            percentage >= 70 && styles.groupGradeProgressGood,
                            percentage < 50 && styles.groupGradeProgressLow,
                          ]}
                        />
                      </View>
                      <Text style={styles.groupGradeDate}>
                        {formatDate(grade.completedAt)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.groupGradesEmpty}>
                <Text style={styles.groupGradesEmptyText}>
                  Aucune note de groupe
                </Text>
              </View>
            )}
          </View>

          {/* Remarks */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📝</Text>
              <Text style={styles.sectionTitle}>
                REMARQUES ({dashboard.remarks.length})
              </Text>
            </View>
            {dashboard.remarks.length > 0 ? (
              <View style={styles.remarksCard}>
                {dashboard.remarks.map((remark, index) => (
                  <View
                    key={remark.id}
                    style={[
                      styles.remarkItem,
                      index < dashboard.remarks.length - 1 && styles.remarkItemBorder,
                    ]}
                  >
                    <Text style={styles.remarkDate}>
                      {formatDate(remark.timestamp)}
                    </Text>
                    <Text style={styles.remarkNote}>
                      {remark.note || 'Remarque sans texte'}
                    </Text>
                    {remark.photo_path && (
                      <View style={styles.remarkPhotoContainer}>
                        <Image
                          source={{ uri: remark.photo_path }}
                          style={styles.remarkPhoto}
                          resizeMode="cover"
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.remarksEmpty}>
                <Text style={styles.remarksEmptyText}>
                  Aucune remarque pour cette periode
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  backButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },

  // Error
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  errorBannerText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },

  // Header Card
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  headerLeft: {
    marginRight: theme.spacing.md,
  },
  studentPhotoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentPhotoEmoji: {
    fontSize: 28,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerPseudo: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  headerMeta: {
    marginTop: theme.spacing.xs,
  },
  headerPeriod: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    alignSelf: 'flex-start',
  },

  // Section
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionIcon: {
    fontSize: 16,
    marginRight: theme.spacing.xs,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textTertiary,
    letterSpacing: 0.5,
  },

  // Stats Card
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  statItem: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.xs,
  },
  statItemPositive: {
    backgroundColor: theme.colors.participationSoft,
  },
  statItemNegative: {
    backgroundColor: theme.colors.bavardageSoft,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
  },
  statValuePositive: {
    color: theme.colors.participation,
  },
  statValueNegative: {
    color: theme.colors.bavardage,
  },
  statsDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.md,
    marginHorizontal: theme.spacing.xs,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: theme.spacing.xs,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  scoreBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  scoreBadgePositive: {
    backgroundColor: theme.colors.participationSoft,
  },
  scoreBadgeNegative: {
    backgroundColor: theme.colors.bavardageSoft,
  },
  scoreBadgeText: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  scoreBadgeTextPositive: {
    color: theme.colors.participation,
  },
  scoreBadgeTextNegative: {
    color: theme.colors.bavardage,
  },

  // Chart Card
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  chart: {
    borderRadius: theme.radius.lg,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.xs,
  },
  legendText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  // Oral Card
  oralCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  oralGradeRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: theme.spacing.sm,
  },
  oralGradeNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.colors.remarque,
    marginRight: theme.spacing.sm,
  },
  oralGradeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  oralDate: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  oralEmpty: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
  },
  oralEmptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  oralEmptySubtext: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },

  // Remarks Card
  remarksCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  remarkItem: {
    padding: theme.spacing.md,
  },
  remarkItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  remarkDate: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  remarkNote: {
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 22,
  },
  remarkPhotoContainer: {
    marginTop: theme.spacing.sm,
  },
  remarkPhoto: {
    width: '100%',
    height: 150,
    borderRadius: theme.radius.md,
  },
  remarksEmpty: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  remarksEmptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },

  // Group Grades
  groupGradesLoading: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  groupGradesCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  groupGradeItem: {
    padding: theme.spacing.md,
  },
  groupGradeItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  groupGradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  groupGradeName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  groupGradeScoreContainer: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  groupGradeScore: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  groupGradeProgressBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    marginBottom: theme.spacing.xs,
    overflow: 'hidden',
  },
  groupGradeProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.warning,
    borderRadius: 3,
  },
  groupGradeProgressGood: {
    backgroundColor: theme.colors.success,
  },
  groupGradeProgressLow: {
    backgroundColor: theme.colors.error,
  },
  groupGradeDate: {
    fontSize: 12,
    color: theme.colors.textTertiary,
  },
  groupGradesEmpty: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  groupGradesEmptyText: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
});
