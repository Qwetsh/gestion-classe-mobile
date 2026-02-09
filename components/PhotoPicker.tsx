import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Image,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../constants/theme';
import {
  pickFromCamera,
  pickFromGallery,
  uploadStudentPhoto,
  getStudentPhotoUrl,
  getStudentPhotoPath,
  updateStudentPhotoPath,
} from '../services/photos';

interface PhotoPickerProps {
  studentId: string;
  userId: string;
  size?: number;
  initial?: string;
}

export function PhotoPicker({
  studentId,
  userId,
  size = 80,
  initial = '?',
}: PhotoPickerProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  // Load photo URL on mount
  useEffect(() => {
    loadPhoto();
  }, [studentId]);

  const loadPhoto = async () => {
    setLoadingUrl(true);
    try {
      // First get the photo path from Supabase
      const photoPath = await getStudentPhotoPath(studentId);
      if (photoPath) {
        // Then get the signed URL
        const url = await getStudentPhotoUrl(photoPath);
        setPhotoUrl(url);
      } else {
        setPhotoUrl(null);
      }
    } catch (err) {
      console.error('[PhotoPicker] Load failed:', err);
      setPhotoUrl(null);
    }
    setLoadingUrl(false);
  };

  const handlePickImage = async (source: 'camera' | 'gallery') => {
    setModalVisible(false);

    let uri: string | null = null;
    if (source === 'camera') {
      uri = await pickFromCamera();
    } else {
      uri = await pickFromGallery();
    }

    if (!uri) return;

    setIsUploading(true);
    const result = await uploadStudentPhoto(userId, studentId, uri);

    if (result.success && result.path) {
      // Update the photo_path in Supabase
      await updateStudentPhotoPath(studentId, result.path);
      // Load the new photo URL
      const url = await getStudentPhotoUrl(result.path);
      setPhotoUrl(url);
    }
    setIsUploading(false);
  };

  const avatarStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  return (
    <>
      <Pressable
        style={[styles.avatarContainer, avatarStyle]}
        onPress={() => setModalVisible(true)}
        disabled={isUploading}
      >
        {isUploading || loadingUrl ? (
          <View style={[styles.avatarPlaceholder, avatarStyle]}>
            <ActivityIndicator color={theme.colors.textInverse} />
          </View>
        ) : photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={[styles.avatar, avatarStyle]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.avatarPlaceholder, avatarStyle]}>
            <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>
              {initial}
            </Text>
          </View>
        )}
        <View style={styles.editBadge}>
          <Text style={styles.editBadgeText}>+</Text>
        </View>
      </Pressable>

      {/* Source Selection Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ajouter une photo</Text>

            <Pressable
              style={styles.optionButton}
              onPress={() => handlePickImage('camera')}
            >
              <Text style={styles.optionIcon}>📷</Text>
              <Text style={styles.optionText}>Prendre une photo</Text>
            </Pressable>

            <Pressable
              style={styles.optionButton}
              onPress={() => handlePickImage('gallery')}
            >
              <Text style={styles.optionIcon}>🖼️</Text>
              <Text style={styles.optionText}>Choisir dans la galerie</Text>
            </Pressable>

            <Pressable
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    backgroundColor: theme.colors.border,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.participation,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: theme.colors.textInverse,
    fontWeight: '600',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.participation,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl + 20, // Extra padding for safe area
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
  },
  optionIcon: {
    fontSize: 24,
    marginRight: theme.spacing.md,
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '500',
  },
  cancelButton: {
    padding: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  cancelButtonText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
});
