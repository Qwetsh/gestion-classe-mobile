import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { theme } from '../../constants/theme';

const MAX_LENGTH = 500;

interface SessionNoteSheetProps {
  visible: boolean;
  initialText: string;
  isSaving: boolean;
  onSave: (text: string) => void;
  onClose: () => void;
}

/** Sheet "Note de séance" (maquette 9c). */
export function SessionNoteSheet({
  visible,
  initialText,
  isSaving,
  onSave,
  onClose,
}: SessionNoteSheetProps) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (visible) setText(initialText);
  }, [visible, initialText]);

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      <Text style={styles.title}>Note de séance</Text>
      <Text style={styles.hint}>
        Notions incomprises, remarques générales, à reprendre la prochaine fois…
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Vos notes sur cette séance…"
        placeholderTextColor={theme.colors.textTertiary}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MAX_LENGTH}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>
        {text.length}/{MAX_LENGTH}
      </Text>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
          onPress={onClose}
          disabled={isSaving}
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            isSaving && styles.saveButtonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => onSave(text)}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={theme.colors.textInverse} size="small" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: theme.spacing.md,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 110,
    maxHeight: 200,
  },
  charCount: {
    fontFamily: theme.fonts.body,
    fontSize: 11.5,
    color: theme.colors.textTertiary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm + 2,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  cancelButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.textInverse,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
