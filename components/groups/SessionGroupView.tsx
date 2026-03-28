import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
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
  onGroupPress?: (group: SessionGroupWithDetails) => void;
  onConfigureGroups?: () => void;
}

function getDisplayName(student: StudentWithMapping): string {
  return student.fullName || student.pseudo;
}

function SessionGroupViewInner({
  groups,
  maxPossibleScore,
  students,
  isLoading,
  isEmpty,
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
        <Text style={styles.emptyIcon}>👥</Text>
        <Text style={styles.emptyTitle}>Aucun groupe configuré</Text>
        <Text style={styles.emptySubtitle}>
          Créez des groupes et définissez les critères de notation pour cette séance
        </Text>
        {onConfigureGroups && (
          <Pressable style={styles.configureButton} onPress={onConfigureGroups}>
            <Text style={styles.configureButtonText}>Configurer les groupes</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {groups.map((group) => {
        const memberNames = group.memberIds
          .map((id) => students.find((s) => s.id === id))
          .filter(Boolean)
          .map((s) => getDisplayName(s!).split(' ')[0]);

        return (
          <Pressable
            key={group.id}
            style={({ pressed }) => [
              styles.groupCard,
              onGroupPress && pressed && styles.groupCardPressed,
            ]}
            onPress={() => onGroupPress?.(group)}
            disabled={!onGroupPress}
          >
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.name}</Text>
              <View style={styles.scoreContainer}>
                <Text style={styles.scoreValue}>{group.totalScore}</Text>
                <Text style={styles.scoreMax}>/{maxPossibleScore}</Text>
              </View>
            </View>

            {group.conductMalus > 0 && (
              <View style={styles.malusBadge}>
                <Text style={styles.malusText}>-{group.conductMalus} malus</Text>
              </View>
            )}

            <View style={styles.membersRow}>
              {memberNames.map((name, idx) => (
                <View key={idx} style={styles.memberChip}>
                  <Text style={styles.memberName}>{name}</Text>
                </View>
              ))}
              {memberNames.length === 0 && (
                <Text style={styles.noMembers}>Aucun membre</Text>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export const SessionGroupView = React.memo(SessionGroupViewInner);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  emptySubtitle: {
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
    borderRadius: theme.radius.lg,
  },
  configureButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  groupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  groupCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  scoreMax: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  malusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.errorSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginBottom: theme.spacing.sm,
  },
  malusText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.error,
  },
  membersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  memberChip: {
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
  },
  memberName: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.primary,
  },
  noMembers: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
  },
});
