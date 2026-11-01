import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ScanLine, CloudUpload, AlertTriangle, Trash2 } from 'lucide-react-native';
import { useAuthStore } from '../../../stores';
import { useAssessmentStore, buildScanStatuses, type StudentScanStatus } from '../../../stores/assessmentStore';
import { theme } from '../../../constants/theme';
import { OfflineIndicator } from '../../../components';
import { CopySheet, type CopySheetSave } from '../../../components/copies/CopySheet';
import { scanPages, preparePage } from '../../../services/copies/scanner';
import { nextPageOrder, summarize, type CopyPageView } from '../../../services/copies/outboxLogic';
import { getLastVersion, setLastVersion } from '../../../services/copies/localCache';
import { triggerLightFeedback, triggerSuccessFeedback } from '../../../utils/haptics';

type Filter = 'all' | 'todo' | 'done' | 'absent';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'todo', label: 'Reste' },
  { key: 'done', label: 'Faits' },
  { key: 'absent', label: 'Absents' },
];

/**
 * Copies d'une éval, élève par élève. Un appui sur un élève lance directement le scanner
 * (ou ouvre sa copie si elle est déjà faite) ; un appui long le marque absent / présent.
 * Tout passe par la file d'envoi : on peut scanner toute la classe sans réseau.
 */
