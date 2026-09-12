import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EyeOff, Eye, Timer, TimerOff, Monitor, LayoutGrid, PenLine } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import { triggerLightFeedback } from '../../utils/haptics';
import { sendClassroomCommand } from '../../services/sync/classroomChannel';

interface ScreenControlSheetProps {
  visible: boolean;
  onClose: () => void;
}

const TIMER_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
];

/**
 * Sheet « Écran » : télécommande de l'écran projeté (mode « en classe »).
 * Minuteur, rideau. Aucune donnée élève n'est produite ici.
 */
export function ScreenControlSheet({ visible, onClose }: ScreenControlSheetProps) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const [view, setView] = useState<'plan' | 'board'>('plan');

  const switchView = useCallback((mode: 'plan' | 'board') => {
    triggerLightFeedback();
    setView(mode);
    void sendClassroomCommand({ kind: 'view', mode });
  }, []);

  const startTimer = useCallback((seconds: number) => {
    triggerLightFeedback();
    setTimerRunning(true);
    void sendClassroomCommand({ kind: 'timer', action: 'start', seconds });
  }, []);

  const stopTimer = useCallback(() => {
    triggerLightFeedback();
    setTimerRunning(false);
    void sendClassroomCommand({ kind: 'timer', action: 'stop' });
  }, []);

  const toggleCurtain = useCallback(() => {
    triggerLightFeedback();
    const next = !curtain;
    setCurtain(next);
    void sendClassroomCommand({ kind: 'curtain', on: next });
  }, [curtain]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Monitor size={18} color={theme.colors.primary} strokeWidth={1.8} />
        <Text style={styles.title}>Écran de la classe</Text>
      </View>
      <Text style={styles.subtitle}>
        Pilote la page « En classe » ouverte sur le tableau.
      </Text>

      <Text style={styles.sectionLabel}>MINUTEUR</Text>
      <View style={styles.presetRow}>
        {TIMER_PRESETS.map((p) => (
          <Pressable
            key={p.seconds}
            style={({ pressed }) => [styles.preset, pressed && styles.pressed]}
            onPress={() => startTimer(p.seconds)}
          >
            <Timer size={15} color={theme.colors.text} strokeWidth={1.8} />
            <Text style={styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={({ pressed }) => [styles.wideButton, !timerRunning && styles.wideButtonDisabled, pressed && styles.pressed]}
        onPress={stopTimer}
        disabled={!timerRunning}
      >
        <TimerOff size={16} color={timerRunning ? theme.colors.text : theme.colors.textTertiary} strokeWidth={1.8} />
        <Text style={[styles.wideButtonText, !timerRunning && styles.wideButtonTextDisabled]}>Arrêter le minuteur</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>AFFICHAGE</Text>
      <View style={styles.presetRow}>
        <Pressable
          style={({ pressed }) => [styles.preset, view === 'plan' && styles.presetActive, pressed && styles.pressed]}
          onPress={() => switchView('plan')}
        >
          <LayoutGrid size={15} color={view === 'plan' ? theme.colors.primary : theme.colors.text} strokeWidth={1.8} />
          <Text style={[styles.presetText, view === 'plan' && styles.presetTextActive]}>Plan de classe</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.preset, view === 'board' && styles.presetActive, pressed && styles.pressed]}
          onPress={() => switchView('board')}
        >
          <PenLine size={15} color={view === 'board' ? theme.colors.primary : theme.colors.text} strokeWidth={1.8} />
          <Text style={[styles.presetText, view === 'board' && styles.presetTextActive]}>Tableau blanc</Text>
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.wideButton, curtain && styles.wideButtonActive, pressed && styles.pressed]}
        onPress={toggleCurtain}
      >
        {curtain
          ? <Eye size={16} color={theme.colors.primary} strokeWidth={1.8} />
          : <EyeOff size={16} color={theme.colors.text} strokeWidth={1.8} />}
        <Text style={[styles.wideButtonText, curtain && styles.wideButtonTextActive]}>
          {curtain ? 'Retirer le rideau' : 'Mettre le rideau (écran noir)'}
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        onPress={onClose}
      >
        <Text style={styles.primaryButtonText}>Fermer</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 13.5,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  sectionLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11.5,
    color: theme.colors.textTertiary,
    letterSpacing: 0.8,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: theme.spacing.sm,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingVertical: 10,
  },
  presetActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  presetText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.text,
  },
  presetTextActive: {
    color: theme.colors.primary,
  },
  wideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
  },
  wideButtonDisabled: {
    opacity: 0.55,
  },
  wideButtonActive: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
  },
  wideButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14.5,
    color: theme.colors.text,
  },
  wideButtonTextDisabled: {
    color: theme.colors.textTertiary,
  },
  wideButtonTextActive: {
    color: theme.colors.primary,
  },
  primaryButton: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    marginTop: theme.spacing.sm,
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  pressed: {
    opacity: 0.85,
  },
});
