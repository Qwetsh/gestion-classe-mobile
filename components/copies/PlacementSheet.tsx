import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, useWindowDimensions } from 'react-native';
import { BottomSheet } from '../session/BottomSheet';
import { theme } from '../../constants/theme';
import {
  buildPlacementFromLocalPlan,
  fetchPlacement,
  type EvalPlacement,
} from '../../services/copies/placement';
import { placeStudent, unseatStudent, type OutboxOp, type Positions } from '../../services/copies/outboxLogic';
import type { ScanContext } from '../../services/copies/localCache';
import type { Student } from '../../types';

interface PlacementSheetProps {
  visible: boolean;
  assessmentId: string;
  classId: string;
  context: ScanContext;
  students: Student[];
  /** File d'envoi : une correction pas encore partie l'emporte sur la photo du serveur. */
  ops: OutboxOp[];
  onClose: () => void;
  onSave: (placement: EvalPlacement) => void;
}

const SOURCE_LABEL: Record<EvalPlacement['source'], string> = {
  auto: 'Photo du plan prise au premier scan',
  manual: 'Placement spécial déjà corrigé',
  local: 'Plan habituel de la classe (pas encore de photo)',
};

/**
 * « Placement spécial pour l'éval » : on corrige la photo du placement de ce jour-là (élèves
 * déplacés pour l'éval, absents) sans toucher au plan habituel de la classe. Sert seulement à
 * l'alerte « voisins » du Correcteur ; rien n'est visible des élèves.
 * Toucher un élève puis une case : il y va (échange si elle est prise).
 */
