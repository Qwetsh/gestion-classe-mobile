import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../../stores';
import { useNetworkStore, useIsOffline } from '../../../stores/networkStore';
import { useAssessmentStore } from '../../../stores/assessmentStore';
import { theme } from '../../../constants/theme';
import { OfflineIndicator } from '../../../components';
import {
  pickFromCamera,
  listCopyPages,
  getCopyPageUrl,
  deleteCopyPage,
  type CopyPageRow,
} from '../../../services/copies';
import {
  enqueueCopy,
  drainQueue,
  getPendingOrders,
} from '../../../services/copies/uploadQueue';
import { computeNextPageOrder } from '../../../services/copies/queueLogic';
import type { StudentScanStatus } from '../../../types';

export default function ScanScreen() {
  const params = useLocalSearchParams<{
    assessmentId: string;
    classId: string;
    name?: string;
  }>();
  const assessmentId = params.assessmentId;
  const classId = params.classId;
  const evalName = params.name ?? 'Évaluation';

  const { user } = useAuthStore();
  const { scanStatuses, isLoading, loadScanStatuses, bumpPageCount, bumpPendingCount } =
    useAssessmentStore();
  const offline = useIsOffline();
  const { isConnected, isInternetReachable } = useNetworkStore();

  // Modal de gestion des pages d'un élève
  const [selected, setSelected] = useState<StudentScanStatus | null>(null);
  const [pages, setPages] = useState<CopyPageRow[]>([]);
  const [pageUrls, setPageUrls] = useState<Record<string, string>>({});
  const [pagesLoading, setPagesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingForSelected, setPendingForSelected] = useState(0);
  const [draining, setDraining] = useState(false);

  // Vide la file d'attente puis recharge l'état réel (serveur + file)
  const drainAndReload = useCallback(async () => {
    setDraining(true);
    try {
      await drainQueue();
    } finally {
      setDraining(false);
      if (assessmentId && classId) {
        await loadScanStatuses(assessmentId, classId);
      }
    }
  }, [assessmentId, classId, loadScanStatuses]);

  // Chargement initial + tentative de vidage de la file si en ligne
  useEffect(() => {
    if (!assessmentId || !classId) return;
    loadScanStatuses(assessmentId, classId);
    if (!offline) {
      drainQueue().then(() => loadScanStatuses(assessmentId, classId));
    }
  }, [assessmentId, classId]);

  // Auto-vidage de la file dès que la connexion revient
  useEffect(() => {
    if (!offline && assessmentId && classId) {
      drainAndReload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isInternetReachable]);

  const refreshPages = useCallback(
    async (studentId: string) => {
      setPagesLoading(true);
      try {
        const rows = await listCopyPages(assessmentId, studentId);
        setPages(rows);
        const urls: Record<string, string> = {};
        await Promise.all(
          rows.map(async (r) => {
            const url = await getCopyPageUrl(r.storage_path);
            if (url) urls[r.id] = url;
          })
        );
        setPageUrls(urls);
      } finally {
        setPagesLoading(false);
      }
    },
    [assessmentId]
  );

  const openStudent = async (item: StudentScanStatus) => {
    setSelected(item);
    setPages([]);
    setPageUrls({});
    setPendingForSelected(item.pendingCount);
    await refreshPages(item.student.id);
    const orders = await getPendingOrders(assessmentId, item.student.id);
    setPendingForSelected(orders.length);
  };

  const closeModal = () => {
    setSelected(null);
    setPages([]);
    setPageUrls({});
    setPendingForSelected(0);
  };

  const handleAddPage = async () => {
    if (!user?.id || !selected) return;
    const uri = await pickFromCamera();
    if (!uri) return;
    const studentId = selected.student.id;

    setUploading(true);
    try {
      // page_order tient compte du serveur ET de la file (pas de collision hors-ligne)
      const serverOrders = pages.map((p) => p.page_order);
      const pendingOrders = await getPendingOrders(assessmentId, studentId);
      const nextOrder = computeNextPageOrder(serverOrders, pendingOrders);

      // 1) Persiste l'image + met en file -> JAMAIS perdue, même si l'app crashe
      await enqueueCopy({
        userId: user.id,
        assessmentId,
        studentId,
        pageOrder: nextOrder,
        sourceUri: uri,
      });
      bumpPendingCount(studentId, 1);
      setPendingForSelected((n) => n + 1);

      // 2) Si en ligne, on uploade tout de suite et on rafraîchit l'état réel
      if (!offline) {
        await drainQueue();
        await Promise.all([
          refreshPages(studentId),
          loadScanStatuses(assessmentId, classId),
        ]);
        const orders = await getPendingOrders(assessmentId, studentId);
        setPendingForSelected(orders.length);
      }
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'La copie n’a pas pu être enregistrée.'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePage = (page: CopyPageRow) => {
    if (!selected) return;
    Alert.alert('Supprimer cette page ?', 'Action irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const ok = await deleteCopyPage(page.storage_path, page.id);
          if (ok) {
            bumpPageCount(selected.student.id, -1);
            await refreshPages(selected.student.id);
          } else {
            Alert.alert('Suppression échouée', 'Réessaie une fois connecté.');
          }
        },
      },
    ]);
  };

  const scannedCount = scanStatuses.filter((s) => s.pageCount > 0).length;
  const pendingTotal = scanStatuses.reduce((sum, s) => sum + s.pendingCount, 0);

  const renderItem = ({ item }: { item: StudentScanStatus }) => {
    const done = item.pageCount > 0;
    const pending = item.pendingCount > 0;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => openStudent(item)}
      >
        <View
          style={[
            styles.statusDot,
            done ? styles.dotDone : pending ? styles.dotPending : styles.dotEmpty,
          ]}
        />
        <Text style={styles.studentName}>{item.student.pseudo}</Text>
        {done && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {item.pageCount} page{item.pageCount > 1 ? 's' : ''}
            </Text>
          </View>
        )}
        {pending && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>⏳ {item.pendingCount}</Text>
          </View>
        )}
        {!done && !pending && <Text style={styles.emptyLabel}>à scanner</Text>}
        <Text style={styles.cameraIcon}>📷</Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <OfflineIndicator />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.title} numberOfLines={1}>
            {evalName}
          </Text>
          <Text style={styles.subtitle}>
            {scannedCount}/{scanStatuses.length} élèves scannés
            {pendingTotal > 0
              ? ` · ⏳ ${pendingTotal} en attente${draining ? ' (envoi…)' : ''}`
              : ''}
          </Text>
        </View>
      </View>

      <View style={styles.container}>
        {isLoading && scanStatuses.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Chargement des élèves…</Text>
          </View>
        ) : (
          <FlatList
            data={scanStatuses}
            renderItem={renderItem}
            keyExtractor={(item) => item.student.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                Aucun élève dans cette classe localement. Synchronise d’abord.
              </Text>
            }
          />
        )}
      </View>

      {/* Modal gestion des pages d'un élève */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeModal}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{selected?.student.pseudo}</Text>
            <Text style={styles.modalSubtitle}>
              {pages.length} page{pages.length > 1 ? 's' : ''} envoyée
              {pages.length > 1 ? 's' : ''}
              {pendingForSelected > 0
                ? ` · ⏳ ${pendingForSelected} en attente d’envoi`
                : ''}
            </Text>

            {pagesLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsRow}>
                {pages.map((p) => (
                  <View key={p.id} style={styles.thumbWrap}>
                    {pageUrls[p.id] ? (
                      <Image source={{ uri: pageUrls[p.id] }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Text style={styles.thumbOrder}>p{p.page_order}</Text>
                      </View>
                    )}
                    <Pressable
                      style={styles.thumbDelete}
                      onPress={() => handleDeletePage(p)}
                      hitSlop={8}
                    >
                      <Text style={styles.thumbDeleteText}>×</Text>
                    </Pressable>
                  </View>
                ))}
                {pages.length === 0 && (
                  <Text style={styles.noPages}>Aucune page. Prends la première photo.</Text>
                )}
              </ScrollView>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                uploading && styles.addDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleAddPage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.addText}>
                  📷 {pages.length === 0 ? 'Photographier la copie' : 'Ajouter une page'}
                </Text>
              )}
            </Pressable>

            <Pressable style={styles.modalCancel} onPress={closeModal}>
              <Text style={styles.modalCancelText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  backButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 30, color: theme.colors.text, lineHeight: 30 },
  headerTitles: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: theme.spacing.md, color: theme.colors.textSecondary },

  list: { padding: theme.spacing.lg },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceHover, transform: [{ scale: 0.99 }] },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: theme.spacing.md },
  dotDone: { backgroundColor: theme.colors.success },
  dotPending: { backgroundColor: theme.colors.warning },
  dotEmpty: { backgroundColor: theme.colors.border },
  studentName: { flex: 1, fontSize: 16, fontWeight: '600', color: theme.colors.text },
  badge: {
    backgroundColor: theme.colors.successSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginRight: theme.spacing.sm,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: theme.colors.success },
  pendingBadge: {
    backgroundColor: theme.colors.warningSoft,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    marginRight: theme.spacing.sm,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: '700', color: theme.colors.warning },
  emptyLabel: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginRight: theme.spacing.sm,
  },
  cameraIcon: { fontSize: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl + 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  modalSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  modalLoading: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  thumbsRow: { marginBottom: theme.spacing.md },
  thumbWrap: { marginRight: theme.spacing.sm, position: 'relative' },
  thumb: {
    width: 90,
    height: 120,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  thumbOrder: { color: theme.colors.textSecondary, fontWeight: '600' },
  thumbDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbDeleteText: { color: theme.colors.textInverse, fontSize: 16, fontWeight: '700', lineHeight: 18 },
  noPages: {
    color: theme.colors.textTertiary,
    fontSize: 14,
    paddingVertical: theme.spacing.lg,
  },

  addButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  addDisabled: { opacity: 0.6 },
  addText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },
  buttonPressed: { opacity: 0.95, transform: [{ scale: 0.99 }] },
  modalCancel: { alignItems: 'center', paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs },
  modalCancelText: { color: theme.colors.textSecondary, fontWeight: '500', fontSize: 15 },
});
