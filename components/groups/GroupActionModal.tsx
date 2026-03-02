import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { theme } from '../../constants/theme';
import { getGroupColor } from '../../constants/groups';

export type GroupAction = 'remark' | 'grade' | 'edit' | 'delete';

interface GroupActionModalProps {
  visible: boolean;
  groupNumber: number;
  memberNames: string[];
  onClose: () => void;
  onAction: (action: GroupAction) => void;
}

/**
 * Modal presenting available actions for a group
 */
export function GroupActionModal({
  visible,
  groupNumber,
  memberNames,
  onClose,
  onAction,
}: GroupActionModalProps) {
  const groupColor = getGroupColor(groupNumber);

  const handleAction = (action: GroupAction) => {
    onAction(action);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.content}>
          <View style={[styles.header, { backgroundColor: groupColor + '20' }]}>
            <View style={[styles.groupBadge, { backgroundColor: groupColor }]}>
              <Text style={styles.groupBadgeText}>{groupNumber}</Text>
            </View>
            <Text style={styles.title}>Groupe {groupNumber}</Text>
          </View>

          <Text style={styles.membersText} numberOfLines={2}>
            {memberNames.join(', ')}
          </Text>

          <View style={styles.actions}>
            <Pressable
              style={styles.actionButton}
              onPress={() => handleAction('remark')}
            >
              <Text style={styles.actionIcon}>📝</Text>
              <Text style={styles.actionText}>Remarque groupe</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => handleAction('grade')}
            >
              <Text style={styles.actionIcon}>🎯</Text>
              <Text style={styles.actionText}>Note groupe</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => handleAction('edit')}
            >
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionText}>Modifier membres</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.actionButtonDanger]}
              onPress={() => handleAction('delete')}
            >
              <Text style={styles.actionIcon}>🗑️</Text>
              <Text style={[styles.actionText, styles.actionTextDanger]}>
                Supprimer ce groupe
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Annuler</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  groupBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupBadgeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  membersText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  actions: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  actionButtonDanger: {
    borderColor: theme.colors.error + '30',
    backgroundColor: theme.colors.error + '10',
  },
  actionIcon: {
    fontSize: 20,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  actionTextDanger: {
    color: theme.colors.error,
  },
  cancelButton: {
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
});
