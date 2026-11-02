import React, { useMemo, useRef } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Eraser, Pencil } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { StudentTag } from '../../stores/studentTagStore';

/** Étiquette en cours de glisser : une vraie étiquette, ou la gomme. */
export type DraggedTag = StudentTag | { id: '__eraser__'; label: string; color: string };

export const ERASER_TAG: DraggedTag = { id: '__eraser__', label: 'Effacer', color: '#6B7280' };

interface TagBarProps {
  tags: StudentTag[];
  onDragStart: (tag: DraggedTag, pageX: number, pageY: number) => void;
  onDragMove: (pageX: number, pageY: number) => void;
  onDragEnd: (pageX: number, pageY: number) => void;
  onDragCancel: () => void;
  onEdit: () => void;
  onTapHint: () => void;
}

/**
 * Rangée d'étiquettes à glisser sur un élève du plan.
 * Glisser vers le bas démarre le drag ; un balayage horizontal fait défiler la rangée.
 */
export function TagBar({ tags, onDragStart, onDragMove, onDragEnd, onDragCancel, onEdit, onTapHint }: TagBarProps) {
  return (
    <View style={styles.row}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {tags.map((t) => (
          <DraggableChip
            key={t.id}
            tag={t}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={onDragCancel}
            onTapHint={onTapHint}
          />
        ))}
        <DraggableChip
          tag={ERASER_TAG}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
          onTapHint={onTapHint}
        />
      </ScrollView>
      <Pressable
        style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        onPress={onEdit}
        hitSlop={4}
      >
        <Pencil size={15} color={theme.colors.textSecondary} strokeWidth={1.8} />
      </Pressable>
    </View>
  );
}

interface ChipProps {
  tag: DraggedTag;
  onDragStart: TagBarProps['onDragStart'];
  onDragMove: TagBarProps['onDragMove'];
  onDragEnd: TagBarProps['onDragEnd'];
  onDragCancel: TagBarProps['onDragCancel'];
  onTapHint: TagBarProps['onTapHint'];
}

function DraggableChip({ tag, onDragStart, onDragMove, onDragEnd, onDragCancel, onTapHint }: ChipProps) {
  // Les callbacks changent à chaque rendu du parent : on lit toujours la dernière version.
  const cb = useRef({ onDragStart, onDragMove, onDragEnd, onDragCancel, onTapHint, tag });
  cb.current = { onDragStart, onDragMove, onDragEnd, onDragCancel, onTapHint, tag };

  const responder = useMemo(() => {
    const wantsDrag = (dx: number, dy: number) => Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx);
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => wantsDrag(g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (_, g) => wantsDrag(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        cb.current.onDragStart(cb.current.tag, e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => cb.current.onDragMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: (e) => cb.current.onDragEnd(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderTerminate: () => cb.current.onDragCancel(),
    });
  }, []);

  const isEraser = tag.id === ERASER_TAG.id;
  return (
    <View {...responder.panHandlers}>
      <Pressable onPress={() => cb.current.onTapHint()}>
        <View style={[styles.chip, isEraser ? styles.chipEraser : { backgroundColor: tag.color + '1F', borderColor: tag.color }]}>
          {isEraser ? (
            <Eraser size={13} color={theme.colors.textSecondary} strokeWidth={2} />
          ) : (
            <View style={[styles.dot, { backgroundColor: tag.color }]} />
          )}
          <Text style={[styles.chipText, !isEraser && { color: theme.colors.text }]} numberOfLines={1}>
            {tag.label}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Rendu flottant sous le doigt pendant le glisser. */
export function TagGhost({ tag }: { tag: DraggedTag }) {
  const isEraser = tag.id === ERASER_TAG.id;
  return (
    <View style={[styles.chip, styles.ghost, isEraser ? styles.chipEraser : { backgroundColor: tag.color, borderColor: tag.color }]}>
      {isEraser && <Eraser size={13} color={theme.colors.textSecondary} strokeWidth={2} />}
      <Text style={[styles.chipText, !isEraser && { color: '#FFFFFF' }]} numberOfLines={1}>
        {tag.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  scroll: { gap: 6, paddingRight: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  chipEraser: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderStyle: 'dashed' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  chipText: { fontFamily: theme.fonts.bodyMedium, fontSize: 12.5, color: theme.colors.textSecondary, maxWidth: 140 },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: 4,
  },
  pressed: { opacity: 0.7 },
  ghost: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    transform: [{ scale: 1.08 }],
  },
});
