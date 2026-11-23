/**
 * Fond libre du mode groupe (maquettes 2b et 3a) : un îlot par groupe, sans les tables du plan.
 *
 * - Mode « déplacer » (editing) : on glisse les îlots là où les groupes se sont installés ;
 *   la position est rendue en 0..1 (coin haut gauche, relatif à la place disponible).
 * - Mode normal : les gestes sur un élève remontent tels quels (appui long = menu radial
 *   habituel, géré par l'écran de séance) ; l'en-tête d'un îlot remonte tap et appui long.
 */
import React, { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { autoLayout, tpGroupColor } from '../../utils/tpGroups';

export interface IslandGroup {
  id: string;
  name: string;
  displayOrder: number;
  positionX: number | null;
  positionY: number | null;
  memberIds: string[];
  /** Pastilles affichées dans l'en-tête (ex. « +3 », « 7 / 10 », « 2 photos », « À noter ») */
  pills: string[];
}

export interface IslandStudentState {
  absent: boolean;
  out: boolean;
  plus: number;
  minus: number;
}

interface Props {
  groups: IslandGroup[];
  labelOf: (studentId: string) => string;
  stateOf: (studentId: string) => IslandStudentState;
  editing: boolean;
  selectedStudentId?: string | null;
  onMoveGroup?: (groupId: string, x: number, y: number) => void;
  onStudentTouchStart?: (studentId: string, pageX: number, pageY: number) => void;
  onHeaderTouchStart?: (groupId: string, pageX: number, pageY: number) => void;
  onTouchMove?: (pageX: number, pageY: number) => void;
  onTouchEnd?: () => void;
  onTouchCancel?: () => void;
  footerLeft?: string;
}

const GAP = 10;
const EST_ISLAND_H = 128;

export function GroupIslandsCanvas({
  groups,
  labelOf,
  stateOf,
  editing,
  selectedStudentId,
  onMoveGroup,
  onStudentTouchStart,
  onHeaderTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
}: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);

  const islandW = size.w > 0 ? (size.w - GAP) / 2 : 160;
  const maxH = Math.max(EST_ISLAND_H, ...Object.values(heights));
  const usableW = Math.max(1, size.w - islandW);
  const usableH = Math.max(1, size.h - 26 - maxH);

  // Les îlots sans position prennent le rangement automatique, dans leur ordre
  const fallback = useMemo(() => autoLayout(groups.length), [groups.length]);
  const posOf = (g: IslandGroup, index: number) => {
    const p = g.positionX != null && g.positionY != null ? { x: g.positionX, y: g.positionY } : fallback[index] ?? { x: 0, y: 0 };
    return { left: p.x * usableW, top: 26 + p.y * usableH };
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  return (
    <View style={styles.canvas} onLayout={onLayout}>
      <Text style={styles.board}>TABLEAU</Text>
      {groups.map((g, index) => {
        const c = tpGroupColor(g.displayOrder);
        const base = posOf(g, index);
        const dragging = drag?.id === g.id;
        const left = Math.min(Math.max(0, base.left + (dragging ? drag!.dx : 0)), usableW);
        const top = Math.min(Math.max(26, base.top + (dragging ? drag!.dy : 0)), 26 + usableH);
        return (
          <Island
            key={g.id}
            group={g}
            color={c}
            left={left}
            top={top}
            width={islandW}
            editing={editing}
            dragging={dragging}
            labelOf={labelOf}
            stateOf={stateOf}
            selectedStudentId={selectedStudentId ?? null}
            onHeight={(h) => setHeights((all) => (all[g.id] === h ? all : { ...all, [g.id]: h }))}
            onDrag={(dx, dy) => setDrag({ id: g.id, dx, dy })}
            onDrop={(dx, dy) => {
              setDrag(null);
              const nl = Math.min(Math.max(0, base.left + dx), usableW);
              const nt = Math.min(Math.max(26, base.top + dy), 26 + usableH);
              onMoveGroup?.(g.id, nl / usableW, (nt - 26) / usableH);
            }}
            onStudentTouchStart={onStudentTouchStart}
            onHeaderTouchStart={onHeaderTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          />
        );
      })}
    </View>
  );
}

interface IslandProps {
  group: IslandGroup;
  color: ReturnType<typeof tpGroupColor>;
  left: number;
  top: number;
  width: number;
  editing: boolean;
  dragging: boolean;
  labelOf: (id: string) => string;
  stateOf: (id: string) => IslandStudentState;
  selectedStudentId: string | null;
  onHeight: (h: number) => void;
  onDrag: (dx: number, dy: number) => void;
  onDrop: (dx: number, dy: number) => void;
  onStudentTouchStart?: Props['onStudentTouchStart'];
  onHeaderTouchStart?: Props['onHeaderTouchStart'];
  onTouchMove?: Props['onTouchMove'];
  onTouchEnd?: Props['onTouchEnd'];
  onTouchCancel?: Props['onTouchCancel'];
}

function Island({
  group, color, left, top, width, editing, dragging, labelOf, stateOf, selectedStudentId,
  onHeight, onDrag, onDrop, onStudentTouchStart, onHeaderTouchStart, onTouchMove, onTouchEnd, onTouchCancel,
}: IslandProps) {
  // Les rappels changent à chaque rendu : la PanResponder lit toujours la dernière version
  const latest = useRef({ editing, onDrag, onDrop });
  latest.current = { editing, onDrag, onDrop };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.editing,
        onMoveShouldSetPanResponder: () => latest.current.editing,
        onPanResponderMove: (_e, gs) => latest.current.onDrag(gs.dx, gs.dy),
        onPanResponderRelease: (_e, gs) => latest.current.onDrop(gs.dx, gs.dy),
        onPanResponderTerminate: (_e, gs) => latest.current.onDrop(gs.dx, gs.dy),
      }),
    []
  );

  const touchProps = (start: (pageX: number, pageY: number) => void) =>
    editing
      ? {}
      : {
          onTouchStart: (e: { nativeEvent: { pageX: number; pageY: number } }) => start(e.nativeEvent.pageX, e.nativeEvent.pageY),
          onTouchMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => onTouchMove?.(e.nativeEvent.pageX, e.nativeEvent.pageY),
          onTouchEnd: () => onTouchEnd?.(),
          onTouchCancel: () => onTouchCancel?.(),
        };

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}
      style={[
        styles.island,
        { left, top, width, backgroundColor: color.soft, borderColor: dragging ? theme.colors.primary : color.border },
        dragging && styles.islandDragging,
        editing && !dragging && styles.islandEditable,
      ]}
    >
      <View
        style={styles.head}
        {...touchProps((x, y) => onHeaderTouchStart?.(group.id, x, y))}
        accessibilityRole="button"
        accessibilityLabel={`Groupe ${group.name}`}
      >
        <Text style={[styles.headName, { color: color.text }]}>{group.name}</Text>
        <View style={styles.pills}>
          {editing ? (
            <Text style={[styles.grip, { color: color.text }]}>⠿</Text>
          ) : (
            group.pills.map((p) => (
              <View key={p} style={styles.pill}>
                <Text style={[styles.pillText, { color: color.text }]}>{p}</Text>
              </View>
            ))
          )}
        </View>
      </View>
      <View style={styles.chips}>
        {group.memberIds.length === 0 && <Text style={[styles.empty, { color: color.text }]}>Aucun élève</Text>}
        {group.memberIds.map((id) => {
          const st = stateOf(id);
          return (
            <View
              key={id}
              style={[
                styles.chip,
                st.absent && styles.chipAbsent,
                st.out && styles.chipOut,
                selectedStudentId === id && styles.chipSelected,
              ]}
              {...touchProps((x, y) => onStudentTouchStart?.(id, x, y))}
            >
              <Text
                style={[styles.chipText, st.absent && styles.chipTextAbsent, st.out && styles.chipTextOut]}
                numberOfLines={1}
              >
                {labelOf(id)}
              </Text>
              {!st.absent && st.plus > 0 && <Text style={styles.plus}>+{st.plus}</Text>}
              {!st.absent && st.minus > 0 && <Text style={styles.minus}>−{st.minus}</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, position: 'relative' },
  board: {
    position: 'absolute', top: 0, alignSelf: 'center', ...theme.typography.labelSmall, color: theme.colors.textTertiary,
    letterSpacing: 1, paddingHorizontal: 40, paddingBottom: 2, borderBottomWidth: 2, borderBottomColor: theme.colors.borderStrong,
  },
  island: { position: 'absolute', borderWidth: 1.5, borderRadius: 14, padding: 6, paddingBottom: 8 },
  islandDragging: {
    borderWidth: 2, zIndex: 10, elevation: 6, shadowColor: '#141928', shadowOpacity: 0.18, shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  islandEditable: { borderStyle: 'dashed' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, paddingHorizontal: 4, marginBottom: 4, gap: 6 },
  headName: { fontSize: 14, fontFamily: theme.fonts.bodyBold },
  pills: { flexDirection: 'row', gap: 4, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pill: { height: 20, paddingHorizontal: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.75)', justifyContent: 'center' },
  pillText: { fontSize: 10, fontFamily: theme.fonts.bodyBold },
  grip: { fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  empty: { fontSize: 12, fontFamily: theme.fonts.body, opacity: 0.8, paddingHorizontal: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: 32, paddingHorizontal: 7, borderRadius: 8,
    backgroundColor: theme.colors.surface, maxWidth: '100%',
  },
  chipAbsent: { backgroundColor: theme.colors.absentBg },
  chipOut: { backgroundColor: theme.colors.sortieBg },
  chipSelected: { borderWidth: 2, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text, flexShrink: 1 },
  chipTextAbsent: { color: theme.colors.absentText, textDecorationLine: 'line-through' },
  chipTextOut: { color: theme.colors.sortieText },
  plus: { fontSize: 10, fontFamily: theme.fonts.bodyBold, color: theme.colors.success },
  minus: { fontSize: 10, fontFamily: theme.fonts.bodyBold, color: theme.colors.bavardageText },
});
