import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { theme } from '../../constants/theme';
import { GRADE_SCALES, DEFAULT_GRADE_SCALE, GradeScale, getGroupColor } from '../../constants/groups';

interface GroupNoteModalProps {
  visible: boolean;
  groupNumber: number;
  memberNames: string[];
  onClose: () => void;
  onSubmit: (gradeValue: number, gradeMax: number, note?: string) => Promise<void>;
}

/**
 * Modal for adding a grade to a group
 * Allows selecting scale (5, 10, 20) and entering grade value
 */
export function GroupNoteModal({
  visible,
  groupNumber,
  memberNames,
  onClose,
  onSubmit,
}: GroupNoteModalProps) {
  const [gradeScale, setGradeScale] = useState<GradeScale>(DEFAULT_GRADE_SCALE);
  const [gradeValue, setGradeValue] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupColor = getGroupColor(groupNumber);

  const handleSubmit = async () => {
    const value = parseFloat(gradeValue);

    if (isNaN(value)) {
      setError('Veuillez entrer une note valide');
      return;
    }

    if (value < 0 || value > gradeScale) {
      setError(`La note doit etre entre 0 et ${gradeScale}`);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(value, gradeScale, comment.trim() || undefined);
      handleClose();
    } catch (e) {
      setError('Erreur lors de l\'enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setGradeValue('');
    setComment('');
    setError(null);
    setGradeScale(DEFAULT_GRADE_SCALE);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.content}>
          <Text style={styles.title}>Note - Groupe {groupNumber}</Text>

          <View style={[styles.membersBox, { borderColor: groupColor }]}>
            <Text style={styles.membersText} numberOfLines={2}>
              {memberNames.join(', ')}
            </Text>
          </View>

          {/* Scale selector */}
          <Text style={styles.label}>Bareme :</Text>
          <View style={styles.scaleRow}>
            {GRADE_SCALES.map((scale) => (
              <Pressable
                key={scale}
                style={[
                  styles.scaleButton,
                  gradeScale === scale && styles.scaleButtonActive,
                ]}
                onPress={() => setGradeScale(scale)}
              >
                <Text
                  style={[
                    styles.scaleButtonText,
                    gradeScale === scale && styles.scaleButtonTextActive,
                  ]}
                >
                  /{scale}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Grade input */}
          <Text style={styles.label}>Note :</Text>
          <View style={styles.gradeInputRow}>
            <TextInput
              style={styles.gradeInput}
              value={gradeValue}
              onChangeText={setGradeValue}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
            />
            <Text style={styles.gradeMax}>/ {gradeScale}</Text>
          </View>

          {/* Comment input */}
          <Text style={styles.label}>Commentaire (optionnel) :</Text>
          <TextInput
            style={styles.commentInput}
            value={comment}
            onChangeText={setComment}
            placeholder="Bon travail d'equipe..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            numberOfLines={2}
          />

          {/* Warning */}
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              Cette note sera attribuee a chaque membre du groupe
            </Text>
          </View>

          {error && (
            <Text style={styles.errorText}>{error}</Text>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[
                styles.submitButton,
                (!gradeValue || isSubmitting) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!gradeValue || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color={theme.colors.textInverse} size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Enregistrer</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    width: '85%',
    maxWidth: 400,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  membersBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  membersText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  scaleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  scaleButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
  },
  scaleButtonActive: {
    borderColor: theme.colors.participation,
    backgroundColor: theme.colors.participation,
  },
  scaleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  scaleButtonTextActive: {
    color: theme.colors.textInverse,
  },
  gradeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  gradeInput: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 24,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  gradeMax: {
    fontSize: 20,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  commentInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  warning: {
    backgroundColor: '#FEF3C7',
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  cancelButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: theme.colors.participation,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
  },
  submitButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
