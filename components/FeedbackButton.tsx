import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Check, MessageCircle, X } from 'lucide-react-native';
import { theme } from '../constants/theme';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores';

type FeedbackType = 'bug' | 'suggestion' | 'autre';

const typeOptions: { value: FeedbackType; label: string; color: string }[] = [
  { value: 'bug', label: 'Bug', color: theme.colors.error },
  { value: 'suggestion', label: 'Suggestion', color: theme.colors.primary },
  { value: 'autre', label: 'Autre', color: theme.colors.textSecondary },
];

interface FeedbackButtonProps {
  /** 'icon' = cercle 40 blanc borde (header accueil), 'button' = bouton pleine largeur */
  variant?: 'icon' | 'button';
}

export function FeedbackButton({ variant = 'button' }: FeedbackButtonProps) {
  const { user } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState<FeedbackType>('suggestion');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!user || !supabase || !message.trim()) return;
    setIsSending(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        user_id: user.id,
        user_email: user.email,
        type,
        message: message.trim(),
      });
      if (error) throw error;
      setSent(true);
      setTimeout(() => {
        setShowModal(false);
        setSent(false);
        setMessage('');
        setType('suggestion');
      }, 1500);
    } catch (err) {
      console.error('Error sending feedback:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setSent(false);
  };

  return (
    <>
      {variant === 'icon' ? (
        <Pressable
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          onPress={() => setShowModal(true)}
          hitSlop={4}
        >
          <MessageCircle size={19} color={theme.colors.textSecondary} strokeWidth={1.8} />
        </Pressable>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => setShowModal(true)}
        >
          <MessageCircle size={17} color={theme.colors.textInverse} strokeWidth={2} />
          <Text style={styles.buttonText}>Envoyer un retour</Text>
        </Pressable>
      )}

      {/* Modal */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Pressable style={styles.modalOverlay} onPress={handleClose}>
            <Pressable style={styles.modalContent} onPress={() => {}}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Votre retour</Text>
                  <Text style={styles.modalSubtitle}>
                    Aidez-nous à améliorer l'application
                  </Text>
                </View>
                <Pressable style={styles.closeButton} onPress={handleClose}>
                  <X size={18} color={theme.colors.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>

              {sent ? (
                <View style={styles.sentContainer}>
                  <View style={styles.sentIconCircle}>
                    <Check size={28} color={theme.colors.action} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.sentText}>Merci pour votre retour !</Text>
                </View>
              ) : (
                <>
                  {/* Type selector */}
                  <View style={styles.body}>
                    <Text style={styles.label}>Type</Text>
                    <View style={styles.typeRow}>
                      {typeOptions.map(opt => (
                        <Pressable
                          key={opt.value}
                          style={[
                            styles.typeButton,
                            type === opt.value && {
                              backgroundColor: opt.color,
                              borderColor: opt.color,
                            },
                          ]}
                          onPress={() => setType(opt.value)}
                        >
                          <Text
                            style={[
                              styles.typeButtonText,
                              type === opt.value && styles.typeButtonTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Message */}
                    <Text style={styles.label}>Message</Text>
                    <TextInput
                      style={styles.textInput}
                      value={message}
                      onChangeText={setMessage}
                      placeholder={
                        type === 'bug'
                          ? 'Décrivez le problème rencontré...'
                          : 'Votre idée ou commentaire...'
                      }
                      placeholderTextColor={theme.colors.textTertiary}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Footer */}
                  <View style={styles.modalFooter}>
                    <Pressable style={styles.cancelBtn} onPress={handleClose}>
                      <Text style={styles.cancelBtnText}>Annuler</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.submitBtn,
                        (!message.trim() || isSending) && styles.submitBtnDisabled,
                      ]}
                      onPress={handleSubmit}
                      disabled={isSending || !message.trim()}
                    >
                      {isSending ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.submitBtnText}>Envoyer</Text>
                      )}
                    </Pressable>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Icon trigger (header accueil)
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },

  // Full-width trigger
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: theme.spacing.md,
  },
  buttonPressed: {
    backgroundColor: theme.colors.primaryStrong,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.textInverse,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.sheetBackdrop,
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  modalHeader: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  modalTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 19,
    color: theme.colors.text,
  },
  modalSubtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Sent state
  sentContainer: {
    padding: 40,
    alignItems: 'center',
  },
  sentIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.actionSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  sentText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 18,
    color: theme.colors.text,
  },

  // Body
  body: {
    padding: 20,
  },
  label: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  typeButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  typeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  textInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 120,
  },

  // Modal footer
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  submitBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 15,
    color: theme.colors.textInverse,
  },
});
