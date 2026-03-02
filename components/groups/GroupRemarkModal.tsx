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
  Image,
} from 'react-native';
import { theme } from '../../constants/theme';
import { getGroupColor } from '../../constants/groups';
import {
  pickFromCamera,
  pickFromGallery,
  type PhotoQuality,
} from '../../services/photos';

interface GroupRemarkModalProps {
  visible: boolean;
  groupNumber: number;
  memberNames: string[];
  onClose: () => void;
  onSubmit: (note: string, photoUri?: string, photoQuality?: PhotoQuality) => Promise<void>;
}

/**
 * Modal for adding a remark to a group
 * Supports text and optional photo
 */
export function GroupRemarkModal({
  visible,
  groupNumber,
  memberNames,
  onClose,
  onSubmit,
}: GroupRemarkModalProps) {
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality>('minimal');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const groupColor = getGroupColor(groupNumber);

  const handlePickPhoto = async (source: 'camera' | 'gallery') => {
    let uri: string | null = null;
    if (source === 'camera') {
      uri = await pickFromCamera();
    } else {
      uri = await pickFromGallery();
    }
    if (uri) {
      setPhotoUri(uri);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUri(null);
  };

  const handleSubmit = async () => {
    if (!note.trim() && !photoUri) return;

    setIsSubmitting(true);
    try {
      await onSubmit(note.trim(), photoUri || undefined, photoQuality);
      handleClose();
    } catch (e) {
      console.error('Error submitting group remark:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setNote('');
    setPhotoUri(null);
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
          <Text style={styles.title}>Remarque - Groupe {groupNumber}</Text>

          <View style={[styles.membersBox, { borderColor: groupColor }]}>
            <Text style={styles.membersText} numberOfLines={2}>
              {memberNames.join(', ')}
            </Text>
          </View>

          {/* Note input */}
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Remarque sur le travail du groupe..."
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            numberOfLines={4}
            autoFocus
          />

          {/* Photo section */}
          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>Photo (optionnel)</Text>
            {photoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <Pressable style={styles.removePhotoButton} onPress={handleRemovePhoto}>
                  <Text style={styles.removePhotoText}>X</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoButtons}>
                <Pressable
                  style={styles.photoButton}
                  onPress={() => handlePickPhoto('camera')}
                >
                  <Text style={styles.photoButtonIcon}>📷</Text>
                  <Text style={styles.photoButtonText}>Camera</Text>
                </Pressable>
                <Pressable
                  style={styles.photoButton}
                  onPress={() => handlePickPhoto('gallery')}
                >
                  <Text style={styles.photoButtonIcon}>🖼️</Text>
                  <Text style={styles.photoButtonText}>Galerie</Text>
                </Pressable>
              </View>
            )}

            {/* Quality selector */}
            <View style={styles.qualitySelector}>
              <Text style={styles.qualityLabel}>Qualite :</Text>
              <Pressable
                style={[
                  styles.qualityOption,
                  photoQuality === 'minimal' && styles.qualityOptionActive,
                ]}
                onPress={() => setPhotoQuality('minimal')}
              >
                <Text
                  style={[
                    styles.qualityOptionText,
                    photoQuality === 'minimal' && styles.qualityOptionTextActive,
                  ]}
                >
                  Minimale
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.qualityOption,
                  photoQuality === 'normal' && styles.qualityOptionActive,
                ]}
                onPress={() => setPhotoQuality('normal')}
              >
                <Text
                  style={[
                    styles.qualityOptionText,
                    photoQuality === 'normal' && styles.qualityOptionTextActive,
                  ]}
                >
                  Normale
                </Text>
              </Pressable>
            </View>
          </View>

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
                ((!note.trim() && !photoUri) || isSubmitting) && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={(!note.trim() && !photoUri) || isSubmitting}
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
  noteInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  photoSection: {
    marginBottom: theme.spacing.md,
  },
  photoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  photoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  photoButtonIcon: {
    fontSize: 18,
  },
  photoButtonText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  photoPreviewContainer: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removePhotoText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  qualitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  qualityLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  qualityOption: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  qualityOptionActive: {
    borderColor: theme.colors.participation,
    backgroundColor: theme.colors.participation,
  },
  qualityOptionText: {
    fontSize: 12,
    color: theme.colors.text,
  },
  qualityOptionTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600',
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
    backgroundColor: theme.colors.remarque,
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
