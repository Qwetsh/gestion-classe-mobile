import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import type { StudentWithMapping } from '../../stores';

interface StudentPickerSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  students: StudentWithMapping[];
  /** Badge optionnel affiche a droite de chaque ligne (ex : "3 evts"). */
  badgeForStudent?: (student: StudentWithMapping) => string | null;
  onSelect: (student: StudentWithMapping) => void;
  onClose: () => void;
}

/** Sheet generique de selection d'eleve (Remarque, Supprimer, Oral > Choisir). */
export function StudentPickerSheet({
  visible,
  title,
  subtitle,
  students,
  badgeForStudent,
  onSelect,
  onClose,
}: StudentPickerSheetProps) {
  const sorted = [...students].sort((a, b) =>
    (a.fullName || a.pseudo).localeCompare(b.fullName || b.pseudo)
  );

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {sorted.map((student, index) => {
          const badge = badgeForStudent?.(student);
          return (
            <Pressable
              key={student.id}
              style={({ pressed }) => [
                styles.row,
                index < sorted.length - 1 && styles.rowBorder,
                pressed && styles.rowPressed,
              ]}
              onPress={() => onSelect(student)}
            >
              <Text style={styles.rowName} numberOfLines={1}>
                {student.fullName || student.pseudo}
              </Text>
              {badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        style={({ pressed }) => [styles.cancelButton, pressed && styles.rowPressed]}
        onPress={onClose}
      >
        <Text style={styles.cancelButtonText}>Annuler</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: 2,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  list: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    maxHeight: 340,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: theme.spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  rowPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  rowName: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 15,
    color: theme.colors.text,
  },
  badge: {
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    marginLeft: theme.spacing.sm,
  },
  badgeText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  cancelButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
});
