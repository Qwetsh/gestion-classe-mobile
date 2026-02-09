import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore, useClassStore, useSessionStore, useSyncStore } from '../../stores';
import { theme } from '../../constants/theme';
import { SyncButton } from '../../components';

export default function HomeScreen() {
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

  // Load classes and check for active session on mount
  useEffect(() => {
    const initializeData = async () => {
      if (user?.id) {
        await loadClasses(user.id);
        loadActiveSession(user.id);
      }
    };
    initializeData();
  }, [user?.id]);

  // Auto-sync when classes list is empty (fresh install)
  useEffect(() => {
    const autoSync = async () => {
      if (user?.id && !classesLoading && classes.length === 0 && !isSyncing) {
        console.log('[HomeScreen] No classes found locally, auto-syncing...');
        await sync(user.id);
        await loadClasses(user.id);
      }
    };
    autoSync();
  }, [user?.id, classesLoading, classes.length, isSyncing]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const handleCancelSession = () => {
    Alert.alert(
      'Annuler la seance',
      'Voulez-vous supprimer cette seance en cours ? Tous les evenements seront perdus.',
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour 👋</Text>
          {user && <Text style={styles.email}>{user.email}</Text>}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.profileButton,
            pressed && styles.profileButtonPressed,
          ]}
          onPress={handleLogout}
          disabled={authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color={theme.colors.primary} size="small" />
          ) : (
            <Text style={styles.profileButtonText}>👤</Text>
          )}
        </Pressable>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Active Session Card */}
        {isSessionActive && activeSession && (
          <View style={styles.activeSessionCard}>
            <View style={styles.activeSessionHeader}>
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>EN COURS</Text>
              </View>
            </View>
            <Text style={styles.activeSessionTitle}>Seance active</Text>
            <Text style={styles.activeSessionSubtitle}>
              Reprenez la ou vous en etiez
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

        {/* Primary Action - Start Session */}
        {!isSessionActive && (
          <Pressable
            style={({ pressed }) => [
              styles.primaryActionCard,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => router.push('/(main)/session/start')}
          >
            <LinearGradient
              colors={theme.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.primaryActionGradient}
            >
              <View style={styles.primaryActionIcon}>
                <Text style={styles.primaryActionIconText}>▶</Text>
              </View>
              <Text style={styles.primaryActionTitle}>Demarrer une seance</Text>
              <Text style={styles.primaryActionSubtitle}>
                Commencez a suivre la participation
              </Text>
            </LinearGradient>
          </Pressable>
        )}

        {/* Quick Actions Grid */}
        <View style={styles.quickActionsGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.quickActionCard,
              pressed && styles.quickActionCardPressed,
            ]}
            onPress={() => router.push('/(main)/history')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.remarqueSoft }]}>
              <Text style={styles.quickActionIconText}>📋</Text>
            </View>
            <Text style={styles.quickActionTitle}>Historique</Text>
            <Text style={styles.quickActionSubtitle}>Seances passees</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.quickActionCard,
              pressed && styles.quickActionCardPressed,
            ]}
            onPress={() => router.push('/(main)/classes')}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.sortieSoft }]}>
              <Text style={styles.quickActionIconText}>📚</Text>
            </View>
            <Text style={styles.quickActionTitle}>Mes classes</Text>
            <Text style={styles.quickActionSubtitle}>
              {classesLoading ? 'Chargement...' : `${classes.length} classe${classes.length > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <SyncButton />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  email: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  profileButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  profileButtonText: {
    fontSize: 20,
  },

  // Main Content
  mainContent: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
  },

  // Active Session Card
  activeSessionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
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
    borderRadius: theme.radius.xxl,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.primary,
  },
  primaryActionGradient: {
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
  },
  primaryActionIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  primaryActionIconText: {
    fontSize: 28,
    color: theme.colors.textInverse,
  },
  primaryActionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.textInverse,
    marginBottom: theme.spacing.xs,
  },
  primaryActionSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },

  buttonPressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },

  // Quick Actions Grid
  quickActionsGrid: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
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
    marginBottom: theme.spacing.md,
  },
  quickActionIconText: {
    fontSize: 24,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },

  // Footer
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
});
