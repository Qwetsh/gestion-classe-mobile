import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useHistoryStore, useStudentStore, useAuthStore } from '../../../../stores';
import { theme } from '../../../../constants/theme';
import {
  type Event,
  type EventType,
  getStudentDeleteStats,
  deleteStudentCompletely,
} from '../../../../services/database';
import { PhotoPicker } from '../../../../components';

// Event type display config
const EVENT_CONFIG: Record<EventType, { label: string; color: string; emoji: string }> = {
  participation: { label: 'Implication', color: theme.colors.participation, emoji: '+' },
  bavardage: { label: 'Bavardage', color: theme.colors.bavardage, emoji: '-' },
  absence: { label: 'Absence', color: theme.colors.absence, emoji: 'A' },
  remarque: { label: 'Remarque', color: theme.colors.remarque, emoji: '!' },
  sortie: { label: 'Sortie', color: theme.colors.sortie, emoji: 'S' },
  note_groupe: { label: 'Note groupe', color: theme.colors.participation, emoji: 'G' },
};

// Helper to format date
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

export default function StudentHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const {
    studentEvents,
    isLoading,
    error,
    loadStudentHistory,
    clearError,
  } = useHistoryStore();

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteStats, setDeleteStats] = useState<{ eventsCount: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Find the student across all classes
  const student = useMemo(() => {
    for (const students of Object.values(studentsByClass)) {
      const found = students.find((s) => s.id === id);
      if (found) return found;
    }
    return null;
  }, [studentsByClass, id]);

  // Load student history on mount
  useEffect(() => {
    if (id) {
      loadStudentHistory(id);
    }
  }, [id]);

  // Handle delete button press
  const handleDeletePress = async () => {
    if (!id) return;
    const stats = await getStudentDeleteStats(id);
    setDeleteStats(stats);
    setDeleteModalVisible(true);
  };

  // Handle confirm delete
  const handleConfirmDelete = async () => {
    if (!id || !student) return;

    setIsDeleting(true);
    const result = await deleteStudentCompletely(id);
    setIsDeleting(false);
    setDeleteModalVisible(false);

    if (result.success) {
      // Reload students for the class
      if (student.classId) {
        loadStudentsForClass(student.classId);
      }
      // Navigate back
      router.back();
    } else {
      Alert.alert('Erreur', result.error || 'La suppression a echoue');
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    const total: Record<EventType, number> = {
      participation: 0,
      bavardage: 0,
      absence: 0,
      remarque: 0,
      sortie: 0,
      note_groupe: 0,
    };

    studentEvents.forEach((event) => {
      total[event.type]++;
    });

    return total;
  }, [studentEvents]);

  const renderEventItem = ({ item }: { item: Event }) => {
    const config = EVENT_CONFIG[item.type];
    const dateStr = formatDate(item.timestamp);
    const timeStr = formatTime(item.timestamp);

    return (
      <View style={styles.eventItem}>
        <View style={[styles.eventBadge, { backgroundColor: config.color }]}>
          <Text style={styles.eventBadgeText}>{config.emoji}</Text>
        </View>
        <View style={styles.eventInfo}>
          <Text style={styles.eventType}>
            {config.label}
            {item.subtype ? ` - ${item.subtype}` : ''}
          </Text>
          {item.note && <Text style={styles.eventNote}>{item.note}</Text>}
        </View>
        <View style={styles.eventDateTime}>
          <Text style={styles.eventDate}>{dateStr}</Text>
          <Text style={styles.eventTime}>{timeStr}</Text>
        </View>
      </View>
    );
  };

  const studentName = student?.fullName || student?.pseudo || 'Eleve';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {studentName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.participation} />
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Student Info */}
          {student && user && (
            <View style={styles.studentCard}>
              <PhotoPicker
                studentId={student.id}
                userId={user.id}
                size={56}
                initial={student.firstName?.charAt(0) || student.pseudo.charAt(0)}
              />
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{student.fullName || student.pseudo}</Text>
                <Text style={styles.studentPseudo}>{student.pseudo}</Text>
              </View>
            </View>
          )}

          {/* Totals Summary */}
          <View style={styles.totalsCard}>
            <Text style={styles.sectionTitle}>Resume</Text>
            <View style={styles.totalsRow}>
              {(Object.entries(totals) as [EventType, number][]).map(([type, count]) => {
                const config = EVENT_CONFIG[type];
                return (
                  <View key={type} style={styles.totalItem}>
                    <View style={[styles.totalBadge, { backgroundColor: config.color }]}>
                      <Text style={styles.totalBadgeText}>{count}</Text>
                    </View>
                    <Text style={styles.totalLabel}>{config.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Events List */}
          <View style={styles.eventsSection}>
            <Text style={styles.sectionTitle}>
              Historique ({studentEvents.length})
            </Text>

            {studentEvents.length === 0 ? (
              <View style={styles.emptyEvents}>
                <Text style={styles.emptyEventsEmoji}>📋</Text>
                <Text style={styles.emptyEventsText}>
                  Aucun evenement enregistre
                </Text>
              </View>
            ) : (
              <FlatList
                data={studentEvents}
                renderItem={renderEventItem}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
              />
            )}
          </View>

          {/* Delete Button (RGPD) */}
          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Zone de danger</Text>
            <Pressable
              style={styles.deleteButton}
              onPress={handleDeletePress}
            >
              <Text style={styles.deleteButtonText}>Supprimer l'eleve</Text>
            </Pressable>
            <Text style={styles.dangerHint}>
              Cette action supprimera definitivement toutes les donnees de cet eleve (RGPD).
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => !isDeleting && setDeleteModalVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalIcon}>⚠️</Text>
            <Text style={styles.modalTitle}>Supprimer l'eleve ?</Text>
            <Text style={styles.modalText}>
              Cette action est irreversible. Toutes les donnees seront definitivement supprimees :
            </Text>
            <View style={styles.modalStats}>
              <Text style={styles.modalStatItem}>
                • {deleteStats?.eventsCount || 0} evenement{(deleteStats?.eventsCount || 0) > 1 ? 's' : ''}
              </Text>
              <Text style={styles.modalStatItem}>
                • Correspondance nom/prenom
              </Text>
              <Text style={styles.modalStatItem}>
                • Donnees locales et serveur
              </Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setDeleteModalVisible(false)}
                disabled={isDeleting}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.modalDeleteButton, isDeleting && styles.buttonDisabled]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.modalDeleteText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: theme.colors.text,
    fontWeight: '300',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  errorBanner: {
    backgroundColor: theme.colors.error,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.md,
  },
  errorText: {
    color: theme.colors.textInverse,
    fontSize: 14,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
    gap: theme.spacing.md,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  studentPseudo: {
    fontSize: 14,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  totalsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  totalItem: {
    alignItems: 'center',
  },
  totalBadge: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  totalBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 14,
    fontWeight: '600',
  },
  totalLabel: {
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
  eventsSection: {
    marginBottom: theme.spacing.xl,
  },
  emptyEvents: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyEventsEmoji: {
    fontSize: 32,
    marginBottom: theme.spacing.sm,
  },
  emptyEventsText: {
    color: theme.colors.textTertiary,
    fontSize: 14,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  eventBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  eventBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },
  eventInfo: {
    flex: 1,
  },
  eventType: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  eventNote: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  eventDateTime: {
    alignItems: 'flex-end',
  },
  eventDate: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  eventTime: {
    fontSize: 11,
    color: theme.colors.textTertiary,
  },

  // Danger zone
  dangerZone: {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
  },
  deleteButton: {
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  dangerHint: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    ...theme.shadows.lg,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  modalStats: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  modalStatItem: {
    fontSize: 13,
    color: theme.colors.text,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalCancelButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalCancelText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  modalDeleteButton: {
    flex: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.error,
  },
  modalDeleteText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
