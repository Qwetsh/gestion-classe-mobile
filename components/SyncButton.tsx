import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../constants/theme';
import { useAuthStore, useSyncStore, useClassStore, useRoomStore, useIsOffline } from '../stores';
import { SyncResult } from '../services/sync';

export function SyncButton() {
  const { user } = useAuthStore();
  const {
    isSyncing,
    unsyncedCount,
    lastSyncResult,
    error,
    sync,
    refreshUnsyncedCount,
    clearLastResult,
    clearError,
  } = useSyncStore();
  const { loadClasses } = useClassStore();
  const { loadRooms } = useRoomStore();
  const isOffline = useIsOffline();

  const [showResultModal, setShowResultModal] = useState(false);
  // Capture le résultat au moment où le modal s'ouvre pour éviter les changements pendant l'affichage
  const [displayedResult, setDisplayedResult] = useState<{ result: SyncResult | null; error: string | null } | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Refresh unsynced count on mount and periodically
  useEffect(() => {
    refreshUnsyncedCount();
    const interval = setInterval(refreshUnsyncedCount, 30000); // Every 30s
    return () => clearInterval(interval);
  }, []);

  // Pulse animation when there are unsynced items
  useEffect(() => {
    if (unsyncedCount > 0 && !isSyncing && !isOffline) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [unsyncedCount, isSyncing, isOffline]);

  // Rotation animation while syncing
  useEffect(() => {
    if (isSyncing) {
      const animation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => {
        animation.stop();
        rotateAnim.setValue(0);
      };
    }
  }, [isSyncing]);

  // Show result modal ONLY on failure - success syncs silently
  useEffect(() => {
    if (lastSyncResult && !isSyncing && !showResultModal) {
      if (!lastSyncResult.success) {
        // Only show modal on failure
        setDisplayedResult({ result: lastSyncResult, error });
        setShowResultModal(true);
      } else {
        // Success - clear silently without modal
        clearLastResult();
      }
    }
  }, [lastSyncResult, isSyncing]);

  const handleSync = async () => {
    if (!user?.id || isSyncing || isOffline) return;
    const result = await sync(user.id);

    // Reload stores after sync to show pulled data
    if (result.success) {
      await loadClasses(user.id);
      await loadRooms(user.id);
    }
  };

  const handleCloseModal = () => {
    setShowResultModal(false);
    setDisplayedResult(null);
    clearLastResult();
    clearError();
  };

  const getTotalSynced = () => {
    const result = displayedResult?.result;
    if (!result) return 0;
    return (
      result.classesSync +
      result.studentsSync +
      result.roomsSync +
      result.plansSync +
      result.sessionsSync +
      result.eventsSync
    );
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            isOffline && styles.buttonDisabled,
            pressed && !isOffline && styles.buttonPressed,
          ]}
          onPress={handleSync}
          disabled={isOffline || isSyncing}
        >
          {isSyncing ? (
            <LinearGradient
              colors={theme.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Animated.Text style={[styles.buttonIconSyncing, { transform: [{ rotate: spin }] }]}>
                ↻
              </Animated.Text>
              <Text style={styles.buttonTextSyncing}>Synchronisation...</Text>
            </LinearGradient>
          ) : (
            <View style={styles.buttonInner}>
              <View style={styles.iconContainer}>
                <Text style={styles.buttonIcon}>↻</Text>
              </View>
              <Text style={styles.buttonText}>Synchroniser</Text>
              {unsyncedCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unsyncedCount > 99 ? '99+' : unsyncedCount}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Pressable>
      </Animated.View>

      {isOffline && (
        <View style={styles.offlineContainer}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineHint}>Hors ligne</Text>
        </View>
      )}

      {/* Result Modal */}
      <Modal
        visible={showResultModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <Pressable style={styles.modalOverlay} onPress={handleCloseModal}>
          <View style={styles.modalContent}>
            {displayedResult?.result?.success ? (
              <>
                <View style={styles.modalIconContainer}>
                  <LinearGradient
                    colors={theme.gradients.success}
                    style={styles.modalIconGradient}
                  >
                    <Text style={styles.modalIconText}>✓</Text>
                  </LinearGradient>
                </View>
                <Text style={styles.modalTitle}>Synchronisation reussie</Text>
                <Text style={styles.modalText}>
                  {getTotalSynced()} element{getTotalSynced() > 1 ? 's' : ''} synchronise{getTotalSynced() > 1 ? 's' : ''}
                </Text>
                {getTotalSynced() > 0 && (
                  <View style={styles.detailsList}>
                    {displayedResult.result.classesSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>📚</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.classesSync} classe{displayedResult.result.classesSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {displayedResult.result.studentsSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>👥</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.studentsSync} eleve{displayedResult.result.studentsSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {displayedResult.result.roomsSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>🏫</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.roomsSync} salle{displayedResult.result.roomsSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {displayedResult.result.plansSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>📐</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.plansSync} plan{displayedResult.result.plansSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {displayedResult.result.sessionsSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>📋</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.sessionsSync} seance{displayedResult.result.sessionsSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                    {displayedResult.result.eventsSync > 0 && (
                      <View style={styles.detailItem}>
                        <Text style={styles.detailEmoji}>✋</Text>
                        <Text style={styles.detailText}>
                          {displayedResult.result.eventsSync} evenement{displayedResult.result.eventsSync > 1 ? 's' : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={[styles.modalIconContainer, styles.modalIconContainerError]}>
                  <Text style={styles.modalIconTextError}>✗</Text>
                </View>
                <Text style={styles.modalTitle}>Erreur de synchronisation</Text>
                <Text style={styles.modalTextError}>
                  {displayedResult?.error || displayedResult?.result?.errors.join('\n') || 'Une erreur est survenue'}
                </Text>
              </>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.closeButtonPressed,
              ]}
              onPress={handleCloseModal}
            >
              <Text style={styles.closeButtonText}>Fermer</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonIcon: {
    fontSize: 18,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  buttonIconSyncing: {
    fontSize: 20,
    color: theme.colors.textInverse,
    fontWeight: '700',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  buttonTextSyncing: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textInverse,
  },
  badge: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.full,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: theme.spacing.xs,
  },
  badgeText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },
  offlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.warning,
  },
  offlineHint: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.xl,
  },
  modalIconContainer: {
    marginBottom: theme.spacing.md,
  },
  modalIconGradient: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalIconContainerError: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.errorSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalIconText: {
    fontSize: 32,
    color: theme.colors.textInverse,
  },
  modalIconTextError: {
    fontSize: 32,
    color: theme.colors.error,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  modalTextError: {
    fontSize: 15,
    color: theme.colors.error,
    textAlign: 'center',
  },
  detailsList: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  detailEmoji: {
    fontSize: 16,
  },
  detailText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  closeButton: {
    marginTop: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
  },
  closeButtonPressed: {
    backgroundColor: theme.colors.primary,
  },
  closeButtonText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
