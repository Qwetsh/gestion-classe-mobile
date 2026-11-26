/**
 * Bandeau « À faire rattraper » : à chaque séance de la classe, rappelle les évals écrites
 * dont des élèves étaient absents et n'ont encore ni copie ni note (vue pending_makeups).
 * La liste suit les rattrapages toute seule : une copie scannée sort l'élève de la liste.
 * « Ne plus rappeler » coupe le rappel de l'éval partout (accueil web compris).
 */
import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { RotateCcw } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { dismissMakeupReminder, fetchMakeupRemindersFor } from '../services/makeupReminders';
import type { MakeupReminder } from '../utils/makeupReminders';

interface Props {
  classId: string | null | undefined;
  /** Instant de référence : début de la séance, ou maintenant */
  at: Date | string;
  groupId?: string | null;
  /** Variante réduite (écran de démarrage) : une ligne par éval, pas de bouton */
  compact?: boolean;
  style?: object;
}

export function MakeupReminderBanner({ classId, at, groupId, compact = false, style }: Props) {
  const [reminders, setReminders] = useState<MakeupReminder[]>([]);
  const atMs = typeof at === 'string' ? new Date(at).getTime() : at.getTime();

  const load = useCallback(() => {
    let cancelled = false;
    if (!classId || Number.isNaN(atMs)) {
      setReminders([]);
      return () => {};
    }
    fetchMakeupRemindersFor(classId, new Date(atMs), groupId).then((list) => {
      if (!cancelled) setReminders(list);
    });
    return () => {
      cancelled = true;
    };
  }, [classId, atMs, groupId]);

  // Au montage, quand la classe change, et au retour sur l'écran (après avoir scanné la copie
  // d'un absent) : la liste se met à jour
  useFocusEffect(load);

  if (reminders.length === 0) return null;

  const confirmDismiss = (r: MakeupReminder) => {
    Alert.alert(
      'Ne plus rappeler ce rattrapage ?',
      `Le rappel de « ${r.assessmentName} » disparaîtra de toutes les séances. Les absences restent notées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ne plus rappeler',
          style: 'destructive',
          onPress: async () => {
            setReminders((prev) => prev.filter((x) => x.assessmentId !== r.assessmentId));
            const ok = await dismissMakeupReminder(r.assessmentId);
            if (!ok) load();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.banner, compact && styles.bannerCompact, style]}>
      <RotateCcw size={compact ? 16 : 18} color={theme.colors.warning} strokeWidth={2} />
      <View style={styles.body}>
        {!compact && <Text style={styles.label}>À faire rattraper</Text>}
        {reminders.map((r) => (
          <View key={r.assessmentId} style={styles.item}>
            <Text style={styles.content} numberOfLines={compact ? 2 : 6}>
              Faire reprendre l'éval <Text style={styles.evalName}>{r.assessmentName}</Text> à :{' '}
              <Text style={styles.students}>{r.students.map((s) => s.pseudo).join(', ')}</Text>
            </Text>
            {!compact && (
              <Pressable
                onPress={() => confirmDismiss(r)}
                hitSlop={8}
                style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
                accessibilityLabel={`Ne plus rappeler le rattrapage de ${r.assessmentName}`}
              >
                <Text style={styles.dismissText}>Ne plus rappeler</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
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
    gap: theme.spacing.xs,
  },
  label: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.warning,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    gap: 2,
  },
  content: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.text,
  },
  evalName: {
    fontFamily: theme.fonts.bodySemibold,
  },
  students: {
    fontFamily: theme.fonts.bodySemibold,
  },
  dismiss: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  dismissPressed: {
    opacity: 0.6,
  },
  dismissText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