export default function ScanScreen() {
  const params = useLocalSearchParams<{
    assessmentId: string;
    classId: string;
    name?: string;
    studentId?: string;
  }>();
  const { assessmentId, classId } = params;
  const evalName = params.name ?? 'Évaluation';

  const { user } = useAuthStore();
  const {
    students,
    snapshot,
    ops,
    isLoading,
    error,
    openAssessment,
    refreshSnapshot,
    saveCopy,
    setAbsent,
    deletePage,
    purgeCopies,
    retryNow,
    clearError,
  } = useAssessmentStore();

  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [defaultVersion, setDefaultVersion] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const shortcutHandled = useRef(false);

  useEffect(() => {
    if (!assessmentId || !classId) return;
    openAssessment(assessmentId, classId);
    getLastVersion(assessmentId).then(setDefaultVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId, classId]);

  const statuses = useMemo(
    () => buildScanStatuses(students, snapshot, ops, assessmentId ?? null),
    [students, snapshot, ops, assessmentId]
  );
  const selected = statuses.find((s) => s.student.id === selectedId) ?? null;
  const outbox = useMemo(() => summarize(ops, assessmentId), [ops, assessmentId]);

  const counts = useMemo(
    () => ({
      done: statuses.filter((s) => s.state === 'done').length,
      absent: statuses.filter((s) => s.state === 'absent').length,
      todo: statuses.filter((s) => s.state === 'todo').length,
    }),
    [statuses]
  );

  const knownVersions = useMemo(
    () =>
      Array.from(
        new Set(
          [...statuses.map((s) => s.subjectVersion), defaultVersion].filter(
            (v): v is string => !!v
          )
        )
      ),
    [statuses, defaultVersion]
  );

  const visible = statuses.filter((s) => filter === 'all' || s.state === filter);

  /** Scanne puis ouvre la relecture. Une copie déjà faite s'ouvre sans relancer le scanner. */
  const openStudent = useCallback(async (item: StudentScanStatus, forceScan = false) => {
    if (item.pages.length > 0 && !forceScan) {
      setDraft([]);
      setSelectedId(item.student.id);
      return;
    }
    let raw: string[] = [];
    try {
      raw = await scanPages(8);
    } catch (err) {
      Alert.alert('Scan impossible', err instanceof Error ? err.message : 'Réessaie.');
      return;
    }
    if (raw.length === 0) return;
    setPreparing(true);
    try {
      const prepared: string[] = [];
      for (const uri of raw) prepared.push((await preparePage(uri)).uri);
      setDraft(prepared);
      setSelectedId(item.student.id);
    } catch (err) {
      Alert.alert('Préparation des pages impossible', err instanceof Error ? err.message : 'Réessaie.');
    } finally {
      setPreparing(false);
    }
  }, []);

  // Raccourci du menu radial : on arrive avec un élève déjà choisi.
  useEffect(() => {
    if (shortcutHandled.current || !params.studentId || statuses.length === 0) return;
    const target = statuses.find((s) => s.student.id === params.studentId);
    if (!target) return;
    shortcutHandled.current = true;
    openStudent(target);
  }, [params.studentId, statuses, openStudent]);

  const nextTodo = (afterId: string): StudentScanStatus | null => {
    const start = statuses.findIndex((s) => s.student.id === afterId);
    const ordered = [...statuses.slice(start + 1), ...statuses.slice(0, Math.max(start, 0))];
    return ordered.find((s) => s.state === 'todo') ?? null;
  };

  const handleSave = async (save: CopySheetSave, goNext: boolean) => {
    if (!user?.id || !selected || !assessmentId) return;
    const current = selected;
    const upcoming = goNext ? nextTodo(current.student.id) : null;
    setSelectedId(null);
    setDraft([]);
    try {
      await saveCopy({
        userId: user.id,
        studentId: current.student.id,
        firstOrder: nextPageOrder(current.pages),
        pageUris: save.pageUris,
        info: save.info,
      });
      if (save.info.subjectVersion !== undefined) {
        await setLastVersion(assessmentId, save.info.subjectVersion);
        setDefaultVersion(save.info.subjectVersion);
      }
      triggerSuccessFeedback();
    } catch (err) {
      Alert.alert('Copie non enregistrée', err instanceof Error ? err.message : 'Réessaie.');
      return;
    }
    if (upcoming) openStudent(upcoming);
  };

  const handleDeletePage = async (page: CopyPageView) => {
    if (!user?.id || !selected) return;
    await deletePage(user.id, selected.student.id, page.pageId, page.storagePath);
  };

  const toggleAbsent = async (item: StudentScanStatus) => {
    if (!user?.id) return;
    if (item.pages.length > 0) {
      Alert.alert('Copie déjà scannée', `Supprime d’abord les pages de ${item.student.pseudo}.`);
      return;
    }
    triggerLightFeedback();
    await setAbsent(user.id, item.student.id, !item.absent);
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryNow();
    } finally {
      setRetrying(false);
    }
  };

  const handlePurge = () => {
    if (!assessmentId) return;
    Alert.alert(
      'Effacer tous les scans ?',
      `Les pages scannées de « ${evalName} » seront supprimées du téléphone et du serveur. L’éval, les notes et les absents restent.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: async () => {
            try {
              const n = await purgeCopies(assessmentId);
              Alert.alert('Scans effacés', `${n} fichier${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}.`);
            } catch (err) {
              Alert.alert('Suppression impossible', err instanceof Error ? err.message : 'Réessaie en ligne.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: StudentScanStatus }) => (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        item.state === 'absent' && styles.rowAbsent,
        pressed && styles.rowPressed,
      ]}
      onPress={() => openStudent(item)}
      onLongPress={() => toggleAbsent(item)}
      delayLongPress={350}
    >
      <View
        style={[
          styles.dot,
          item.state === 'done' && (item.pendingCount > 0 ? styles.dotPending : styles.dotDone),
          item.state === 'absent' && styles.dotAbsent,
        ]}
      />
      <Text style={[styles.name, item.state === 'absent' && styles.nameAbsent]} numberOfLines={1}>
        {item.student.pseudo}
      </Text>
      {item.subjectVersion ? <Tag label={item.subjectVersion} /> : null}
      {item.isAdapted ? <Tag label="Adaptée" tone="info" /> : null}
      {item.copyAnnotated ? <Tag label="Annotée" tone="info" /> : null}
      {item.state === 'done' ? (
        <Tag
          label={`${item.pages.length} p.${item.pendingCount > 0 ? ` · ⏳${item.pendingCount}` : ' ✓'}`}
          tone={item.pendingCount > 0 ? 'warn' : 'ok'}
        />
      ) : item.state === 'absent' ? (
        <Tag label="Absent" tone="absent" />
      ) : (
        <ScanLine size={20} color={theme.colors.textTertiary} />
      )}
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <OfflineIndicator />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={12}>
          <ChevronLeft size={26} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.title} numberOfLines={1}>
            {evalName}
          </Text>
          <Text style={styles.subtitle}>
            {counts.done}/{statuses.length} copies · {counts.absent} absent{counts.absent > 1 ? 's' : ''} ·{' '}
            {counts.todo} à scanner
          </Text>
        </View>
        <Pressable onPress={handlePurge} style={styles.iconButton} hitSlop={12}>
          <Trash2 size={20} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {outbox.total > 0 && (
        <View style={[styles.banner, outbox.lastError ? styles.bannerError : null]}>
          {outbox.lastError ? (
            <AlertTriangle size={18} color={theme.colors.absentText} />
          ) : (
            <CloudUpload size={18} color={theme.colors.bavardageText} />
          )}
          <Text style={styles.bannerText} numberOfLines={2}>
            {outbox.pendingPages > 0
              ? `${outbox.pendingPages} page${outbox.pendingPages > 1 ? 's' : ''} sur le téléphone, envoi dès que possible`
              : 'Modifications en attente d’envoi'}
            {outbox.lastError ? `\n${outbox.lastError}` : ''}
          </Text>
          <Pressable onPress={handleRetry} disabled={retrying} hitSlop={8}>
            {retrying ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <Text style={styles.bannerAction}>Réessayer</Text>
            )}
          </Pressable>
        </View>
      )}

      {error ? (
        <Pressable style={[styles.banner, styles.bannerError]} onPress={clearError}>
          <AlertTriangle size={18} color={theme.colors.absentText} />
          <Text style={styles.bannerText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const n = f.key === 'all' ? statuses.length : counts[f.key];
          return (
            <Pressable
              key={f.key}
              style={[styles.filter, filter === f.key && styles.filterActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label} {n}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading && statuses.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(item) => item.student.id}
          contentContainerStyle={styles.list}
          onRefresh={refreshSnapshot}
          refreshing={false}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {statuses.length === 0
                ? 'Aucun élève dans cette classe sur le téléphone. Synchronise d’abord.'
                : 'Personne dans cette catégorie.'}
            </Text>
          }
          ListFooterComponent={
            statuses.length > 0 ? (
              <Text style={styles.hint}>Appui long sur un élève : absent / présent</Text>
            ) : null
          }
        />
      )}

      {preparing && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.colors.textInverse} />
          <Text style={styles.overlayText}>Préparation des pages…</Text>
        </View>
      )}

      <CopySheet
        status={selected}
        initialDraft={draft}
        knownVersions={knownVersions}
        defaultVersion={defaultVersion}
        nextStudentName={selected ? nextTodo(selected.student.id)?.student.pseudo ?? null : null}
        onClose={() => {
          setSelectedId(null);
          setDraft([]);
        }}
        onSave={handleSave}
        onDeletePage={handleDeletePage}
      />
    </SafeAreaView>
  );
}

function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'info' | 'absent' }) {
  return (
    <View style={[styles.tag, tagTones[tone].box]}>
      <Text style={[styles.tagText, tagTones[tone].text]}>{label}</Text>
    </View>
  );
}

const tagTones = {
  neutral: StyleSheet.create({ box: { backgroundColor: theme.colors.surfaceSecondary }, text: { color: theme.colors.textSecondary } }),
  ok: StyleSheet.create({ box: { backgroundColor: theme.colors.successSoft }, text: { color: theme.colors.success } }),
  warn: StyleSheet.create({ box: { backgroundColor: theme.colors.warningSoft }, text: { color: theme.colors.bavardageText } }),
  info: StyleSheet.create({ box: { backgroundColor: theme.colors.primarySoft }, text: { color: theme.colors.primary } }),
  absent: StyleSheet.create({ box: { backgroundColor: theme.colors.absentBg }, text: { color: theme.colors.absentText } }),
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  iconButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitles: { flex: 1 },
  title: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bavardageSoft,
  },
  bannerError: { backgroundColor: theme.colors.absentBg },
  bannerText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 12.5, color: theme.colors.text },
  bannerAction: { fontFamily: theme.fonts.bodySemibold, fontSize: 13, color: theme.colors.primary },
  filters: { flexDirection: 'row', gap: 6, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.segmentTrack,
  },
  filterActive: { backgroundColor: theme.colors.text },
  filterText: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.textSecondary },
  filterTextActive: { color: theme.colors.textInverse },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  rowAbsent: { backgroundColor: theme.colors.absentBg, borderColor: theme.colors.absentBorder },
  rowPressed: { backgroundColor: theme.colors.surfaceHover },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.border, marginRight: 4 },
  dotDone: { backgroundColor: theme.colors.success },
  dotPending: { backgroundColor: theme.colors.warning },
  dotAbsent: { backgroundColor: theme.colors.absentBadge },
  name: { flex: 1, fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.text },
  nameAbsent: { color: theme.colors.absentText },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  tagText: { fontFamily: theme.fonts.bodySemibold, fontSize: 11.5 },
  empty: {
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.menuOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  overlayText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
});
