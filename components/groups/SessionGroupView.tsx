import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Settings, Users } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { SessionGroupWithDetails } from '../../stores/groupSessionStore';
import type { GradingCriteria } from '../../types';
import type { StudentWithMapping } from '../../stores';

interface SessionGroupViewProps {
  groups: SessionGroupWithDetails[];
  criteria: GradingCriteria[];
  maxPossibleScore: number;
  students: StudentWithMapping[];
  isLoading: boolean;
  isEmpty: boolean;
  /** Nom du TP affiche dans la barre au-dessus de la liste. */
  tpName?: string | null;
  onGroupPress?: (group: SessionGroupWithDetails) => void;
  onConfigureGroups?: () => void;
}

function getDisplayName(student: StudentWithMapping): string {
  return student.fullName || student.pseudo;
}

type GroupStatus = 'graded' | 'inProgress' | 'toGrade';

function getGroupStatus(group: SessionGroupWithDetails, criteriaCount: number): GroupStatus {
  if (criteriaCount > 0 && group.grades.length >= criteriaCount) return 'graded';
  if (group.grades.length > 0) return 'inProgress';
  return 'toGrade';
}

const STATUS_META: Record<GroupStatus, { label: string; bg: string; fg: string }> = {
  graded: { label: 'NOTÉ', bg: theme.colors.actionSoft, fg: theme.colors.action },
  inProgress: { label: 'EN COURS', bg: theme.colors.primarySoft, fg: theme.colors.primary },
  toGrade: { label: 'À NOTER', bg: theme.colors.surfaceSecondary, fg: theme.colors.textSecondary },
};

function SessionGroupViewInner({
  groups,
  criteria,
  maxPossibleScore,
  students,
  isLoading,
  isEmpty,
  tpName,
  onGroupPress,
  onConfigureGroups,
}: SessionGroupViewProps) {
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View style={styles.centered}>
        <View style={styles.emptyIconCircle}>
          <Users size={30} color={theme.colors.primary} strokeWidth={1.7} />
        </View>
        <Text style={styles.emptyTitle}>Aucun groupe configuré</Text>
        <Text style={styles.emptySubtitle}>
          Créez des groupes et définissez les critères de notation pour cette séance
        </Text>
        {onConfigureGroups && (
          <Pressable
            style={({ pressed }) => [styles.configureButton, pressed && styles.pressed]}
            onPress={onConfigureGroups}
          >
            <Text style={styles.configureButtonText}>Configurer les groupes</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const gradedCount = groups.filter(
    (g) => getGroupStatus(g, criteria.length) === 'graded'
  ).length;

  return (
    <View style={styles.container}>
      {/* Barre au-dessus de la liste */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {tpName ? `${tpName} · ` : ''}
          <Text style={styles.topBarMax}>/{maxPossibleScore} pts</Text>
        </Text>
        <View style={styles.topBarRight}>
          <View style={styles.gradedBadge}>
            <Text style={styles.gradedBadgeText}>
              {gradedCount}/{groups.length} notés
            </Text>
          </View>
          {onConfigureGroups && (
            <Pressable onPress={onConfigureGroups} hitSlop={6} style={styles.gearButton}>
              <Settings size={17} color={theme.colors.textSecondary} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {groups.map((group) => {
          const memberNames = group.memberIds
            .map((id) => students.find((s) => s.id === id))
            .filter(Boolean)
            .map((s) => getDisplayName(s!).split(' ')[0]);
          const status = getGroupStatus(group, criteria.length);
          const meta = STATUS_META[status];
          const progress =
            maxPossibleScore > 0 ? Math.min(group.totalScore / maxPossibleScore, 1) : 0;

          return (
            <Pressable
              key={group.id}
              style={({ pressed }) => [
                styles.groupCard,
                status === 'inProgress' && styles.groupCardInProgress,
                onGroupPress && pressed && styles.pressed,
              ]}
              onPress={() => onGroupPress?.(group)}
              disabled={!onGroupPress}
            >
              <View style={styles.groupHeader}>
                <Text style={styles.groupName}>{group.name}</Text>
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: meta.fg }]}>{meta.label}</Text>
                </View>
                {group.conductMalus > 0 && (
                  <View style={styles.malusBadge}>
                    <Text style={styles.malusText}>−{group.conductMalus} malus</Text>
                  </View>
                )}
                <View style={styles.scoreContainer}>
                  <Text style={styles.scoreValue}>{group.totalScore}</Text>
                  <Text style={styles.scoreMax}>/{maxPossibleScore}</Text>
                </View>
              </View>

              {/* Barre de progression */}
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor:
                        status === 'graded' ? theme.colors.action : theme.colors.primary,
                    },
                  ]}
                />
              </View>

              <Text style={styles.membersLine} numberOfLines={1}>
                {memberNames.length > 0 ? memberNames.join(', ') : 'Aucun membre'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const SessionGroupView = React.memo(SessionGroupViewInner);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignSelf: 'stretch',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  topBarMax: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  gradedBadge: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  gradedBadgeText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.primary,
  },
  gearButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm + 2,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  configureButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: 12,
  },
  configureButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: '#fff',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  groupCardInProgress: {
    borderColor: theme.colors.primary,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  groupName: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    color: theme.colors.text,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  statusBadgeText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  malusBadge: {
    backgroundColor: theme.colors.errorSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  malusText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.error,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 'auto',
  },
  scoreValue: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 20,
    color: theme.colors.text,
  },
  scoreMax: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.segmentTrack,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  membersLine: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
  },
});
