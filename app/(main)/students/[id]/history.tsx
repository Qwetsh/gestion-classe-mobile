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
import QRCode from 'react-native-qrcode-svg';
import { useHistoryStore, useStudentStore, useAuthStore, useClassStore, useStampStore } from '../../../../stores';
import { theme } from '../../../../constants/theme';
import {
  type Event,
  type EventType,
  getStudentDeleteStats,
  deleteStudentCompletely,
  deleteStamp,
  type CompletedCardSummary,
} from '../../../../services/database';
import { supabase, isSupabaseConfigured } from '../../../../services/supabase';
import { PhotoPicker } from '../../../../components';
import { exportStudentHistoryPdf } from '../../../../services/pdfExport';

// Event type display config
const EVENT_CONFIG: Record<EventType, { label: string; color: string; emoji: string }> = {
  participation: { label: 'Implication', color: theme.colors.participation, emoji: '+' },
  bavardage: { label: 'Malus', color: theme.colors.bavardage, emoji: '-' },
  absence: { label: 'Absence', color: theme.colors.absence, emoji: 'A' },
  remarque: { label: 'Remarque', color: theme.colors.remarque, emoji: '!' },
  sortie: { label: 'Sortie', color: theme.colors.sortie, emoji: 'S' },
  retour: { label: 'Retour', color: '#10B981', emoji: '↩' },
};

// Card tier system (matches web rewardsQueries.ts)
interface CardTierMobile {
  name: string;
  emoji: string;
  primaryColor: string;
  borderColor: string;
  progressColor: string;
  progressCompleteColor: string;
  textColor: string;
  badgeBg: string;
  badgeText: string;
  slotBorder: string;
  slotBg: string;
  emptyIcon: string;
}

function getCardTier(cardNumber: number): CardTierMobile {
  if (cardNumber >= 4) return CARD_TIERS.gold;
  if (cardNumber === 3) return CARD_TIERS.silver;
  if (cardNumber === 2) return CARD_TIERS.bronze;
  return CARD_TIERS.wood;
}

const CARD_TIERS: Record<string, CardTierMobile> = {
  wood: {
    name: 'Bois', emoji: '🪵',
    primaryColor: '#8B7355', borderColor: '#8B7355',
    progressColor: '#A0826D', progressCompleteColor: '#6B8E23',
    textColor: '#5C3D2E', badgeBg: '#8B735520', badgeText: '#6B4F36',
    slotBorder: '#8B735540', slotBg: '#8B735508', emptyIcon: '🌰',
  },
  bronze: {
    name: 'Bronze', emoji: '🥉',
    primaryColor: '#CD7F32', borderColor: '#CD7F32',
    progressColor: '#DDA15E', progressCompleteColor: '#CD7F32',
    textColor: '#8B4513', badgeBg: '#CD7F3220', badgeText: '#A0522D',
    slotBorder: '#CD7F3240', slotBg: '#CD7F3208', emptyIcon: '🔸',
  },
  silver: {
    name: 'Argent', emoji: '🥈',
    primaryColor: '#C0C0C0', borderColor: '#A9A9A9',
    progressColor: '#D3D3D3', progressCompleteColor: '#A9A9A9',
    textColor: '#4A4A4A', badgeBg: '#C0C0C020', badgeText: '#696969',
    slotBorder: '#C0C0C050', slotBg: '#C0C0C00A', emptyIcon: '◇',
  },
  gold: {
    name: 'Or', emoji: '🥇',
    primaryColor: '#FFD700', borderColor: '#DAA520',
    progressColor: '#FFD700', progressCompleteColor: '#DAA520',
    textColor: '#8B6914', badgeBg: '#FFD70025', badgeText: '#B8860B',
    slotBorder: '#FFD70050', slotBg: '#FFD70010', emptyIcon: '✦',
  },
};

