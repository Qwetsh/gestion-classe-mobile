import { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { theme } from '../../../../constants/theme';
import { useGroupSessionStore, useStudentStore, type StudentWithMapping } from '../../../../stores';

export default function GroupSessionSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    activeSession,
    loadSession,
    clearActiveSession,
    getGroupScore,
    getMaxScore,
  } = useGroupSessionStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();

  const session = activeSession?.session;
  const criteria = activeSession?.criteria || [];
  const groups = activeSession?.groups || [];
  const maxScore = getMaxScore();

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

  const getStudentName = (studentId: string): string => {
    const student = students.find((s: StudentWithMapping) => s.id === studentId);
    if (!student) return '?';
    const firstName = student.firstName || student.pseudo;
    const lastName = student.lastName ? `${student.lastName.substring(0, 2)}.` : '';
    return `${firstName} ${lastName}`.trim();
  };

  const handleGoHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearActiveSession();
    router.replace('/(main)');
  };

  const handleViewHistory = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearActiveSession();
    router.push('/(main)/history');
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

  // Sort groups by score (descending)
  const sortedGroups = [...groups].sort((a, b) => {
    const scoreA = getGroupScore(a.id);
    const scoreB = getGroupScore(b.id);
    return scoreB - scoreA;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.title}>Séance terminée</Text>
        <Text style={styles.subtitle}>{session.name}</Text>
      </View>

      {/* Results */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Résultats par groupe</Text>

        {sortedGroups.map((group, index) => {
          const score = getGroupScore(group.id);
          const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
          const isFirst = index === 0;

          return (
            <View
              key={group.id}
              style={[styles.groupCard, isFirst && styles.groupCardFirst]}
            >
              <View style={styles.groupHeader}>
                <View style={styles.groupRank}>
                  <Text style={[styles.rankText, isFirst && styles.rankTextFirst]}>
                    #{index + 1}
                  </Text>
                </View>
                <View style={styles.groupInfo}>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <View style={styles.membersList}>
                    {group.memberIds.map((studentId, i) => (
                      <Text key={studentId} style={styles.memberName}>
                        {getStudentName(studentId)}
                        {i < group.memberIds.length - 1 ? ', ' : ''}
                      </Text>
                    ))}
                  </View>
                </View>
                <View style={styles.scoreContainer}>
                  <Text style={[styles.scoreValue, isFirst && styles.scoreValueFirst]}>
                    {score}
                  </Text>
                  <Text style={styles.scoreMax}>/{maxScore}</Text>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${percentage}%` },
                    isFirst && styles.progressFillFirst,
                  ]}
                />
              </View>

              {/* Details */}
              <View style={styles.detailsRow}>
                {criteria.map(crit => {
                  const grade = group.grades.find(g => g.criteriaId === crit.id);
                  const points = grade?.pointsAwarded ?? 0;
                  return (
                    <View key={crit.id} style={styles.detailItem}>
                      <Text style={styles.detailLabel}>{crit.label}</Text>
                      <Text style={styles.detailValue}>
                        {points}/{crit.maxPoints}
                      </Text>
                    </View>
                  );
                })}
                {group.conductMalus > 0 && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Malus</Text>
                    <Text style={styles.detailValueMalus}>
                      -{group.conductMalus}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* Stats summary */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Statistiques</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{groups.length}</Text>
              <Text style={styles.statLabel}>Groupes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {groups.reduce((sum, g) => sum + g.memberIds.length, 0)}
              </Text>
              <Text style={styles.statLabel}>Élèves</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{criteria.length}</Text>
              <Text style={styles.statLabel}>Critères</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {groups.length > 0
                  ? Math.round(
                      groups.reduce((sum, g) => sum + getGroupScore(g.id), 0) /
                        groups.length *
                        10
                    ) / 10
                  : 0}
              </Text>
              <Text style={styles.statLabel}>Moyenne</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={styles.secondaryButton}
          onPress={handleViewHistory}
        >
          <Text style={styles.secondaryButtonText}>Voir l'historique</Text>
        </Pressable>
        <Pressable
          style={styles.primaryButton}
          onPress={handleGoHome}
        >
          <Text style={styles.primaryButtonText}>Retour à l'accueil</Text>
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
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.successSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  successIconText: {
    fontSize: 32,
    color: theme.colors.success,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },

  // Group cards
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  groupCardFirst: {
    borderWidth: 2,
    borderColor: theme.colors.warning,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  groupRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  rankTextFirst: {
    color: theme.colors.warning,
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  membersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  memberName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  scoreValueFirst: {
    color: theme.colors.warning,
  },
  scoreMax: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },

  // Progress bar
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 3,
  },
  progressFillFirst: {
    backgroundColor: theme.colors.warning,
  },

  // Details
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  detailItem: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  detailLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  detailValueMalus: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.error,
  },

  // Stats card
  statsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
});
