import { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore, useClassStore, useSessionStore, useSyncStore } from '../../stores';
import { theme } from '../../constants/theme';
import { FeedbackButton, AnnouncementBanner } from '../../components';
import Svg, { Path } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 260;
const CURVE_HEIGHT = 40;

function CurvedSeparator() {
  return (
    <View style={styles.curveContainer}>
      <Svg width={SCREEN_WIDTH} height={CURVE_HEIGHT} viewBox={`0 0 ${SCREEN_WIDTH} ${CURVE_HEIGHT}`}>
        <Path
          d={`M0,0 L0,0 Q${SCREEN_WIDTH / 2},${CURVE_HEIGHT * 2} ${SCREEN_WIDTH},0 L${SCREEN_WIDTH},${CURVE_HEIGHT} L0,${CURVE_HEIGHT} Z`}
          fill={theme.colors.background}
        />
      </Svg>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut, isLoading: authLoading } = useAuthStore();
  const {
    classes,
    isLoading: classesLoading,
    loadClasses,
  } = useClassStore();
  const {
    activeSession,
    isSessionActive,
    loadActiveSession,
    cancelCurrentSession,
  } = useSessionStore();
  const { sync, isSyncing } = useSyncStore();

  const hasAutoSynced = useRef(false);

  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
    }
  }, [user?.id, loadClasses]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadActiveSession(user.id);
      }
    }, [user?.id, loadActiveSession])
  );

  useEffect(() => {
    const autoSync = async () => {
      if (
        user?.id &&
        !classesLoading &&
        classes.length === 0 &&
        !isSyncing &&
        !hasAutoSynced.current
      ) {
        hasAutoSynced.current = true;
        if (__DEV__) console.log('[HomeScreen] No classes found locally, auto-syncing...');
        await sync(user.id);
        await loadClasses(user.id);
      }
    };
    autoSync();
  }, [user?.id, classesLoading, classes.length, isSyncing, sync, loadClasses]);

  const handleLogout = async () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          onPress: async () => {
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleCancelSession = () => {
    Alert.alert(
      'Annuler la séance',
      'Voulez-vous supprimer cette séance en cours ? Tous les événements seront perdus.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, supprimer',
          style: 'destructive',
          onPress: async () => {
            await cancelCurrentSession();
          },
        },
      ]
    );
  };

  const userName = user?.email?.split('@')[0] || 'Enseignant';
  const displayName = userName.charAt(0).toUpperCase() + userName.slice(1);

  return (
    <View style={styles.container}>
      {/* Gradient Header Background */}
      <LinearGradient
        colors={['#4F46E5', '#7C3AED', '#9333EA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      />
      <CurvedSeparator />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header on gradient */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.greetingContainer}>
                <Text style={styles.greeting}>Bonjour,</Text>
                <Text style={styles.userName}>{displayName}</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.profileButton,
                    pressed && styles.profileButtonPressed,
                  ]}
                  onPress={handleLogout}
                  disabled={authLoading}
                >
                  {authLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.profileInitial}>
                      {displayName.charAt(0)}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>

            {/* Announcements */}
            <AnnouncementBanner />
          </View>

          {/* Content cards (overlapping gradient and white) */}
          <View style={styles.content}>
            {/* Active Session Card */}
            {isSessionActive && activeSession && !activeSession.ended_at && (
              <View style={styles.activeSessionCard}>
                <View style={styles.activeSessionHeader}>
                  <View style={styles.liveIndicator}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>EN COURS</Text>
                  </View>
                </View>
                <Text style={styles.activeSessionTitle}>Séance active</Text>
                <Text style={styles.activeSessionSubtitle}>
                  Reprenez là où vous en étiez
                </Text>
                <View style={styles.activeSessionActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.resumeButton,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => router.push(`/(main)/session/${activeSession.id}`)}
                  >
                    <LinearGradient
                      colors={theme.gradients.success}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.gradientButton}
                    >
                      <Text style={styles.resumeButtonText}>Reprendre</Text>
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.cancelButton,
                      pressed && styles.cancelButtonPressed,
                    ]}
                    onPress={handleCancelSession}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Primary Action - Start Session OR Sync Indicator */}
            {!isSessionActive && (
              isSyncing ? (
                <View style={styles.primaryActionCard}>
                  <LinearGradient
                    colors={['#6366F1', '#4F46E5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryActionGradient}
                  >
                    <View style={styles.primaryActionLeft}>
                      <View style={styles.primaryActionIcon}>
                        <ActivityIndicator color="#fff" size="small" />
                      </View>
                      <View>
                        <Text style={styles.primaryActionTitle}>Synchronisation...</Text>
                        <Text style={styles.primaryActionSubtitle}>
                          Envoi des données en cours
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.primaryActionCard,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={() => router.push('/(main)/session/start')}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryActionGradient}
                  >
                    <View style={styles.primaryActionLeft}>
                      <View style={styles.primaryActionIcon}>
                        <Text style={styles.primaryActionIconText}>▶</Text>
                      </View>
                      <View>
                        <Text style={styles.primaryActionTitle}>Démarrer une séance</Text>
                        <Text style={styles.primaryActionSubtitle}>
                          Suivre la participation en classe
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Pressable>
              )
            )}

            {/* Quick Actions */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Accès rapide</Text>
            </View>

            <View style={styles.quickActionsGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.quickActionCard,
                  pressed && styles.quickActionCardPressed,
                ]}
                onPress={() => router.push('/(main)/parent-meeting')}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.primarySoft }]}>
                  <Text style={styles.quickActionIconText}>👨‍👩‍👧</Text>
                </View>
                <Text style={styles.quickActionTitle}>Réunions parents</Text>
              </Pressable>

            </View>

            {/* Navigation buttons */}
            <View style={styles.navButtonsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.navButton,
                  pressed && styles.navButtonPressed,
                ]}
                onPress={() => router.push('/(main)/classes')}
              >
                <View style={[styles.navButtonIcon, { backgroundColor: theme.colors.primarySoft }]}>
                  <Text style={styles.navButtonIconText}>📚</Text>
                </View>
                <Text style={styles.navButtonTitle}>Mes classes</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.navButton,
                  pressed && styles.navButtonPressed,
                ]}
                onPress={() => router.push('/(main)/history')}
              >
                <View style={[styles.navButtonIcon, { backgroundColor: theme.colors.sortieSoft }]}>
                  <Text style={styles.navButtonIconText}>📋</Text>
                </View>
                <Text style={styles.navButtonTitle}>Historique</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
        <FeedbackButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Gradient header
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
  },
  curveContainer: {
    position: 'absolute',
    top: HEADER_HEIGHT - CURVE_HEIGHT,
    left: 0,
    right: 0,
    zIndex: -1,
  },

  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xxl,
  },

  // Header
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  greetingContainer: {},
  greeting: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.8)',
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  profileInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Content
  content: {
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
  },

  // Active Session Card
  activeSessionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.lg,
  },
  activeSessionHeader: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.success,
    marginRight: theme.spacing.xs,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.success,
    letterSpacing: 0.5,
  },
  activeSessionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  activeSessionSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  activeSessionActions: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  resumeButton: {
    flex: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.success,
  },
  gradientButton: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  resumeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  cancelButton: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.errorSoft,
  },
  cancelButtonPressed: {
    opacity: 0.8,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },

  // Primary Action Card
  primaryActionCard: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  primaryActionGradient: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  primaryActionIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionIconText: {
    fontSize: 22,
    color: theme.colors.textInverse,
  },
  primaryActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  primaryActionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  buttonPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },

  // Section
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },

  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  quickActionCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  quickActionIconText: {
    fontSize: 24,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },

  // Navigation buttons
  navButtonsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  navButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  navButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  navButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  navButtonIconText: {
    fontSize: 24,
  },
  navButtonTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },

  // Footer
  footer: {
    paddingHorizontal: theme.spacing.lg,
  },
});
