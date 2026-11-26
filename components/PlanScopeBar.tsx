import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { theme } from '../constants/theme';
import { classGroupColor } from '../constants/classGroupColors';
import type { ClassGroup } from '../types';

interface PlanScopeBarProps {
  groups: ClassGroup[];
  /** Effectif de chaque groupe (identifiant → nombre d'élèves). */
  sizes: Record<string, number>;
  classSize: number;
  /** Groupe dont on édite le plan ; null = classe entière. */
  value: string | null;
  onChange: (groupId: string | null) => void;
  /** Le groupe choisi n'a encore aucun élève placé dans cette salle. */
  groupPlanIsEmpty: boolean;
  onCopyFromClass: () => void;
}

/**
 * Choix du plan édité : celui de la classe entière, ou celui d'un groupe de classe. Sans plan
 * propre, une séance en demi-groupe montre le plan de la classe entière, où les places de l'autre
 * groupe restent vides. Jumeau web : components/class-groups/PlanScopeBar.tsx.
 */
export function PlanScopeBar({ groups, sizes, classSize, value, onChange, groupPlanIsEmpty, onCopyFromClass }: PlanScopeBarProps) {
  const chips = [
    { id: null as string | null, name: 'Classe entière', size: classSize, color: theme.colors.primary },
    ...groups.map((g, i) => ({ id: g.id as string | null, name: g.name, size: sizes[g.id] ?? 0, color: classGroupColor(g.color, i).main })),
  ];
  return (
    <View style={styles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {chips.map((chip) => {
          const selected = chip.id === value;
          return (
            <Pressable
              key={chip.id ?? 'classe'}
              onPress={() => onChange(chip.id)}
              style={[styles.chip, { borderColor: selected ? chip.color : theme.colors.border }, selected && { backgroundColor: chip.color }]}
            >
              {chip.id !== null && (
                <View style={[styles.dot, { backgroundColor: selected ? theme.colors.textInverse : chip.color }]} />
              )}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip.name}</Text>
              <Text style={[styles.chipCount, selected && styles.chipTextSelected]}>{chip.size}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {value !== null && groupPlanIsEmpty && (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>
            Pas encore de plan pour ce groupe : en séance, celui de la classe entière s’affiche.
          </Text>
          <Pressable onPress={onCopyFromClass} style={({ pressed }) => [styles.copyButton, pressed && styles.copyButtonPressed]}>
            <Text style={styles.copyButtonText}>Partir du plan de la classe entière</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  row: {
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
    minHeight: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.text,
  },
  chipCount: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  chipTextSelected: {
    color: theme.colors.textInverse,
  },
  emptyRow: {
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  copyButton: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
  },
  copyButtonPressed: {
    opacity: 0.7,
  },
  copyButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.primary,
  },
});
