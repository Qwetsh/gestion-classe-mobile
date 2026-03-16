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
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../constants/theme';
import { supabase } from '../services/supabase';
import { useAuthStore } from '../stores';

type FeedbackType = 'bug' | 'suggestion' | 'autre';

const typeOptions: { value: FeedbackType; label: string; color: string }[] = [
  { value: 'bug', label: '🐛 Bug', color: theme.colors.error },
  { value: 'suggestion', label: '💡 Suggestion', color: theme.colors.primary },
  { value: 'autre', label: '💬 Autre', color: theme.colors.textSecondary },
];

export function FeedbackButton() {
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
      {/* Floating button */}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setShowModal(true)}
      >
        <LinearGradient
          colors={theme.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <Text style={styles.fabText}>💬</Text>
        </LinearGradient>
      </Pressable>

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
              <LinearGradient
                colors={theme.gradients.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.modalHeader}
              >
                <View>
                  <Text style={styles.modalTitle}>Votre retour</Text>
                  <Text style={styles.modalSubtitle}>
                    Aidez-nous a ameliorer l'application
                  </Text>
                </View>
                <Pressable style={styles.closeButton} onPress={handleClose}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </LinearGradient>

              {sent ? (
                <View style={styles.sentContainer}>
                  <Text style={styles.sentIcon}>✅</Text>
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
                          ? 'Decrivez le probleme rencontre...'
                          : 'Votre idee ou commentaire...'
                      }
                      placeholderTextColor={theme.colors.textTertiary}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Footer */}
                  <View style={styles.footer}>
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
                      <LinearGradient
                        colors={theme.gradients.primary}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.submitBtnGradient}
                      >
                        {isSending ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.submitBtnText}>Envoyer</Text>
                        )}
                      </LinearGradient>
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
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    ...theme.shadows.md,
    zIndex: 40,
  },
  fabPressed: {
    transform: [{ scale: 1.1 }],
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    fontSize: 24,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  modalHeader: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  modalSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: theme.colors.textInverse,
    fontWeight: '600',
  },

  // Sent state
  sentContainer: {
    padding: 40,
    alignItems: 'center',
  },
  sentIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  sentText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },

  // Body
  body: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
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
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  typeButtonTextActive: {
    color: theme.colors.textInverse,
  },
  textInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: 14,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 120,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  submitBtn: {
    flex: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
});
