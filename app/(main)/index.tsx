import { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Play } from 'lucide-react-native';
import {
  useAuthStore,
  useClassStore,
  useHistoryStore,
  useRoomStore,
  useSessionStore,
  useSyncStore,
} from '../../stores';
import { theme } from '../../constants/theme';
import { FeedbackButton, SyncButton } from '../../components';

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `il y a ${Math.max(diffMin, 1)} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24 && date.getDate() === now.getDate()) return `il y a ${diffH} h`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDuration(startStr: string, endStr: string): string {
  const min = Math.max(
    1,
    Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 60000)
  );
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest > 0 ? `${h} h ${rest.toString().padStart(2, '0')}` : `${h} h`;
}

export default function HomeScreen() {
  const { user, signOut, isLoading: authLoading } = useAuthStore();
  const { classes, isLoading: classesLoading, loadClasses } = useClassStore();
  const { rooms, loadRooms } = useRoomStore();
  const { sessions, loadSessionHistory } = useHistoryStore();
  const {
    activeSession,
    isSessionActive,
    loadActiveSession,
    cancelCurrentSession,
  } = useSessionStore();
  const { sync, isSyncing, isBackgroundSync } = useSyncStore();

  // La synchro de fond ne doit jamais bloquer le demarrage d'une seance
  const isBlockingSync = isSyncing && !isBackgroundSync;

  const hasAutoSynced = useRef(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
      loadRooms(user.id);
    }
  }, [user?.id, loadClasses, loadRooms]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadActiveSession(user.id);
        loadSessionHistory(user.id);
      }
    }, [user?.id, loadActiveSession, loadSessionHistory])
  );

  // Chrono de la seance active (rafraichi toutes les 30 s)
  useEffect(() => {
    if (!isSessionActive) return;
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isSessionActive]);

  // Synchro auto une fois par lancement, en tache de fond.
  // Se declenche meme si des classes existent deja en local : sans cela, toute
  // creation cote web (classes, eleves, plans) reste invisible sur le telephone.
  useEffect(() => {
    const autoSync = async () => {
      if (user?.id && !classesLoading && !isSyncing && !hasAutoSynced.current) {
        hasAutoSynced.current = true;
        if (__DEV__) console.log('[HomeScreen] Auto-syncing in background...');
        await sync(user.id, { background: true });
        await loadClasses(user.id);
        await loadRooms(user.id);
      }
    };
    autoSync();
  }, [user?.id, classesLoading, isSyncing, sync, loadClasses, loadRooms]);

  const handleLogout = async () => {
    Alert.alert('Déconnexion', 'Voulez-vous vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Déconnexion',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
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

  const classNameById = (id: string) =>
    classes.find((c) => c.id === id)?.name ?? 'Classe';
  const roomNameById = (id: string) =>
    rooms.find((r) => r.id === id)?.name ?? 'Salle';

  const hasActive = isSessionActive && activeSession && !activeSession.ended_at;
  const elapsedMin = hasActive
    ? Math.max(
        0,
        Math.floor((nowTick - new Date(activeSession!.started_at).getTime()) / 60000)
      )
    : 0;
  const startedAtLabel = hasActive
    ? new Date(activeSession!.started_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const lastSession = sessions[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Bonjour,</Text>
            <Text style={styles.userName}>{displayName}</Text>
          </View>
          <View style={styles.headerActions}>
            <SyncButton variant="icon" />
            <FeedbackButton variant="icon" />
            <Pressable
              style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
              onPress={handleLogout}
              disabled={authLoading}
            >
              {authLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.avatarInitial}>{displayName.charAt(0)}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* Corps centre : hero */}
        <View style={styles.heroSection}>
          {hasActive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>
                EN COURS · {elapsedMin} MIN
              </Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.heroHalo, pressed && styles.heroPressed]}
            onPress={() =>
              hasActive
                ? router.push(`/(main)/session/${activeSession!.id}`)
                : router.push('/(main)/session/start')
            }
            disabled={isBlockingSync}
          >
            <View style={styles.heroCircle}>
              {isBlockingSync ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Play
                  size={52}
                  color={theme.colors.textInverse}
                  fill={theme.colors.textInverse}
                  strokeWidth={0}
                  style={styles.playIcon}
                />
              )}
            </View>
          </Pressable>

          <Text style={styles.heroTitle}>
            {hasActive ? 'Reprendre la séance' : 'Démarrer une séance'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isBlockingSync
              ? 'Synchronisation en cours…'
              : hasActive
                ? `${classNameById(activeSession!.class_id)} — ${roomNameById(activeSession!.room_id)} · démarrée à ${startedAtLabel}${activeSession!.topic ? ` / ${activeSession!.topic}` : ''}`
                : 'Suivre la participation en classe en moins de 2 secondes'}
          </Text>

          {hasActive && (
            <Pressable
              style={({ pressed }) => [
                styles.cancelSessionButton,
                pressed && styles.cancelSessionButtonPressed,
              ]}
              onPress={handleCancelSession}
            >
              <Text style={styles.cancelSessionText}>Annuler la séance</Text>
            </Pressable>
          )}
        </View>

        {/* Derniere seance */}
        {!hasActive && lastSession && (
          <Pressable
            style={({ pressed }) => [
              styles.lastSessionCard,
              pressed && styles.lastSessionCardPressed,
            ]}
            onPress={() => router.push('/(main)/history')}
          >
            <Text style={styles.lastSessionText} numberOfLines={1}>
              Dernière séance : {classNameById(lastSession.class_id)} ·{' '}
              {formatRelative(lastSession.started_at)},{' '}
              {formatDuration(lastSession.started_at, lastSession.ended_at!)}
            </Text>
            <ChevronRight size={16} color={theme.colors.textTertiary} strokeWidth={1.8} />
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: theme.spacing.md,
  },
  greeting: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  userName: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 26,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarInitial: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: theme.colors.textInverse,
  },

  // Hero
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: theme.spacing.lg,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.action,
  },
  liveBadgeText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 12,
    color: theme.colors.action,
    letterSpacing: 0.5,
  },
  heroHalo: {
    width: 150 + 28,
    height: 150 + 28,
    borderRadius: (150 + 28) / 2,
    backgroundColor: theme.colors.actionSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  heroPressed: {
    transform: [{ scale: 0.98 }],
  },
  heroCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: theme.colors.action,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.action,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 8,
  },
  playIcon: {
    marginLeft: 6,
  },
  heroTitle: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  heroSubtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  cancelSessionButton: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.lg,
  },
  cancelSessionButtonPressed: {
    opacity: 0.8,
  },
  cancelSessionText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 14,
    color: theme.colors.error,
  },

  // Derniere seance
  lastSessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 13,
    paddingHorizontal: theme.spacing.md,
  },
  lastSessionCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  lastSessionText: {
    flex: 1,
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
  },
});
