import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Plus, Trash2 } from 'lucide-react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';
import { TAG_COLORS, useStudentTagStore } from '../../stores/studentTagStore';

interface TagEditorSheetProps {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
}

/** Personnalisation des étiquettes de surlignage : libellé, couleur, ajout, suppression. */
export function TagEditorSheet({ visible, userId, onClose }: TagEditorSheetProps) {
  const { tags, assignments, addTag, updateTag, deleteTag } = useStudentTagStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);

  useEffect(() => {
    if (!visible) {
      setEditingId(null);
      setLabel('');
      setColor(TAG_COLORS[0]);
    }
  }, [visible]);

  const usageOf = (tagId: string) =>
    Object.values(assignments).reduce((n, ids) => n + (ids.includes(tagId) ? 1 : 0), 0);

  const startEdit = (id: string) => {
    const t = tags.find((x) => x.id === id);
    if (!t) return;
    setEditingId(id);
    setLabel(t.label);
    setColor(t.color);
  };

  const save = async () => {
    const clean = label.trim();
    if (!clean || !userId) return;
    if (editingId) await updateTag(editingId, clean, color);
    else await addTag(userId, clean, color);
    setEditingId(null);
    setLabel('');
  };

  const confirmDelete = (id: string, name: string) => {
    const n = usageOf(id);
    Alert.alert(
      'Supprimer l’étiquette',
      n > 0 ? `« ${name} » est posée sur ${n} élève${n > 1 ? 's' : ''}. Elle sera retirée partout.` : `Supprimer « ${name} » ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            deleteTag(id);
            if (editingId === id) {
              setEditingId(null);
              setLabel('');
            }
          },
        },
      ],
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text style={styles.title}>Étiquettes de surlignage</Text>
      <Text style={styles.hint}>
        Glissez une étiquette sur un élève pour le surligner. Glissez-la de nouveau (ou la gomme) pour la retirer.
        Visible sur ce téléphone uniquement.
      </Text>

      <ScrollView style={styles.list} contentContainerStyle={{ gap: 6 }}>
        {tags.map((t) => {
          const n = usageOf(t.id);
          return (
            <Pressable
              key={t.id}
              style={[styles.item, editingId === t.id && styles.itemActive]}
              onPress={() => startEdit(t.id)}
            >
              <View style={[styles.swatch, { backgroundColor: t.color }]} />
              <Text style={styles.itemLabel} numberOfLines={1}>{t.label}</Text>
              {n > 0 && <Text style={styles.itemCount}>{n} élève{n > 1 ? 's' : ''}</Text>}
              <Pressable hitSlop={8} onPress={() => confirmDelete(t.id, t.label)}>
                <Trash2 size={16} color={theme.colors.textTertiary} strokeWidth={1.8} />
              </Pressable>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.formTitle}>{editingId ? 'Modifier' : 'Nouvelle étiquette'}</Text>
      <TextInput
        style={styles.input}
        placeholder="Ex. : Punition en cours, À interroger…"
        placeholderTextColor={theme.colors.textTertiary}
        value={label}
        onChangeText={setLabel}
        maxLength={30}
      />
      <View style={styles.colors}>
        {TAG_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c }]}>
            {color === c && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
          onPress={editingId ? () => { setEditingId(null); setLabel(''); } : onClose}
        >
          <Text style={styles.cancelText}>{editingId ? 'Annuler' : 'Fermer'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.saveButton, !label.trim() && styles.disabled, pressed && styles.pressed]}
          onPress={save}
          disabled={!label.trim()}
        >
          {!editingId && <Plus size={16} color={theme.colors.textInverse} strokeWidth={2.2} />}
          <Text style={styles.saveText}>{editingId ? 'Enregistrer' : 'Ajouter'}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: theme.fonts.bodyBold, fontSize: 18, color: theme.colors.text, marginBottom: theme.spacing.xs },
  hint: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  list: { maxHeight: 220, marginBottom: theme.spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  itemActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  swatch: { width: 16, height: 16, borderRadius: 8 },
  itemLabel: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.text },
  itemCount: { fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.textSecondary },
  formTitle: { fontFamily: theme.fonts.bodySemibold, fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
  },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: theme.spacing.md },
  colorDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  cancelText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.text },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