const WEBAPP_BASE_URL = 'https://qwetsh.github.io/gestion-classe/eleve';

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
  const [studentCode, setStudentCode] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const { activeCards, loadActiveCard, getCompletedCardsForStudent, doAwardStamp, categories, loadCategories } = useStampStore();

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
      loadCategories(user.id);
    }
  }, [id, user]);

  // Fetch student_code from Supabase
  useEffect(() => {
    if (id && isSupabaseConfigured && supabase) {
      supabase
        .from('students')
        .select('student_code')
        .eq('id', id)
        .single()
        .then(({ data }) => {
          if (data?.student_code) setStudentCode(data.student_code);
        });
    }
  }, [id]);

  // Handle stamp slot tap
  const handleStampSlotPress = useCallback(async (slotNumber: number) => {
    if (!activeCard || !id || !user) return;

    const stamp = activeCard.stamps.find(s => s.slot_number === slotNumber);

    if (stamp) {
      // Tap on existing stamp -> confirm delete
      Alert.alert(
        'Supprimer ce tampon ?',
        `${stamp.category_icon || '⭐'} ${stamp.category_label || 'Tampon'} (slot ${slotNumber})`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteStamp(stamp.id);
                await loadActiveCard(user.id, id);
              } catch (err) {
                console.error('Delete stamp error:', err);
                Alert.alert('Erreur', 'Impossible de supprimer le tampon');
              }
            },
          },
        ]
      );
    } else {
      // Tap on empty slot -> show category picker
      if (activeCard.stamp_count >= 10) return;
      setShowCategoryModal(true);
    }
  }, [activeCard, id, user, loadActiveCard]);

  // Handle category selection for new stamp
  const handleCategorySelect = useCallback(async (categoryId: string) => {
    if (!id || !user) return;
    setShowCategoryModal(false);
    try {
      const result = await doAwardStamp(user.id, id, categoryId);
      await loadActiveCard(user.id, id);
      if (result.cardComplete) {
        Alert.alert('Carte complete !', 'L\'eleve peut choisir son bonus.');
        getCompletedCardsForStudent(id).then(setCompletedCards);
      }
    } catch (err) {
      console.error('Award stamp error:', err);
      Alert.alert('Erreur', 'Impossible d\'attribuer le tampon');
    }
  }, [id, user, doAwardStamp, loadActiveCard, getCompletedCardsForStudent]);

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

  // Get card tier for active card
  const tier = activeCard ? getCardTier(activeCard.card_number) : CARD_TIERS.wood;

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
                <Text style={styles.studentCode}>{studentCode || student.pseudo}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.qrButton, pressed && styles.qrButtonPressed]}
                onPress={() => setShowQrModal(true)}
              >
                <Text style={styles.qrButtonText}>QR</Text>
              </Pressable>
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
          <View style={[styles.stampSection, { borderColor: tier.borderColor, borderWidth: 1, backgroundColor: `${tier.primaryColor}10` }]}>
            <Text style={styles.sectionTitle}>Carte a tampons</Text>
            {activeCard ? (
              <View style={styles.stampCardContainer}>
                <View style={styles.stampCardHeader}>
                  <Text style={[styles.stampCardTitle, { color: tier.textColor }]}>
                    {tier.emoji} Carte n°{activeCard.card_number} — {tier.name}
                  </Text>
                  <View style={[
                    styles.stampCountBadge,
                    { backgroundColor: tier.badgeBg },
                    activeCard.stamp_count >= 10 && styles.stampCountComplete,
                  ]}>
                    <Text style={[
                      styles.stampCountText,
                      { color: tier.badgeText },
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
                      backgroundColor: activeCard.stamp_count >= 10 ? tier.progressCompleteColor : tier.progressColor,
                    },
                  ]} />
                </View>
                {/* Stamp grid */}
                <View style={styles.stampGrid}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const stamp = activeCard.stamps.find(s => s.slot_number === i + 1);
                    return (
                      <Pressable
                        key={i}
                        onPress={() => handleStampSlotPress(i + 1)}
                        style={({ pressed }) => [
                          styles.stampSlot,
                          stamp ? {
                            backgroundColor: `${stamp.category_color || tier.primaryColor}20`,
                            borderColor: `${stamp.category_color || tier.primaryColor}60`,
                            borderStyle: 'solid' as const,
                          } : {
                            borderColor: tier.slotBorder,
                            backgroundColor: tier.slotBg,
                          },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={styles.stampSlotText}>
                          {stamp ? (stamp.category_icon || '⭐') : tier.emptyIcon}
                        </Text>
                      </Pressable>
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
                {completedCards.map(card => {
                  const cardTier = getCardTier(card.card_number);
                  return (
                    <View key={card.id} style={styles.completedCardRow}>
                      <Text style={styles.completedCardLabel}>
                        {cardTier.emoji} Carte n°{card.card_number}
                      </Text>
                      <Text style={styles.completedCardBonus}>
                        {card.bonus_label
                          ? `🎁 ${card.bonus_label} ${card.bonus_used ? '✓' : '⏳'}`
                          : 'Pas de bonus'}
                      </Text>
                    </View>
                  );
                })}
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

      {/* QR Code Modal */}
      <Modal
        visible={showQrModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowQrModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Acces eleve</Text>
            <Text style={styles.modalText}>
              Scannez ce QR code pour acceder a l'interface eleve
            </Text>
            <View style={styles.qrContainer}>
              <QRCode value={WEBAPP_BASE_URL} size={200} />
            </View>
            {studentCode && (
              <Text style={styles.qrCodeText}>Code : {studentCode}</Text>
            )}
            <Pressable
              style={styles.modalCancelButton}
              onPress={() => setShowQrModal(false)}
            >
              <Text style={styles.modalCancelText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Category Selection Modal */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Attribuer un tampon</Text>
            <Text style={styles.modalText}>Choisissez la categorie :</Text>
            <View style={styles.categoryList}>
              {categories.map(cat => (
                <Pressable
                  key={cat.id}
                  style={({ pressed }) => [
                    styles.categoryItem,
                    { borderColor: cat.color },
                    pressed && { backgroundColor: `${cat.color}20` },
                  ]}
                  onPress={() => handleCategorySelect(cat.id)}
                >
                  <Text style={styles.categoryIcon}>{cat.icon}</Text>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.modalCancelButton, { marginTop: theme.spacing.md }]}
              onPress={() => setShowCategoryModal(false)}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </Pressable>
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
  studentCode: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  qrButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '30',
  },
  qrButtonPressed: {
    backgroundColor: theme.colors.primary + '30',
  },
  qrButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
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
  },
  stampCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radius.full,
  },
  stampCountComplete: {
    backgroundColor: '#22c55e20',
  },
  stampCountText: {
    fontSize: 12,
    fontWeight: '600',
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
    borderStyle: 'dashed' as const,
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

  // QR modal
  qrContainer: {
    padding: theme.spacing.lg,
    backgroundColor: '#fff',
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.md,
  },
  qrCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    fontFamily: 'monospace',
  },

  // Category picker
  categoryList: {
    alignSelf: 'stretch',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
  },
  categoryIcon: {
    fontSize: 22,
  },
  categoryLabel: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
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
