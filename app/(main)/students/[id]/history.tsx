import { useEffect, useMemo, useState, useCallback } from 'react';
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
import { useHistoryStore, useStudentStore, useAuthStore, useClassStore, useStampStore } from '../../../../stores';
import { theme } from '../../../../constants/theme';
import {
  type Event,
  type EventType,
  getStudentDeleteStats,
  deleteStudentCompletely,
  type CompletedCardSummary,
} from '../../../../services/database';
import { PhotoPicker } from '../../../../components';
import { exportStudentHistoryPdf } from '../../../../services/pdfExport';

// Event type display config
const EVENT_CONFIG: Record<EventType, { label: string; color: string; emoji: string }> = {
  participation: { label: 'Implication', color: theme.colors.participation, emoji: '+' },
  bavardage: { label: 'Bavardage', color: theme.colors.bavardage, emoji: '-' },
  absence: { label: 'Absence', color: theme.colors.absence, emoji: 'A' },
  remarque: { label: 'Remarque', color: theme.colors.remarque, emoji: '!' },
  sortie: { label: 'Sortie', color: theme.colors.sortie, emoji: 'S' },
  retour: { label: 'Retour', color: '#10B981', emoji: '↩' },
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
  const { classes } = useClassStore();
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
  const [isExporting, setIsExporting] = useState(false);
  const [completedCards, setCompletedCards] = useState<CompletedCardSummary[]>([]);

  const { activeCards, loadActiveCard, getCompletedCardsForStudent } = useStampStore();

  // Find the student across all classes
  const student = useMemo(() => {
    for (const students of Object.values(studentsByClass)) {
      const found = students.find((s) => s.id === id);
      if (found) return found;
    }
    return null;
  }, [studentsByClass, id]);

  // Get class name
  const className = useMemo(() => {
    if (!student?.classId) return '';
    const cls = classes.find((c) => c.id === student.classId);
    return cls?.name || '';
  }, [student, classes]);

  // Handle PDF export
  const handleExportPdf = useCallback(async () => {
    if (!student || isExporting) return;

    setIsExporting(true);
    try {
      await exportStudentHistoryPdf({
        studentName: student.fullName || student.pseudo,
        pseudo: student.pseudo,
        className,
        events: studentEvents,
      });
    } catch (err) {
      console.error('PDF export error:', err);
      Alert.alert('Erreur', 'Impossible d\'exporter le PDF');
    } finally {
      setIsExporting(false);
    }
  }, [student, studentEvents, className, isExporting]);

  // Load student history on mount
  useEffect(() => {
    if (id) {
      loadStudentHistory(id);
    }
  }, [id]);

  // Load stamp data
  const activeCard = id ? activeCards[id] : undefined;
  useEffect(() => {
    if (id && user) {
      loadActiveCard(user.id, id);
      getCompletedCardsForStudent(id).then(setCompletedCards);
    }
  }, [id, user]);

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
      retour: 0,
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
        <Pressable
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.exportButtonPressed,
            isExporting && styles.exportButtonDisabled,
          ]}
          onPress={handleExportPdf}
          disabled={isExporting || studentEvents.length === 0}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Text style={styles.exportButtonText}>PDF</Text>
          )}
        </Pressable>
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

          {/* Stamp Card Section */}
          <View style={styles.stampSection}>
            <Text style={styles.sectionTitle}>Carte a tampons</Text>
            {activeCard ? (
              <View style={styles.stampCardContainer}>
                <View style={styles.stampCardHeader}>
                  <Text style={styles.stampCardTitle}>
                    Carte n°{activeCard.card_number}
                  </Text>
                  <View style={[
                    styles.stampCountBadge,
                    activeCard.stamp_count >= 10 && styles.stampCountComplete,
                  ]}>
                    <Text style={[
                      styles.stampCountText,
                      activeCard.stamp_count >= 10 && styles.stampCountTextComplete,
                    ]}>
                      {activeCard.stamp_count}/10
                    </Text>
                  </View>
                </View>
                {/* Progress bar */}
                <View style={styles.stampProgressBg}>
                  <View style={[
                    styles.stampProgressFill,
                    {
                      width: `${Math.min(100, (activeCard.stamp_count / 10) * 100)}%` as any,
                      backgroundColor: activeCard.stamp_count >= 10 ? '#22c55e' : '#f59e0b',
                    },
                  ]} />
                </View>
                {/* Stamp grid */}
                <View style={styles.stampGrid}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const stamp = activeCard.stamps.find(s => s.slot_number === i + 1);
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stampSlot,
                          stamp ? {
                            backgroundColor: `${stamp.category_color || '#f59e0b'}20`,
                            borderColor: `${stamp.category_color || '#f59e0b'}60`,
                            borderStyle: 'solid' as const,
                          } : {},
                        ]}
                      >
                        <Text style={styles.stampSlotText}>
                          {stamp ? (stamp.category_icon || '⭐') : '🔒'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.stampEmpty}>
                <Text style={styles.stampEmptyIcon}>⭐</Text>
                <Text style={styles.stampEmptyText}>Pas encore de carte</Text>
              </View>
            )}

            {/* Completed cards */}
            {completedCards.length > 0 && (
              <View style={styles.completedCardsContainer}>
                <Text style={styles.completedCardsTitle}>
                  Cartes terminees ({completedCards.length})
                </Text>
                {completedCards.map(card => (
                  <View key={card.id} style={styles.completedCardRow}>
                    <Text style={styles.completedCardLabel}>
                      Carte n°{card.card_number}
                    </Text>
                    <Text style={styles.completedCardBonus}>
                      {card.bonus_label
                        ? `🎁 ${card.bonus_label} ${card.bonus_used ? '✓' : '⏳'}`
                        : 'Pas de bonus'}
                    </Text>
                  </View>
                ))}
              </View>
            )}
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
  exportButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.md,
  },
  exportButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
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

  // Stamp card section
  stampSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  stampCardContainer: {},
  stampCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  stampCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  stampCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
    backgroundColor: '#3b82f620',
  },
  stampCountComplete: {
    backgroundColor: '#22c55e20',
  },
  stampCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60a5fa',
  },
  stampCountTextComplete: {
    color: '#22c55e',
  },
  stampProgressBg: {
    height: 6,
    backgroundColor: theme.colors.background,
    borderRadius: 3,
    overflow: 'hidden' as const,
    marginBottom: theme.spacing.md,
  },
  stampProgressFill: {
    height: '100%' as any,
    borderRadius: 3,
  },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  stampSlot: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: 'dashed' as const,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stampSlotText: {
    fontSize: 20,
  },
  stampEmpty: {
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  stampEmptyIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.xs,
  },
  stampEmptyText: {
    color: theme.colors.textTertiary,
    fontSize: 13,
  },
  completedCardsContainer: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  completedCardsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  completedCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  completedCardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.text,
  },
  completedCardBonus: {
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
