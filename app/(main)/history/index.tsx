import { useEffect, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  SectionList,
  RefreshControl,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronRight, Clock, Search, X } from 'lucide-react-native';
import { useAuthStore, useClassStore, useRoomStore, useHistoryStore, useSyncStore } from '../../../stores';
import { theme } from '../../../constants/theme';
import { type Session, deleteSession, getGroupSessionByLinkedSessionId } from '../../../services/database';

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

// Helper to get date key for grouping (YYYY-MM-DD)
function getDateKey(dateString: string): string {
  const date = new Date(dateString);
  return date.toISOString().split('T')[0];
}

// Helper to format relative date for section headers
function formatRelativeDate(dateKey: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const date = new Date(dateKey + 'T00:00:00');

  if (date.getTime() === today.getTime()) {
    return "Aujourd'hui";
  }
  if (date.getTime() === yesterday.getTime()) {
    return 'Hier';
  }

  // Check if same week
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  if (date > weekAgo) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  // Full date for older
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface SessionSection {
  title: string;
  dateKey: string;
  data: Session[];
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Load data on mount
  useEffect(() => {
    if (user?.id) {
      loadSessionHistory(user.id);
      loadClasses(user.id);
      loadRooms(user.id);
    }
  }, [user?.id, loadSessionHistory, loadClasses, loadRooms]);

  // Reload sessions when filter changes
  useEffect(() => {
    if (selectedClassId) {
      loadSessionsByClass(selectedClassId);
    } else if (user?.id) {
      loadSessionHistory(user.id);
    }
  }, [selectedClassId, user?.id, loadSessionsByClass, loadSessionHistory]);

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

  // Filter sessions by search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;

    const query = searchQuery.toLowerCase().trim();
    return sessions.filter((session) => {
      const className = classMap.get(session.class_id)?.toLowerCase() || '';
      const roomName = roomMap.get(session.room_id)?.toLowerCase() || '';
      const topic = session.topic?.toLowerCase() || '';

      return (
        className.includes(query) ||
        roomName.includes(query) ||
        topic.includes(query)
      );
    });
  }, [sessions, searchQuery, classMap, roomMap]);

  // Group sessions by day
  const sessionSections = useMemo((): SessionSection[] => {
    const grouped = new Map<string, Session[]>();

    for (const session of filteredSessions) {
      const dateKey = getDateKey(session.started_at);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(session);
    }

    // Sort by date descending, convert to sections
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));

    return sortedKeys.map((dateKey) => ({
      title: formatRelativeDate(dateKey),
      dateKey,
      data: grouped.get(dateKey)!,
    }));
  }, [filteredSessions]);

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

  // Suppression via appui long sur la carte (plus de corbeille inline)
  const handleDeleteSession = async (session: Session) => {
    if (isDeleting) return;

    const className = classMap.get(session.class_id) || 'Classe inconnue';
    const dateStr = formatDate(session.started_at);

    // Check if there's a linked group session
    const linkedGS = await getGroupSessionByLinkedSessionId(session.id);
    const groupWarning = linkedGS
      ? `\n\nLa séance de groupe « ${linkedGS.name} » liée sera aussi supprimée (groupes, notes, critères).`
      : '';

    Alert.alert(
      'Supprimer la séance',
      `Voulez-vous vraiment supprimer la séance du ${dateStr} (${className}) ?\n\nTous les événements (participations, malus, etc.) seront également supprimés.${groupWarning}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteSession(session.id);
              handleRefresh();
            } catch (error) {
              if (__DEV__) console.error('Error deleting session:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la séance');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const renderSessionItem = ({ item }: { item: Session }) => {
    const className = classMap.get(item.class_id) || 'Classe inconnue';
    const roomName = roomMap.get(item.room_id) || 'Salle inconnue';
    const duration = formatDuration(item.started_at, item.ended_at);
    const timeStr = formatTime(item.started_at);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.sessionCard,
          pressed && styles.sessionCardPressed,
        ]}
        onPress={() => handleSessionPress(item)}
        onLongPress={() => handleDeleteSession(item)}
        delayLongPress={500}
      >
        <View style={styles.sessionHeader}>
          <Text style={styles.sessionClassName}>{className}</Text>
          <ChevronRight size={17} color={theme.colors.textTertiary} strokeWidth={1.8} />
        </View>
        {item.topic ? (
          <Text style={styles.sessionTopic} numberOfLines={1}>{item.topic}</Text>
        ) : null}
        <View style={styles.sessionMeta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Heure</Text>
            <Text style={styles.metaValue}>{timeStr}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Salle</Text>
            <Text style={styles.metaValue}>{roomName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Durée</Text>
            <Text style={styles.metaValue}>{duration}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Clock size={32} color={theme.colors.primary} strokeWidth={1.7} />
      </View>
      <Text style={styles.placeholderTitle}>
        {searchQuery ? 'Aucun résultat' : 'Aucune séance'}
      </Text>
      <Text style={styles.placeholderText}>
        {searchQuery
          ? `Aucune séance ne correspond à "${searchQuery}"`
          : selectedClassId
            ? 'Aucune séance pour cette classe'
            : 'Vos séances terminées apparaîtront ici'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Historique</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={17} color={theme.colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher (classe, salle, thème)…"
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton} hitSlop={8}>
              <X size={16} color={theme.colors.textTertiary} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

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
        <SectionList
          sections={sessionSections}
          renderItem={renderSessionItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={sessionSections.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading || isSyncing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
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
  screenHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  screenTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 26,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },
  searchContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  filterContainer: {
    paddingBottom: theme.spacing.sm,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  filterChipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  filterChipTextActive: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.textInverse,
  },
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: 12,
  },
  errorText: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  list: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  emptyList: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  sectionHeader: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  sessionCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm + 2,
  },
  sessionCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionClassName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 16,
    color: theme.colors.text,
  },
  sessionTopic: {
    fontFamily: theme.fonts.body,
    fontSize: 13.5,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm + 2,
    paddingTop: theme.spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 10.5,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metaValue: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.text,
    marginTop: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  placeholderIconContainer: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  placeholderText: {
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
