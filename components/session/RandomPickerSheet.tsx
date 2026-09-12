import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shuffle, Monitor } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import type { StudentWithMapping } from '../../stores';
import { triggerLightFeedback } from '../../utils/haptics';

interface RandomPickerSheetProps {
  visible: boolean;
  students: StudentWithMapping[];
  onClose: () => void;
  /** Mode « en classe » : afficher l'élève tiré sur l'écran projeté. */
  onShowOnScreen?: (student: StudentWithMapping) => void;
}

/** Sheet "Tirage au sort" (maquette 9a). */
export function RandomPickerSheet({ visible, students, onClose, onShowOnScreen }: RandomPickerSheetProps) {
  const [picked, setPicked] = useState<StudentWithMapping | null>(null);

  const draw = useCallback(() => {
    if (students.length === 0) return;
    const index = Math.floor(Math.random() * students.length);
    setPicked(students[index]);
    triggerLightFeedback();
  }, [students]);

  useEffect(() => {
    if (visible) draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Tirage au sort</Text>
        <Text style={styles.subtitle}>
          {students.length} présent{students.length > 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.pickedCard}>
        <Text style={styles.pickedLabel}>ÉLÈVE TIRÉ</Text>
        <Text style={styles.pickedName} numberOfLines={1}>
          {picked ? picked.fullName || picked.pseudo : '—'}
        </Text>
        <Text style={styles.pickedContext}>
          Parmi les élèves présents de la classe
        </Text>
      </View>

      {onShowOnScreen && (
        <Pressable
          style={({ pressed }) => [styles.screenButton, pressed && styles.buttonPressed]}
          onPress={() => picked && onShowOnScreen(picked)}
          disabled={!picked}
        >
          <Monitor size={16} color={theme.colors.primary} strokeWidth={1.8} />
          <Text style={styles.screenButtonText}>Afficher à l'écran</Text>
        </Pressable>
      )}

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          onPress={draw}
        >
          <Shuffle size={16} color={theme.colors.text} strokeWidth={1.8} />
          <Text style={styles.secondaryButtonText}>Relancer</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          onPress={onClose}
        >
          <Text style={styles.primaryButtonText}>C'est lui !</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
  },
  subtitle: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  pickedCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 16,
    padding: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  pickedLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.xs,
  },
  pickedName: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 28,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  pickedContext: {
    fontFamily: theme.fonts.body,
    fontSize: 13.5,
    color: theme.colors.textSecondary,
  },
  screenButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: theme.spacing.sm + 2,
  },
  screenButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14.5,
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm + 2,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  primaryButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.textInverse,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
