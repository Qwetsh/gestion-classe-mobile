import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useClassStore, useRoomStore, useHistoryStore, useStudentStore } from '../../../stores';
import { theme } from '../../../constants/theme';
import { type Event, type EventType } from '../../../services/database';
import { exportSessionPdf } from '../../../services/pdfExport';

// Event type display config
const EVENT_CONFIG: Record<EventType, { label: string; color: string; softColor: string; emoji: string }> = {
  participation: { label: 'Implication', color: theme.colors.participation, softColor: theme.colors.participationSoft, emoji: '+' },
  bavardage: { label: 'Bavardage', color: theme.colors.bavardage, softColor: theme.colors.bavardageSoft, emoji: '-' },
  absence: { label: 'Absence', color: theme.colors.absence, softColor: theme.colors.absenceSoft, emoji: 'A' },
  remarque: { label: 'Remarque', color: theme.colors.remarque, softColor: theme.colors.remarqueSoft, emoji: '!' },
  sortie: { label: 'Sortie', color: theme.colors.sortie, softColor: theme.colors.sortieSoft, emoji: 'S' },
  retour: { label: 'Retour', color: '#10B981', softColor: '#ECFDF5', emoji: '↩' },
};

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

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { classes, loadClassById } = useClassStore();
  const { rooms, loadRoomById } = useRoomStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const {
    selectedSession,
    sessionEvents,
    isLoading,
    error,
    loadSessionDetail,
    clearError,
  } = useHistoryStore();

  const [isExporting, setIsExporting] = useState(false);

  // Load session detail on mount
  useEffect(() => {
    if (id) {
      loadSessionDetail(id);
    }
  }, [id]);

  // Load class and room info when session loads
  useEffect(() => {
    if (selectedSession) {
      loadClassById(selectedSession.class_id);
      loadRoomById(selectedSession.room_id);
      loadStudentsForClass(selectedSession.class_id);
    }
  }, [selectedSession?.id]);

  // Create lookup maps
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

  // Get students for the current class
  const students = selectedSession ? (studentsByClass[selectedSession.class_id] || []) : [];

  const studentMap = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((s) => map.set(s.id, s.fullName || s.pseudo));
    return map;
  }, [students]);

  // Handle PDF export
  const handleExportPdf = useCallback(async () => {
    if (!selectedSession || isExporting) return;

    setIsExporting(true);
    try {
      const className = classMap.get(selectedSession.class_id) || 'Classe';
      const roomName = roomMap.get(selectedSession.room_id) || 'Salle';

      await exportSessionPdf({
        className,
        roomName,
        startedAt: selectedSession.started_at,
        endedAt: selectedSession.ended_at,
        topic: selectedSession.topic,
        notes: selectedSession.notes,
        events: sessionEvents,
        studentNames: Object.fromEntries(studentMap),
      });
    } catch (err) {
      console.error('[SessionDetail] Export error:', err);
      Alert.alert('Erreur', 'Impossible d\'exporter le PDF');
    } finally {
      setIsExporting(false);
    }
  }, [selectedSession, sessionEvents, classMap, roomMap, studentMap, isExporting]);

  // Calculate totals
  const totals = useMemo(() => {
    const total: Record<EventType, number> = {
      participation: 0,
      bavardage: 0,
      absence: 0,
      remarque: 0,
      sortie: 0,
      retour: 0,
    };

    sessionEvents.forEach((event) => {
      total[event.type]++;
    });

    return total;
  }, [sessionEvents]);

  const renderEventItem = ({ item }: { item: Event }) => {
    const config = EVENT_CONFIG[item.type];
    const studentName = studentMap.get(item.student_id) || 'Eleve inconnu';
    const time = formatTime(item.timestamp);

    return (
      <View style={styles.eventItem}>
        <View style={[styles.eventBadge, { backgroundColor: config.softColor }]}>
          <Text style={[styles.eventBadgeText, { color: config.color }]}>{config.emoji}</Text>
        </View>
        <View style={styles.eventInfo}>
          <Text style={styles.eventStudent}>{studentName}</Text>
          <Text style={styles.eventType}>
            {config.label}
            {item.subtype ? ` - ${item.subtype}` : ''}
          </Text>
          {item.note && <Text style={styles.eventNote}>{item.note}</Text>}
        </View>
        <Text style={styles.eventTime}>{time}</Text>
      </View>
    );
  };

  if (isLoading && !selectedSession) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  if (!selectedSession) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top']}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: 'Detail seance',
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.text,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.errorCard}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorText}>Seance introuvable</Text>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const className = classMap.get(selectedSession.class_id) || 'Classe inconnue';
  const roomName = roomMap.get(selectedSession.room_id) || 'Salle inconnue';
  const duration = formatDuration(selectedSession.started_at, selectedSession.ended_at);
  const dateStr = formatDate(selectedSession.started_at);
  const timeStr = formatTime(selectedSession.started_at);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Detail seance',
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
          headerRight: () => (
            <Pressable
              onPress={handleExportPdf}
              disabled={isExporting}
              style={({ pressed }) => [
                styles.exportButton,
                pressed && styles.exportButtonPressed,
                isExporting && styles.exportButtonDisabled,
              ]}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.exportButtonText}>📄 PDF</Text>
              )}
            </Pressable>
          ),
        }}
      />

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </Pressable>
      )}

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Session Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoCardHeader}>
            <View style={[styles.infoCardIconContainer, { backgroundColor: theme.colors.primarySoft }]}>
              <Text style={styles.infoCardIcon}>📋</Text>
            </View>
            <View style={styles.infoCardTitleContainer}>
              <Text style={styles.infoCardTitle}>{className}</Text>
              <Text style={styles.infoCardDate}>{dateStr}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Salle</Text>
              <Text style={styles.infoGridValue}>{roomName}</Text>
            </View>
            <View style={styles.infoGridDivider} />
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Heure</Text>
              <Text style={styles.infoGridValue}>{timeStr}</Text>
            </View>
            <View style={styles.infoGridDivider} />
            <View style={styles.infoGridItem}>
              <Text style={styles.infoGridLabel}>Duree</Text>
              <Text style={styles.infoGridValue}>{duration}</Text>
            </View>
          </View>
        </View>

        {/* Totals Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.participationSoft }]}>
              <Text style={styles.sectionIcon}>📊</Text>
            </View>
            <Text style={styles.sectionTitle}>Resume</Text>
          </View>
          <View style={styles.totalsCard}>
            <View style={styles.totalsGrid}>
              {(Object.entries(totals) as [EventType, number][]).map(([type, count]) => {
                const config = EVENT_CONFIG[type];
                return (
                  <View key={type} style={styles.totalItem}>
                    <View style={[styles.totalBadge, { backgroundColor: config.softColor }]}>
                      <Text style={[styles.totalBadgeText, { color: config.color }]}>{count}</Text>
                    </View>
                    <Text style={styles.totalLabel}>{config.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Events List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.remarqueSoft }]}>
              <Text style={styles.sectionIcon}>📝</Text>
            </View>
            <Text style={styles.sectionTitle}>
              Evenements ({sessionEvents.length})
            </Text>
          </View>

          {sessionEvents.length === 0 ? (
            <View style={styles.emptyEventsCard}>
              <Text style={styles.emptyEventsEmoji}>🎯</Text>
              <Text style={styles.emptyEventsText}>
                Aucun evenement enregistre
              </Text>
            </View>
          ) : (
            <View style={styles.eventsCard}>
              <FlatList
                data={sessionEvents}
                renderItem={renderEventItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={styles.eventSeparator} />}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  errorCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  backLink: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.lg,
  },
  backLinkText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
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
  exportButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
  },
  exportButtonPressed: {
    backgroundColor: theme.colors.primary + '30',
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  errorBannerText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
  },

  // Info Card
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  infoCardIconContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  infoCardIcon: {
    fontSize: 24,
  },
  infoCardTitleContainer: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
  },
  infoCardDate: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  infoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  infoGridItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoGridLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoGridValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
  infoGridDivider: {
    width: 1,
    height: 32,
    backgroundColor: theme.colors.border,
  },

  // Sections
  section: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
  },

  // Totals Card
  totalsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  totalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: theme.spacing.md,
  },
  totalItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  totalBadge: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  totalBadgeText: {
    fontSize: 18,
    fontWeight: '700',
  },
  totalLabel: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    fontWeight: '500',
  },

  // Events Card
  eventsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  emptyEventsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyEventsEmoji: {
    fontSize: 40,
    marginBottom: theme.spacing.sm,
  },
  emptyEventsText: {
    color: theme.colors.textTertiary,
    fontSize: 15,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  eventSeparator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 48,
  },
  eventBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  eventBadgeText: {
    fontSize: 16,
    fontWeight: '700',
  },
  eventInfo: {
    flex: 1,
  },
  eventStudent: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  eventType: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  eventNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 3,
  },
  eventTime: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textTertiary,
  },
});
