/**
 * Bandeau « Note pour ce cours » : rappelle, au moment du cours, la note écrite depuis
 * l'accueil web. Se charge tout seul (classe + instant), disparaît s'il n'y a rien.
 * « Vu » marque la note comme traitée (elle n'est plus mise en avant nulle part).
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { StickyNote, Check } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { fetchLessonNoteFor, markLessonNoteDone } from '../services/lessonNotes';
import type { LessonNote } from '../utils/lessonNotes';

interface Props {
  classId: string | null | undefined;
  /** Instant de référence : début de la séance, ou maintenant */
  at: Date | string;
  groupId?: string | null;
  /** Variante réduite (écran de démarrage) : pas de bouton « Vu » */
  compact?: boolean;
  style?: object;
}

export function LessonNoteBanner({ classId, at, groupId, compact = false, style }: Props) {
  const [note, setNote] = useState<LessonNote | null>(null);
  const [hidden, setHidden] = useState(false);
  const atMs = typeof at === 'string' ? new Date(at).getTime() : at.getTime();

  useEffect(() => {
    let cancelled = false;
    setNote(null);
    setHidden(false);
    if (!classId || Number.isNaN(atMs)) return;
    fetchLessonNoteFor(classId, new Date(atMs), groupId).then((n) => {
      if (!cancelled) setNote(n);
    });
    return () => {
      cancelled = true;
    };
  }, [classId, atMs, groupId]);

  if (!note || hidden) return null;

  const handleDone = async () => {
    setHidden(true);
    const ok = await markLessonNoteDone(note.id);
    if (!ok) setHidden(false);
  };

  return (
    <View style={[styles.banner, compact && styles.bannerCompact, style]}>
      <StickyNote size={compact ? 16 : 18} color={theme.colors.warning} strokeWidth={2} />
      <View style={styles.body}>
        {!compact && <Text style={styles.label}>Note pour ce cours</Text>}
        <Text style={styles.content} numberOfLines={compact ? 2 : 6}>
          {note.content}
        </Text>
      </View>
      {!compact && (
        <Pressable
          onPress={handleDone}
          hitSlop={8}
          style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
          accessibilityLabel="Marquer la note comme vue"
        >
          <Check size={14} color={theme.colors.text} strokeWidth={2.5} />
          <Text style={styles.doneText}>Vu</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm + 2,
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md - 2,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  bannerCompact: {
    marginHorizontal: 0,
    marginTop: theme.spacing.sm,
    marginBottom: 0,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  content: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.text,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  doneButtonPressed: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  doneText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.text,
  },
});
