import { useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useAuthStore, useClassStore, useRoomStore, useHistoryStore, useSyncStore } from '../../../stores';
import { theme } from '../../../constants/theme';
import { type Session, deleteSession } from '../../../services/database';

// Helper to format duration
function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '-';

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const diffMs = end - start;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, '0')}`;
  }
  return `${minutes} min`;
}

// Helper to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Helper to format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses } = useClassStore();
  const { rooms, loadRooms } = useRoomStore();
  const { sessions, isLoading, error, loadSessionHistory, loadSessionsByClass, clearError } = useHistoryStore();
  const { sync, isSyncing } = useSyncStore();

  // Filter state: null = all classes, string = specific class ID
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    if (user?.id) {
      loadSessionHistory(user.id);
      loadClasses(user.id);
      loadRooms(user.id);
    }
  }, [user?.id]);

  // Reload sessions when filter changes
  useEffect(() => {
    if (selectedClassId) {
      loadSessionsByClass(selectedClassId);
    } else if (user?.id) {
      loadSessionHistory(user.id);
    }
  }, [selectedClassId, user?.id]);

  // Create lookup maps for class and room names
  const classMap = useMemo(() => {
    const map = new Map<string, string>();
    classes.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [classes]);

  const roomMap = useMemo(() => {
    const map = new Map<string, string>();
    rooms.forEach((r) => map.set(r.id, r.name));
    return map;
  }, [rooms]);

  const handleRefresh = useCallback(async () => {
    // First sync with server to get latest data
    if (user?.id && !isSyncing) {
      await sync(user.id);
    }
    // Then reload from local database
    if (selectedClassId) {
      loadSessionsByClass(selectedClassId);
    } else if (user?.id) {
      loadSessionHistory(user.id);
    }
  }, [user?.id, selectedClassId, isSyncing, sync]);

  const handleSessionPress = (session: Session) => {
    router.push(`/(main)/history/${session.id}`);
  };

  const handleClassFilter = (classId: string | null) => {
    setSelectedClassId(classId);
  };

  const handleDeleteSession = (session: Session) => {
    const className = classMap.get(session.class_id) || 'Classe inconnue';
    const dateStr = formatDate(session.started_at);

    Alert.alert(
      'Supprimer la seance',
      `Voulez-vous vraiment supprimer la seance du ${dateStr} (${className}) ?\n\nTous les evenements (implications, bavardages, etc.) seront egalement supprimes.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(session.id);
              handleRefresh();
            } catch (error) {
              console.error('Error deleting session:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la seance');
            }
          },
        },
      ]
    );
  };

  const getClassColor = (index: number) => {
    const colors = [
      theme.colors.primarySoft,
      theme.colors.participationSoft,
      theme.colors.sortieSoft,
      theme.colors.remarqueSoft,
      theme.colors.bavardageSoft,
    ];
    return colors[index % colors.length];
  };

  const renderSessionItem = ({ item, index }: { item: Session; index: number }) => {
    const className = classMap.get(item.class_id) || 'Classe inconnue';
    const roomName = roomMap.get(item.room_id) || 'Salle inconnue';
    const duration = formatDuration(item.started_at, item.ended_at);
    const dateStr = formatDate(item.started_at);
    const timeStr = formatTime(item.started_at);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.sessionCard,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => handleSessionPress(item)}
      >
        <View style={[styles.sessionIconContainer, { backgroundColor: getClassColor(index) }]}>
          <Text style={styles.sessionIconText}>📋</Text>
        </View>
        <View style={styles.sessionContent}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionClassName}>{className}</Text>
            <Pressable
              style={styles.deleteButton}
              onPress={() => handleDeleteSession(item)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </Pressable>
          </View>
          <Text style={styles.sessionDate}>{dateStr}</Text>
          <View style={styles.sessionMeta}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Salle</Text>
              <Text style={styles.metaValue}>{roomName}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Heure</Text>
              <Text style={styles.metaValue}>{timeStr}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Duree</Text>
              <Text style={styles.metaValue}>{duration}</Text>
            </View>
          </View>
        </View>
        <View style={styles.chevronContainer}>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Text style={styles.placeholderEmoji}>📋</Text>
      </View>
      <Text style={styles.placeholderTitle}>Aucune seance</Text>
      <Text style={styles.placeholderText}>
        {selectedClassId
          ? 'Aucune seance pour cette classe'
          : 'Vos seances terminees apparaitront ici'}
      </Text>
    </View>
  );

  // Get selected class name for display
  const selectedClassName = selectedClassId ? classMap.get(selectedClassId) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Historique',
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontWeight: '700',
            fontSize: 18,
          },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.backButtonPressed,
              ]}
            >
              <Text style={styles.backButtonText}>← Retour</Text>
            </Pressable>
          ),
        }}
      />

      {/* Class Filter */}
      {classes.length > 0 && (
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <Pressable
              style={[
                styles.filterChip,
                selectedClassId === null && styles.filterChipActive,
              ]}
              onPress={() => handleClassFilter(null)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedClassId === null && styles.filterChipTextActive,
                ]}
              >
                Toutes
              </Text>
            </Pressable>

            {classes.map((c) => (
              <Pressable
                key={c.id}
                style={[
                  styles.filterChip,
                  selectedClassId === c.id && styles.filterChipActive,
                ]}
                onPress={() => handleClassFilter(c.id)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedClassId === c.id && styles.filterChipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}

      {/* Sessions List */}
      {isLoading && sessions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement de l'historique...</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={sessions.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading || isSyncing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={
            sessions.length > 0 ? (
              <View style={styles.listHeaderContainer}>
                <Text style={styles.listHeader}>
                  {sessions.length} seance{sessions.length > 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  backButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
  },
  backButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  filterContainer: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  filterChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.xs,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  list: {
    padding: theme.spacing.lg,
  },
  emptyList: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  listHeaderContainer: {
    marginBottom: theme.spacing.md,
  },
  listHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sessionCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  sessionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  sessionIconText: {
    fontSize: 24,
  },
  sessionContent: {
    flex: 1,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionClassName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },
  deleteButton: {
    padding: theme.spacing.xs,
  },
  deleteButtonText: {
    fontSize: 14,
  },
  sessionDate: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  metaDivider: {
    width: 1,
    height: 20,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.sm,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 20,
    color: theme.colors.textTertiary,
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  placeholderIconContainer: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