export function PlacementSheet({
  visible,
  assessmentId,
  classId,
  context,
  students,
  ops,
  onClose,
  onSave,
}: PlacementSheetProps) {
  const { width } = useWindowDimensions();
  const [placement, setPlacement] = useState<EvalPlacement | null>(null);
  const [positions, setPositions] = useState<Positions>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (fromClassPlan = false) => {
    setLoading(true);
    setSelected(null);
    try {
      const local = context.roomId
        ? await buildPlacementFromLocalPlan(classId, context.roomId, context.groupId)
        : null;
      let base: EvalPlacement | null = fromClassPlan ? local : null;
      if (!base) {
        const pending = [...ops]
          .reverse()
          .find((op) => op.kind === 'save_placement' && op.assessmentId === assessmentId);
        const server = await fetchPlacement(assessmentId);
        base = server ?? local;
        if (base && pending && pending.kind === 'save_placement') {
          base = { ...base, positions: pending.positions, source: pending.mode };
        }
        // Photo sans taille de grille (salle supprimée) : on reprend celle du téléphone.
        if (base && local && (!base.gridRows || !base.gridCols)) {
          base = { ...base, gridRows: local.gridRows, gridCols: local.gridCols };
        }
      }
      setPlacement(base);
      setPositions(base?.positions ?? {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, assessmentId]);

  const pseudoById = useMemo(() => new Map(students.map((s) => [s.id, s.pseudo])), [students]);
  const seated = new Set(Object.values(positions));
  const unseated = students.filter((s) => !seated.has(s.id));
  const disabled = new Set(placement?.disabledCells ?? []);
  const rows = placement?.gridRows ?? 0;
  const cols = placement?.gridCols ?? 0;
  const cell = cols > 0 ? Math.min(54, Math.floor((width - 48 - (cols - 1) * 3) / cols)) : 0;
  const changed = JSON.stringify(positions) !== JSON.stringify(placement?.positions ?? {});

  const tapCell = (key: string) => {
    const occupant = positions[key];
    if (selected) {
      setPositions(placeStudent(positions, selected, key));
      setSelected(null);
    } else if (occupant) {
      setSelected(occupant);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Placement pour l’éval</Text>
      <Text style={styles.subtitle}>
        {placement ? `${placement.roomName ?? 'Salle'} · ${SOURCE_LABEL[placement.source]}` : ' '}
      </Text>
      <Text style={styles.hint}>
        Ne change pas le plan habituel de la classe. Touche un élève, puis sa place du jour.
      </Text>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: theme.spacing.xl }} color={theme.colors.primary} />
      ) : !placement || rows === 0 ? (
        <Text style={styles.empty}>
          Salle de la séance inconnue sur ce téléphone : synchronise, ou ouvre les copies depuis la séance.
        </Text>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gridScroll}>
            <View>
              {Array.from({ length: rows }, (_, r) => (
                <View key={r} style={styles.gridRow}>
                  {Array.from({ length: cols }, (_, c) => {
                    const key = `${r}-${c}`;
                    const isDisabled = disabled.has(`${r},${c}`);
                    const sid = positions[key];
                    const isSel = !!sid && sid === selected;
                    return (
                      <Pressable
                        key={key}
                        disabled={isDisabled}
                        onPress={() => tapCell(key)}
                        style={[
                          styles.cell,
                          { width: cell, height: cell },
                          isDisabled && styles.cellDisabled,
                          !!sid && styles.cellTaken,
                          isSel && styles.cellSelected,
                          !sid && !!selected && !isDisabled && styles.cellTarget,
                        ]}
                      >
                        {sid ? (
                          <Text style={[styles.cellText, isSel && styles.cellTextSelected]} numberOfLines={2}>
                            {pseudoById.get(sid) ?? '?'}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
          <Text style={styles.board}>Tableau</Text>

          {unseated.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Sans place ({unseated.length})</Text>
              <View style={styles.chips}>
                {unseated.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelected(selected === s.id ? null : s.id)}
                    style={[styles.chip, selected === s.id && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, selected === s.id && styles.chipTextSelected]}>{s.pseudo}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {selected && seated.has(selected) && (
            <Pressable
              onPress={() => {
                setPositions(unseatStudent(positions, selected));
                setSelected(null);
              }}
              style={styles.linkButton}
            >
              <Text style={styles.linkText}>Retirer {pseudoById.get(selected)} du placement</Text>
            </Pressable>
          )}
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.primary, (!placement || !changed) && styles.disabled, pressed && styles.pressed]}
        disabled={!placement || !changed}
        onPress={() => placement && onSave({ ...placement, positions, source: 'manual' })}
      >
        <Text style={styles.primaryText}>Enregistrer le placement de l’éval</Text>
      </Pressable>
      {context.roomId && (
        <Pressable style={styles.linkButton} onPress={() => void load(true)}>
          <Text style={styles.linkText}>Repartir du plan habituel</Text>
        </Pressable>
      )}
      <Pressable style={styles.cancel} onPress={onClose}>
        <Text style={styles.cancelText}>Fermer</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  hint: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textTertiary, marginTop: 4, marginBottom: theme.spacing.md },
  empty: { fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.textSecondary, marginVertical: theme.spacing.lg },
  gridScroll: { flexGrow: 0 },
  gridRow: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  cell: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  cellDisabled: { backgroundColor: theme.colors.surfaceDisabled, borderColor: theme.colors.surfaceDisabled },
  cellTaken: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primaryLight },
  cellSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  cellTarget: { borderStyle: 'dashed', borderColor: theme.colors.primary },
  cellText: { fontFamily: theme.fonts.bodySemibold, fontSize: 9.5, color: theme.colors.text, textAlign: 'center' },
  cellTextSelected: { color: theme.colors.textInverse },
  board: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  sectionLabel: { fontFamily: theme.fonts.bodySemibold, fontSize: 12, color: theme.colors.textSecondary, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.text },
  chipTextSelected: { color: theme.colors.textInverse },
  linkButton: { alignItems: 'center', paddingVertical: 10 },
  linkText: { fontFamily: theme.fonts.bodySemibold, fontSize: 13.5, color: theme.colors.primary },
  primary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9 },
  cancel: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  cancelText: { fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.textSecondary },
});
