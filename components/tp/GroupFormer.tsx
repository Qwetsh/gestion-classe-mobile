/**
 * Former les groupes (maquette 2a). En début d'heure les élèves sont encore à leur place :
 * on les touche sur le plan habituel (ou en liste) pour les mettre ensemble.
 *
 * - Sans groupe choisi : toucher des élèves les sélectionne, puis « Créer G3 avec n élèves ».
 * - Groupe choisi (toucher sa pastille) : toucher un élève l'ajoute à ce groupe ou l'en retire.
 * - Un absent peut entrer dans un groupe (il verra documents et photos, sans note ni points).
 *
 * Rien n'est écrit en base ici : onDone reçoit la composition complète.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Shuffle } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { balancedGroups, nextGroupName, tpGroupColor } from '../../utils/tpGroups';
import type { DraftGroup } from '../../stores/groupSessionStore';

export interface FormerStudent {
  id: string;
  label: string;
  absent: boolean;
}

export interface FormerGroup {
  key: string;
  /** Groupe déjà en base (modification d'une composition existante) */
  id?: string;
  name: string;
  memberIds: string[];
  displayOrder: number;
  positionX?: number | null;
  positionY?: number | null;
}

export interface FormerPlan {
  rows: number;
  cols: number;
  isDisabled: (r: number, c: number) => boolean;
  studentAt: (r: number, c: number) => string | null;
}

interface Props {
  visible: boolean;
  stepLabel: string | null;
  students: FormerStudent[];
  plan: FormerPlan | null;
  initialGroups: FormerGroup[];
  doneLabel: string;
  loadLastGroups?: () => Promise<DraftGroup[] | null>;
  onBack: () => void;
  onDone: (groups: FormerGroup[]) => void;
}

let seq = 0;
const newKey = () => `g${Date.now()}-${++seq}`;
const SCREEN_W = Dimensions.get('window').width;

