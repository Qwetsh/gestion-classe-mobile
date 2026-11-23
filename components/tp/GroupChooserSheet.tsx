/**
 * Choisir un groupe en gros boutons de couleur (maquette 3d) : ranger une photo, ou déplacer
 * un élève vers un autre groupe. Option « toute la classe » / « retirer du groupe » selon l'usage.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '../session/BottomSheet';
import { theme } from '../../constants/theme';
import { tpGroupColor } from '../../utils/tpGroups';

export interface ChooserGroup {
  id: string;
  name: string;
  displayOrder: number;
  subtitle: string;
}

interface Props {
  visible: boolean;
  title: string;
  groups: ChooserGroup[];
  /** Groupe mis en avant (celui de la fiche ouverte, ou le groupe actuel de l'élève) */
  highlightId?: string | null;
  /** Groupe à griser (l'élève y est déjà) */
  disabledId?: string | null;
  previewUri?: string | null;
  /** Bouton du bas : « Toute la classe (photo de référence) » ou « Retirer du groupe » */
  extraLabel?: string;
  onExtra?: (caption: string) => void;
  withCaption?: boolean;
  onPick: (groupId: string, caption: string) => void;
  onClose: () => void;
}

export function GroupChooserSheet({
  visible, title, groups, highlightId, disabledId, previewUri, extraLabel, onExtra, withCaption, onPick, onClose,
}: Props) {
  const [caption, setCaption] = useState('');
  useEffect(() => {
    if (visible) setCaption('');
  }, [visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard={withCaption}>
      <View style={styles.body}>
        {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.grid}>
          {groups.map((g) => {
            const c = tpGroupColor(g.displayOrder);
            const off = g.id === disabledId;
            return (
              <Pressable
                key={g.id}
                disabled={off}
                onPress={() => onPick(g.id, caption)}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: c.soft, borderColor: c.border, borderWidth: g.id === highlightId ? 3 : 1.5 },
                  off && styles.off,
                  pressed && styles.pressed,
                ]}
                accessibilityLabel={`${g.name}, ${g.subtitle}`}
              >
                <Text style={[styles.btnName, { color: c.text }]}>{g.name}</Text>
                <Text style={[styles.btnSub, { color: c.text }]} numberOfLines={1}>{off ? 'ici' : g.subtitle}</Text>
              </Pressable>
            );
          })}
        </View>
        {extraLabel && onExtra && (
          <Pressable style={({ pressed }) => [styles.extra, pressed && styles.pressed]} onPress={() => onExtra(caption)}>
            <Text style={styles.extraText}>{extraLabel}</Text>
          </Pressable>
        )}
        {withCaption && (
          <TextInput
            style={styles.caption}
            value={caption}
            onChangeText={setCaption}
            placeholder="Légende (facultatif)"
            placeholderTextColor={theme.colors.textTertiary}
            maxLength={120}
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  preview: { width: '100%', height: 180, borderRadius: 14, backgroundColor: theme.colors.border },
  title: { ...theme.typography.h3, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { width: '31.5%', height: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  btnName: { fontSize: 18, fontFamily: theme.fonts.bodyBold },
  btnSub: { fontSize: 11, fontFamily: theme.fonts.bodySemibold },
  off: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  extra: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  extraText: { ...theme.typography.label, color: theme.colors.text },
  caption: {
    height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 12,
    ...theme.typography.bodySmall, color: theme.colors.text,
  },
});
