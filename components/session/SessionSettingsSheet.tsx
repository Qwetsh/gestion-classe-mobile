import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Grid3x3, Vibrate, Zap } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import { useSettingsStore } from '../../stores/settingsStore';

function SettingSwitch({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={[styles.switchTrack, value && styles.switchTrackOn]}
      onPress={onToggle}
      hitSlop={6}
    >
      <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
    </Pressable>
  );
}

interface SettingRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}

function SettingRow({ icon, title, description, value, onToggle }: SettingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <SettingSwitch value={value} onToggle={onToggle} />
    </View>
  );
}

interface SessionSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Sheet "Reglages de seance" (maquette 7b) : flick, haptique, grille compacte. */
export function SessionSettingsSheet({ visible, onClose }: SessionSettingsSheetProps) {
  const { flickMode, distinctHaptics, compactGrid, setSetting } = useSettingsStore();

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Réglages de séance</Text>

      <SettingRow
        icon={<Zap size={19} color={theme.colors.primary} strokeWidth={1.8} />}
        title="Mode expert (flick)"
        description="Un geste rapide dans une direction valide l'action sans afficher le menu."
        value={flickMode}
        onToggle={() => setSetting('flickMode', !flickMode)}
      />
      <SettingRow
        icon={<Vibrate size={19} color={theme.colors.primary} strokeWidth={1.8} />}
        title="Vibrations différenciées"
        description="Une signature haptique distincte par action pour valider sans regarder."
        value={distinctHaptics}
        onToggle={() => setSetting('distinctHaptics', !distinctHaptics)}
      />
      <SettingRow
        icon={<Grid3x3 size={19} color={theme.colors.primary} strokeWidth={1.8} />}
        title="Grille compacte"
        description="Cellules resserrées pour voir toute la classe sans défiler."
        value={compactGrid}
        onToggle={() => setSetting('compactGrid', !compactGrid)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14.5,
    color: theme.colors.text,
  },
  rowDescription: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.segmentTrack,
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: theme.colors.primary,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
});