export function GroupFormer({ visible, stepLabel, students, plan, initialGroups, doneLabel, loadLastGroups, onBack, onDone }: Props) {
  const [groups, setGroups] = useState<FormerGroup[]>(initialGroups);
  const [selection, setSelection] = useState<string[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'plan' | 'list'>(plan ? 'plan' : 'list');
  const [size, setSize] = useState(4);

  useEffect(() => {
    if (!visible) return;
    setGroups(initialGroups);
    setSelection([]);
    setActiveKey(null);
    setMode(plan ? 'plan' : 'list');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const groupOf = useMemo(() => {
    const m = new Map<string, FormerGroup>();
    for (const g of groups) for (const id of g.memberIds) m.set(id, g);
    return m;
  }, [groups]);

  const unassignedPresent = students.filter((s) => !s.absent && !groupOf.has(s.id));
  const active = groups.find((g) => g.key === activeKey) ?? null;
  const nextOrder = groups.reduce((m, g) => Math.max(m, g.displayOrder + 1), 0);

  const tapStudent = (id: string) => {
    if (active) {
      setGroups((all) =>
        all.map((g) => {
          if (g.key === active.key) {
            return g.memberIds.includes(id)
              ? { ...g, memberIds: g.memberIds.filter((m) => m !== id) }
              : { ...g, memberIds: [...g.memberIds, id] };
          }
          return { ...g, memberIds: g.memberIds.filter((m) => m !== id) };
        })
      );
      return;
    }
    setSelection((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
  };

  const createFromSelection = () => {
    if (selection.length === 0) return;
    const name = nextGroupName(groups.map((g) => g.name));
    const picked = new Set(selection);
    setGroups((all) => [
      ...all.map((g) => ({ ...g, memberIds: g.memberIds.filter((m) => !picked.has(m)) })),
      { key: newKey(), name, memberIds: [...selection], displayOrder: nextOrder },
    ]);
    setSelection([]);
  };

  const makeRandom = (ids: string[], keepExisting: boolean) => {
    const parts = balancedGroups(ids, size);
    setGroups((all) => {
      const base = keepExisting ? all : [];
      const names = base.map((g) => g.name);
      let order = base.reduce((m, g) => Math.max(m, g.displayOrder + 1), 0);
      const added = parts.map((memberIds) => {
        const name = nextGroupName(names);
        names.push(name);
        return { key: newKey(), name, memberIds, displayOrder: order++ };
      });
      return [...base, ...added];
    });
    setSelection([]);
    setActiveKey(null);
  };

  const randomAll = () => {
    const present = students.filter((s) => !s.absent).map((s) => s.id);
    const go = () => makeRandom(present, false);
    if (groups.some((g) => g.memberIds.length > 0)) {
      Alert.alert('Refaire tous les groupes ?', 'Les groupes déjà formés seront remplacés.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Remplacer', style: 'destructive', onPress: go },
      ]);
    } else {
      go();
    }
  };

  const restRandom = () => makeRandom(unassignedPresent.map((s) => s.id), true);

  const takeLast = async () => {
    if (!loadLastGroups) return;
    const last = await loadLastGroups();
    if (!last || last.length === 0) {
      Alert.alert('Aucun TP précédent', "Cette classe n'a pas encore de groupes enregistrés.");
      return;
    }
    const known = new Set(students.map((s) => s.id));
    setGroups(
      last.map((g, i) => ({
        key: newKey(),
        name: g.name,
        memberIds: g.memberIds.filter((id) => known.has(id)),
        displayOrder: i,
        positionX: g.positionX ?? null,
        positionY: g.positionY ?? null,
      }))
    );
    setSelection([]);
    setActiveKey(null);
  };

  const deleteActive = () => {
    if (!active) return;
    setGroups((all) => all.filter((g) => g.key !== active.key));
    setActiveKey(null);
  };

  const finish = () => {
    const kept = groups.filter((g) => g.memberIds.length > 0 || g.id);
    if (kept.length === 0) {
      Alert.alert('Aucun groupe', 'Formez au moins un groupe.');
      return;
    }
    if (unassignedPresent.length > 0) {
      Alert.alert(
        `${unassignedPresent.length} élève${unassignedPresent.length > 1 ? 's' : ''} sans groupe`,
        unassignedPresent.map((s) => s.label).join(', '),
        [
          { text: 'Revenir', style: 'cancel' },
          { text: 'Continuer quand même', onPress: () => onDone(kept) },
        ]
      );
      return;
    }
    onDone(kept);
  };

  // ---------- rendu d'un élève (case du plan ou pastille de liste) ----------
  const cellStyleFor = (id: string) => {
    const g = groupOf.get(id);
    const s = byId.get(id);
    const selIndex = selection.indexOf(id);
    if (g) {
      const c = tpGroupColor(g.displayOrder);
      return {
        box: { backgroundColor: c.soft, borderColor: active && active.key === g.key ? theme.colors.primary : c.border, borderWidth: active && active.key === g.key ? 2.5 : 1.5, borderStyle: (s?.absent ? 'dashed' : 'solid') as 'dashed' | 'solid' },
        text: { color: c.text },
        sub: s?.absent ? `${g.name} · abs` : g.name,
        badge: null as string | null,
      };
    }
    if (selIndex >= 0) {
      return {
        box: { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary, borderWidth: 2.5, borderStyle: 'solid' as const },
        text: { color: theme.colors.primary },
        sub: null as string | null,
        badge: String(selIndex + 1),
      };
    }
    if (s?.absent) {
      return {
        box: { backgroundColor: theme.colors.absentBg, borderColor: '#F09595', borderWidth: 1, borderStyle: 'dashed' as const },
        text: { color: theme.colors.absentText },
        sub: 'absent' as string | null,
        badge: null as string | null,
      };
    }
    return {
      box: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderStyle: 'solid' as const },
      text: { color: theme.colors.text },
      sub: null as string | null,
      badge: null as string | null,
    };
  };

  const renderPlan = () => {
    if (!plan) return null;
    const gap = 5;
    const cell = Math.min((SCREEN_W - 24 - gap * (plan.cols - 1)) / plan.cols, 60);
    const rows = [];
    for (let r = 0; r < plan.rows; r++) {
      const cells = [];
      for (let c = 0; c < plan.cols; c++) {
        const id = plan.isDisabled(r, c) ? null : plan.studentAt(r, c);
        const s = id ? byId.get(id) : null;
        if (!id || !s) {
          cells.push(<View key={c} style={{ width: cell, height: cell }} />);
          continue;
        }
        const st = cellStyleFor(id);
        cells.push(
          <Pressable
            key={c}
            onPress={() => tapStudent(id)}
            style={[styles.cell, { width: cell, height: cell }, st.box]}
            accessibilityLabel={s.label}
          >
            <Text style={[styles.cellName, st.text]} numberOfLines={2}>{s.label}</Text>
            {st.sub && <Text style={[styles.cellSub, st.text]} numberOfLines={1}>{st.sub}</Text>}
            {st.badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{st.badge}</Text>
              </View>
            )}
          </Pressable>
        );
      }
      rows.push(
        <View key={r} style={[styles.planRow, { gap }]}>
          {cells}
        </View>
      );
    }
    // Élèves de la classe absents du plan : proposés en dessous
    const onPlan = new Set<string>();
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
      const id = plan.studentAt(r, c);
      if (id) onPlan.add(id);
    }
    const offPlan = students.filter((s) => !onPlan.has(s.id));
    return (
      <View style={{ gap }}>
        <Text style={styles.board}>TABLEAU</Text>
        {rows}
        {offPlan.length > 0 && (
          <View style={styles.offPlan}>
            <Text style={styles.offPlanLabel}>Hors du plan</Text>
            <View style={styles.chips}>{offPlan.map((s) => renderChip(s.id))}</View>
          </View>
        )}
      </View>
    );
  };

  const renderChip = (id: string) => {
    const s = byId.get(id);
    if (!s) return null;
    const st = cellStyleFor(id);
    return (
      <Pressable key={id} onPress={() => tapStudent(id)} style={[styles.chip, st.box]} accessibilityLabel={s.label}>
        <Text style={[styles.chipText, st.text]}>{s.label}</Text>
        {st.badge && <Text style={styles.chipBadge}>{st.badge}</Text>}
        {s.absent && !st.badge && <Text style={[styles.chipSub, st.text]}>abs</Text>}
      </Pressable>
    );
  };

  const renderList = () => {
    const unassigned = students.filter((s) => !groupOf.has(s.id));
    return (
      <View style={{ gap: 14 }}>
        <View>
          <Text style={styles.listHead}>Sans groupe ({unassigned.length})</Text>
          <View style={styles.chips}>{unassigned.map((s) => renderChip(s.id))}</View>
        </View>
        {groups.map((g) => {
          const c = tpGroupColor(g.displayOrder);
          return (
            <View key={g.key}>
              <Text style={[styles.listHead, { color: c.text }]}>{g.name} ({g.memberIds.length})</Text>
              <View style={styles.chips}>{g.memberIds.map((id) => renderChip(id))}</View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable style={styles.back} onPress={onBack} accessibilityLabel="Retour">
            <ChevronLeft size={22} color={theme.colors.text} />
          </Pressable>
          <View style={styles.flex}>
            {stepLabel && <Text style={styles.stepLabel}>{stepLabel}</Text>}
            <Text style={styles.title}>Former les groupes</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {plan && (
            <View style={styles.segment}>
              <Pressable style={[styles.segBtn, mode === 'plan' && styles.segOn]} onPress={() => setMode('plan')}>
                <Text style={[styles.segText, mode === 'plan' && styles.segTextOn]}>Sur le plan</Text>
              </Pressable>
              <Pressable style={[styles.segBtn, mode === 'list' && styles.segOn]} onPress={() => setMode('list')}>
                <Text style={[styles.segText, mode === 'list' && styles.segTextOn]}>En liste</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.quick}>
            <Pressable style={styles.qa} onPress={randomAll}>
              <Shuffle size={16} color={theme.colors.text} />
              <Text style={styles.qaText}>Hasard par {size}</Text>
            </Pressable>
            <Pressable style={styles.qaSmall} onPress={() => setSize((n) => Math.max(2, n - 1))} accessibilityLabel="Groupes plus petits">
              <Text style={styles.qaText}>−</Text>
            </Pressable>
            <Pressable style={styles.qaSmall} onPress={() => setSize((n) => Math.min(8, n + 1))} accessibilityLabel="Groupes plus grands">
              <Text style={styles.qaText}>+</Text>
            </Pressable>
            {loadLastGroups && (
              <Pressable style={styles.qa} onPress={takeLast}>
                <Text style={styles.qaText}>Reprendre le dernier TP</Text>
              </Pressable>
            )}
          </View>

          {groups.length > 0 && (
            <View style={styles.groupChips}>
              {groups.map((g) => {
                const c = tpGroupColor(g.displayOrder);
                const on = g.key === activeKey;
                return (
                  <Pressable
                    key={g.key}
                    onPress={() => {
                      setSelection([]);
                      setActiveKey(on ? null : g.key);
                    }}
                    style={[styles.gchip, { backgroundColor: c.soft, borderColor: on ? theme.colors.primary : c.border, borderWidth: on ? 2.5 : 1.5 }]}
                  >
                    <Text style={[styles.gchipText, { color: c.text }]}>{g.name} · {g.memberIds.length}</Text>
                  </Pressable>
                );
              })}
              {!activeKey && <Text style={styles.hint}>Toucher un groupe pour le modifier</Text>}
            </View>
          )}

          {mode === 'plan' && plan ? renderPlan() : renderList()}

          <Text style={styles.help}>
            {active
              ? `Toucher un élève pour l'ajouter à ${active.name} ou l'en retirer.`
              : 'Toucher les élèves à mettre ensemble. Un absent peut entrer dans un groupe : il verra les documents et les photos, sans note ni points.'}
          </Text>
        </ScrollView>

        <View style={styles.bottom}>
          {active ? (
            <View style={styles.rowGap}>
              <Pressable style={styles.secondary} onPress={deleteActive}>
                <Text style={styles.secondaryDanger}>Supprimer {active.name}</Text>
              </Pressable>
              <Pressable style={[styles.primary, styles.flex]} onPress={() => setActiveKey(null)}>
                <Text style={styles.primaryText}>Terminé</Text>
              </Pressable>
            </View>
          ) : selection.length > 0 ? (
            <>
              <View style={styles.selRow}>
                <Text style={styles.selText} numberOfLines={1}>
                  <Text style={styles.bold}>Sélection : </Text>
                  {selection.map((id) => byId.get(id)?.label).join(', ')}
                </Text>
                <Pressable onPress={() => setSelection([])} hitSlop={8}>
                  <Text style={styles.clear}>Effacer</Text>
                </Pressable>
              </View>
              <Pressable style={styles.primary} onPress={createFromSelection}>
                <Text style={styles.primaryText}>
                  Créer {nextGroupName(groups.map((g) => g.name))} avec {selection.length} élève{selection.length > 1 ? 's' : ''}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {unassignedPresent.length > 0 && (
                <View style={styles.selRow}>
                  <Text style={styles.selText}>
                    {unassignedPresent.length} élève{unassignedPresent.length > 1 ? 's' : ''} sans groupe
                  </Text>
                  <Pressable style={styles.secondarySmall} onPress={restRandom}>
                    <Text style={styles.secondaryText}>Le reste au hasard</Text>
                  </Pressable>
                </View>
              )}
              <Pressable style={[styles.primary, styles.primaryGreen]} onPress={finish}>
                <Text style={styles.primaryText}>
                  {doneLabel} ({groups.filter((g) => g.memberIds.length > 0).length} groupe{groups.filter((g) => g.memberIds.length > 0).length > 1 ? 's' : ''})
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  bold: { fontFamily: theme.fonts.bodyBold },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { ...theme.typography.labelSmall, color: theme.colors.primary },
  title: { ...theme.typography.h3, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  content: { padding: 12, gap: 12, paddingBottom: 24 },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.segmentTrack, borderRadius: 12, padding: 3 },
  segBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: theme.colors.surface },
  segText: { ...theme.typography.label, color: theme.colors.textSecondary },
  segTextOn: { color: theme.colors.text },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  qa: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface,
  },
  qaSmall: {
    width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  qaText: { ...theme.typography.label, color: theme.colors.text },
  groupChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  gchip: { height: 38, paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  gchipText: { ...theme.typography.label, fontFamily: theme.fonts.bodyBold },
  hint: { ...theme.typography.caption, color: theme.colors.textSecondary },
  board: {
    alignSelf: 'center', ...theme.typography.labelSmall, color: theme.colors.textTertiary, letterSpacing: 1,
    paddingHorizontal: 40, paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: theme.colors.borderStrong, marginBottom: 6,
  },
  planRow: { flexDirection: 'row', justifyContent: 'center' },
  cell: { borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  cellName: { fontSize: 11, fontFamily: theme.fonts.bodySemibold, textAlign: 'center' },
  cellSub: { fontSize: 9, fontFamily: theme.fonts.bodySemibold, marginTop: 1 },
  badge: {
    position: 'absolute', top: -7, right: -5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontFamily: theme.fonts.bodyBold, color: '#FFFFFF' },
  offPlan: { marginTop: 8, gap: 6 },
  offPlanLabel: { ...theme.typography.labelSmall, color: theme.colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 10, borderRadius: 10 },
  chipText: { ...theme.typography.label },
  chipSub: { fontSize: 10, fontFamily: theme.fonts.bodySemibold },
  chipBadge: { fontSize: 11, fontFamily: theme.fonts.bodyBold, color: theme.colors.primary },
  listHead: { ...theme.typography.labelSmall, color: theme.colors.textSecondary, marginBottom: 6 },
  help: { ...theme.typography.caption, color: theme.colors.textSecondary, lineHeight: 17 },
  bottom: {
    padding: 12, gap: 10, backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  rowGap: { flexDirection: 'row', gap: 8 },
  selRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selText: { flex: 1, ...theme.typography.bodySmall, color: theme.colors.text },
  clear: { ...theme.typography.label, color: theme.colors.textSecondary },
  primary: { height: 52, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryGreen: { backgroundColor: theme.colors.action },
  primaryText: { ...theme.typography.bodyMedium, fontFamily: theme.fonts.bodySemibold, color: '#FFFFFF' },
  secondary: {
    height: 52, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  secondarySmall: {
    height: 40, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { ...theme.typography.label, color: theme.colors.text },
  secondaryDanger: { ...theme.typography.label, color: theme.colors.absentText },
});
