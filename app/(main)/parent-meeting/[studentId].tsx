import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useParentMeetingStore } from '../../../stores/parentMeetingStore';
import { ORAL_GRADE_LABELS } from '../../../stores/oralEvaluationStore';
import { useAuthStore, useGroupSessionStore } from '../../../stores';
import { theme, PERIOD_LABELS_FULL } from '../../../constants';
import {
  BehaviorPositioning,
  GradePositioning,
  JournalSession,
  Rank,
  GRADE_STATUS_SHORT,
  formatGrade,
  getPeriodDates,
  loadBehaviorPositioning,
  loadGradePositioning,
  loadSessionJournal,
} from '../../../services/meetingInsights';

// Group session grade type
interface GroupSessionGrade {
  sessionId: string;
  sessionName: string;
  classId: string;
  completedAt: string;
  score: number;
  maxScore: number;
}

const SORTIE_LABEL: Record<string, string> = {
  infirmerie: 'Infirmerie',
  toilettes: 'Toilettes',
  convocation: 'Convocation',
  exclusion: 'Exclusion',
};

const TYPE_LABEL: Record<string, string> = {
  participation: 'Participation',
  bavardage: 'Malus',
  absence: 'Absence',
  remarque: 'Remarque',
  sortie: 'Sortie',
  retour: 'Retour',
};

const KIND_LABEL: Record<string, string> = {
  ecrit: 'Écrit',
  tp: 'TP',
  oral: 'Oral',
  dm: 'DM',
  projet: 'Projet',
};

const JOURNAL_PREVIEW = 6;

function formatShortDate(dateString: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function signed(v: number | null, decimals = 2): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const s = v.toFixed(decimals).replace('.', ',');
  return v > 0 ? `+${s}` : s;
}

function rankText(r: Rank | null): string {
  if (!r) return '—';
  return `${r.rank}${r.rank === 1 ? 'er' : 'e'} / ${r.total}`;
}

/** « Top 15 % » ou « 2e moitié » selon la place. */
function rankHint(r: Rank | null): string | null {
  if (!r || r.total < 4) return null;
  const pct = Math.max(1, Math.round((r.rank / r.total) * 100));
  if (pct <= 50) return `top ${pct} %`;
  return `${100 - pct + 1} % derrière`;
}

function rankTone(r: Rank | null): 'good' | 'mid' | 'low' | 'none' {
  if (!r || r.total < 2) return 'none';
  const q = (r.rank - 1) / Math.max(1, r.total - 1);
  return q <= 0.33 ? 'good' : q >= 0.67 ? 'low' : 'mid';
}

function gradeTone(v: number | null): string {
  if (v === null) return theme.colors.textTertiary;
  if (v >= 14) return theme.colors.success;
  if (v < 10) return theme.colors.error;
  return theme.colors.bavardageText;
}

export default function StudentDashboardScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { user } = useAuthStore();
  const {
    selectedPeriod,
    currentDashboard,
    isLoadingDashboard,
    error,
    loadStudentDashboard,
    clearDashboard,
    clearError,
  } = useParentMeetingStore();
  const { getStudentGrades } = useGroupSessionStore();

  const [groupGrades, setGroupGrades] = useState<GroupSessionGrade[]>([]);
  const [behavior, setBehavior] = useState<BehaviorPositioning | null>(null);
  const [journal, setJournal] = useState<JournalSession[]>([]);
  const [gradeData, setGradeData] = useState<GradePositioning | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [isLoadingGrades, setIsLoadingGrades] = useState(false);
  const [showAllJournal, setShowAllJournal] = useState(false);
  const [onlyCommented, setOnlyCommented] = useState(false);

  useEffect(() => {
    if (studentId) loadStudentDashboard(studentId);
    return () => clearDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, selectedPeriod]);

  const dashboard = currentDashboard;
  const student = dashboard?.student;
  const classId = student?.classId;

  // Positionnement comportement + journal (local)
  useEffect(() => {
    if (!user?.id || !studentId || !classId) return;
    let cancelled = false;
    Promise.all([
      loadBehaviorPositioning(user.id, studentId, classId, selectedPeriod),
      loadSessionJournal(user.id, studentId, selectedPeriod),
    ])
      .then(([b, j]) => {
        if (cancelled) return;
        setBehavior(b);
        setJournal(j);
      })
      .catch((err) => console.error('[meeting] behavior/journal', err));
    return () => { cancelled = true; };
  }, [user?.id, studentId, classId, selectedPeriod]);

  // Notes du carnet (Supabase)
  useEffect(() => {
    if (!user?.id || !studentId || !classId) return;
    let cancelled = false;
    setIsLoadingGrades(true);
    setGradeError(null);
    loadGradePositioning(user.id, studentId, classId, selectedPeriod)
      .then((g) => { if (!cancelled) setGradeData(g); })
      .catch((err) => {
        console.warn('[meeting] grades', err);
        if (!cancelled) setGradeError('Notes indisponibles (connexion requise)');
      })
      .finally(() => { if (!cancelled) setIsLoadingGrades(false); });
    return () => { cancelled = true; };
  }, [user?.id, studentId, classId, selectedPeriod]);

  // Notes de groupe (TP) filtrées par période
  useEffect(() => {
    if (!studentId) return;
    getStudentGrades(studentId)
      .then((all) => {
        const { start, end } = getPeriodDates(selectedPeriod);
        setGroupGrades(all.filter((g) => {
          const d = new Date(g.completedAt);
          return d >= start && d <= end;
        }));
      })
      .catch((err) => console.error('Error loading group grades:', err));
  }, [studentId, selectedPeriod, getStudentGrades]);

  // Barres hebdo (8 semaines)
  const weekly = dashboard?.weeklyEvolution ?? [];
  const weekMax = useMemo(
    () => Math.max(1, ...weekly.map((w) => Math.max(w.participation, w.bavardage))),
    [weekly],
  );

  const journalFiltered = useMemo(
    () => (onlyCommented ? journal.filter((j) => j.comments.length > 0) : journal),
    [journal, onlyCommented],
  );
  const journalShown = showAllJournal ? journalFiltered : journalFiltered.slice(0, JOURNAL_PREVIEW);
  const commentCount = useMemo(() => journal.reduce((n, j) => n + j.comments.length, 0), [journal]);

  const header = (title: string) => (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: theme.fonts.bodySemibold, fontSize: 17 },
        headerLeft: () => (
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          >
            <Text style={styles.backButtonText}>← Retour</Text>
          </Pressable>
        ),
      }}
    />
  );

  if (!dashboard && !isLoadingDashboard && error) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        {header('Erreur')}
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const stats = dashboard?.stats;
  const name = student?.fullName || student?.pseudo || '';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {header(name || 'Chargement…')}

      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </Pressable>
      )}

      {isLoadingDashboard || !dashboard || !stats ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement du bilan…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* En-tête + stats compactes */}
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials || '?'}</Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
                <Text style={styles.headerMeta} numberOfLines={1}>
                  {[behavior?.className, student?.fullName ? student.pseudo : null, PERIOD_LABELS_FULL[selectedPeriod]]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
              {gradeData?.studentAverage != null && (
                <View style={styles.headerAvg}>
                  <Text style={[styles.headerAvgValue, { color: gradeTone(gradeData.studentAverage) }]}>
                    {formatGrade(gradeData.studentAverage)}
                  </Text>
                  <Text style={styles.headerAvgLabel}>moy. /20</Text>
                </View>
              )}
            </View>

            <View style={styles.statStrip}>
              <StatChip label="Particip." value={`+${stats.participation}`} color={theme.colors.participation} />
              <StatChip label="Malus" value={`−${stats.bavardage}`} color={theme.colors.bavardageText} />
              <StatChip label="Score" value={signed(stats.score, 0)} color={stats.score >= 0 ? theme.colors.primary : theme.colors.error} />
              <StatChip label="Abs." value={String(stats.absence)} color={theme.colors.absentText} />
              <StatChip label="Sorties" value={String(stats.sortie)} color={theme.colors.sortieText} />
            </View>

            {/* Évolution 8 semaines en mini-barres */}
            <View style={styles.weekRow}>
              {weekly.map((w) => (
                <View key={w.week} style={styles.weekCol}>
                  <View style={styles.weekBars}>
                    <View style={[styles.weekBar, { height: Math.max(2, (w.participation / weekMax) * 28), backgroundColor: theme.colors.participation }]} />
                    <View style={[styles.weekBar, { height: Math.max(2, (w.bavardage / weekMax) * 28), backgroundColor: theme.colors.bavardage }]} />
                  </View>
                  <Text style={styles.weekLabel}>{w.week}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.weekCaption}>8 dernières semaines · vert participation, orange malus</Text>
          </View>

          {/* Positionnement */}
          <SectionTitle title="Positionnement" />
          <View style={styles.card}>
            <Text style={styles.blockTitle}>Comportement <Text style={styles.blockSub}>· score par séance</Text></Text>
            {behavior ? (
              <>
                <CompareRow
                  items={[
                    { label: 'Élève', value: signed(behavior.studentRate) },
                    { label: 'Classe', value: signed(behavior.classMeanRate) },
                    { label: behavior.level ? `Mes ${behavior.level}` : 'Niveau', value: signed(behavior.levelMeanRate) },
                  ]}
                />
                <Text style={styles.detailLine}>
                  Participation/séance : {formatGrade(behavior.participation.student, 2)} (classe {formatGrade(behavior.participation.classMean, 2)}
                  {behavior.level ? `, niveau ${formatGrade(behavior.participation.levelMean, 2)}` : ''})
                </Text>
                <Text style={styles.detailLine}>
                  Malus/séance : {formatGrade(behavior.malus.student, 2)} (classe {formatGrade(behavior.malus.classMean, 2)}
                  {behavior.level ? `, niveau ${formatGrade(behavior.malus.levelMean, 2)}` : ''})
                </Text>
                <RankRow label={`Dans la classe ${behavior.className}`} rank={behavior.rankInClass} />
                {behavior.level && <RankRow label={`Parmi tous mes ${behavior.level}`} rank={behavior.rankInLevel} />}
                {behavior.level && <RankRow label={`La ${behavior.className} parmi mes ${behavior.level}`} rank={behavior.classRankInLevel} />}
                <Text style={styles.footnote}>{behavior.sessionsCount} séance{behavior.sessionsCount > 1 ? 's' : ''} sur la période</Text>
              </>
            ) : (
              <ActivityIndicator size="small" color={theme.colors.primary} style={styles.inlineLoader} />
            )}

            <View style={styles.blockDivider} />

            <Text style={styles.blockTitle}>Notes <Text style={styles.blockSub}>· moyenne /20</Text></Text>
            {isLoadingGrades ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={styles.inlineLoader} />
            ) : gradeError ? (
              <Text style={styles.emptyInline}>{gradeError}</Text>
            ) : gradeData && gradeData.studentAverage !== null ? (
              <>
                <CompareRow
                  items={[
                    { label: 'Élève', value: formatGrade(gradeData.studentAverage), color: gradeTone(gradeData.studentAverage) },
                    { label: 'Classe', value: formatGrade(gradeData.classAverage) },
                    { label: gradeData.level ? `Mes ${gradeData.level}` : 'Niveau', value: formatGrade(gradeData.levelAverage) },
                  ]}
                />
                <RankRow label={`Dans la classe ${behavior?.className ?? ''}`} rank={gradeData.rankInClass} />
                {gradeData.level && <RankRow label={`Parmi tous mes ${gradeData.level}`} rank={gradeData.rankInLevel} />}
                {gradeData.level && <RankRow label={`La classe parmi mes ${gradeData.level}`} rank={gradeData.classRankInLevel} />}
              </>
            ) : (
              <Text style={styles.emptyInline}>Aucune note sur la période</Text>
            )}
          </View>

          {/* Notes du carnet */}
          <SectionTitle title="Évaluations" count={gradeData?.lines.length} />
          {gradeData && gradeData.lines.length > 0 ? (
            <View style={styles.listCard}>
              {gradeData.lines.map((l, i) => {
                const statusLabel = l.status && l.status !== 'noted' ? GRADE_STATUS_SHORT[l.status] : null;
                const showRaw = l.raw !== null && l.baremeTotal !== null && l.baremeTotal !== 20;
                const gap = l.grade !== null && l.classMean !== null ? l.grade - l.classMean : null;
                return (
                  <View key={l.assessmentId} style={[styles.gradeItem, i > 0 && styles.itemBorder]}>
                    <View style={styles.gradeMain}>
                      <Text style={styles.gradeName} numberOfLines={2}>{l.name}</Text>
                      <Text style={styles.gradeMeta}>
                        {[formatShortDate(l.date), l.kind ? KIND_LABEL[l.kind] ?? l.kind : null,
                          l.coefficient !== 1 ? `coef ${formatGrade(l.coefficient, 1)}` : null,
                          !l.countsInAverage ? 'hors moyenne' : null,
                          l.isAdapted ? 'adapté' : null]
                          .filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={styles.gradeMeta}>
                        Classe : moy. {formatGrade(l.classMean)} · {formatGrade(l.classMin)}–{formatGrade(l.classMax)}
                      </Text>
                      {l.comment && <Text style={styles.gradeComment}>« {l.comment} »</Text>}
                    </View>
                    <View style={styles.gradeRight}>
                      {statusLabel ? (
                        <Text style={styles.gradeStatus}>{statusLabel}</Text>
                      ) : (
                        <Text style={[styles.gradeValue, { color: gradeTone(l.grade) }]}>
                          {formatGrade(l.grade)}
                        </Text>
                      )}
                      {showRaw && <Text style={styles.gradeRaw}>{formatGrade(l.raw)}/{formatGrade(l.baremeTotal, 0)}</Text>}
                      {gap !== null && !statusLabel && (
                        <Text style={[styles.gradeGap, { color: gap >= 0 ? theme.colors.success : theme.colors.error }]}>
                          {signed(gap, 1)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            !isLoadingGrades && !gradeError && <EmptyCard text="Aucune évaluation sur la période" />
          )}

          {/* Journal des séances */}
          <SectionTitle title="Journal des séances" count={journal.length} />
          {journal.length > 0 && (
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => setOnlyCommented(false)}
                style={[styles.toggle, !onlyCommented && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, !onlyCommented && styles.toggleTextActive]}>Toutes</Text>
              </Pressable>
              <Pressable
                onPress={() => setOnlyCommented(true)}
                style={[styles.toggle, onlyCommented && styles.toggleActive]}
              >
                <Text style={[styles.toggleText, onlyCommented && styles.toggleTextActive]}>
                  Avec commentaire ({commentCount})
                </Text>
              </Pressable>
            </View>
          )}
          {journalFiltered.length > 0 ? (
            <View style={styles.listCard}>
              {journalShown.map((j, i) => (
                <View key={j.sessionId} style={[styles.journalItem, i > 0 && styles.itemBorder]}>
                  <View style={styles.journalHead}>
                    <Text style={styles.journalDate}>{formatShortDate(j.startedAt)}</Text>
                    {j.topic ? <Text style={styles.journalTopic} numberOfLines={1}>{j.topic}</Text> : null}
                  </View>
                  <View style={styles.pillRow}>
                    {j.absent && <Pill text="Absent" color={theme.colors.absentText} bg={theme.colors.absentBg} />}
                    {j.participation > 0 && <Pill text={`+${j.participation} particip.`} color={theme.colors.success} bg={theme.colors.participationSoft} />}
                    {j.bavardage > 0 && <Pill text={`−${j.bavardage} malus`} color={theme.colors.bavardageText} bg={theme.colors.bavardageSoft} />}
                    {j.sorties.map((s, k) => (
                      <Pill key={k} text={SORTIE_LABEL[s] ?? s} color={theme.colors.sortieText} bg={theme.colors.sortieBg} />
                    ))}
                  </View>
                  {j.comments.map((c) => (
                    <View key={c.id} style={styles.comment}>
                      <Text style={styles.commentText}>
                        {c.type !== 'remarque' && <Text style={styles.commentType}>{TYPE_LABEL[c.type] ?? c.type} : </Text>}
                        {c.note || 'Remarque sans texte'}
                      </Text>
                      {c.photo_path && (
                        <Image source={{ uri: c.photo_path }} style={styles.commentPhoto} resizeMode="cover" />
                      )}
                    </View>
                  ))}
                </View>
              ))}
              {journalFiltered.length > JOURNAL_PREVIEW && (
                <Pressable style={styles.moreButton} onPress={() => setShowAllJournal((v) => !v)}>
                  <Text style={styles.moreText}>
                    {showAllJournal ? 'Réduire' : `Tout afficher (${journalFiltered.length})`}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <EmptyCard text={onlyCommented ? 'Aucun commentaire sur la période' : 'Aucune action enregistrée sur la période'} />
          )}

          {/* Oral + TP */}
          <SectionTitle title="Oral et travaux de groupe" />
          <View style={styles.listCard}>
            <View style={styles.gradeItem}>
              <View style={styles.gradeMain}>
                <Text style={styles.gradeName}>Évaluation orale</Text>
                <Text style={styles.gradeMeta}>
                  {dashboard.oralEvaluation
                    ? `${ORAL_GRADE_LABELS[dashboard.oralEvaluation.grade] || ''} · ${formatDate(dashboard.oralEvaluation.evaluated_at)}`
                    : 'Non évalué sur la période'}
                </Text>
              </View>
              {dashboard.oralEvaluation && (
                <Text style={[styles.gradeValue, { color: theme.colors.remarque }]}>{dashboard.oralEvaluation.grade}/5</Text>
              )}
            </View>
            {groupGrades.map((g) => (
              <View key={g.sessionId} style={[styles.gradeItem, styles.itemBorder]}>
                <View style={styles.gradeMain}>
                  <Text style={styles.gradeName} numberOfLines={2}>{g.sessionName}</Text>
                  <Text style={styles.gradeMeta}>TP de groupe · {formatShortDate(g.completedAt)}</Text>
                </View>
                <Text style={[styles.gradeValue, { color: gradeTone(g.maxScore > 0 ? (g.score / g.maxScore) * 20 : null) }]}>
                  {g.score}/{g.maxScore}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ============================================================
// Petits composants
// ============================================================

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {count !== undefined && count > 0 && <Text style={styles.sectionCount}>{count}</Text>}
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

function CompareRow({ items }: { items: { label: string; value: string; color?: string }[] }) {
  return (
    <View style={styles.compareRow}>
      {items.map((it, i) => (
        <View key={it.label} style={[styles.compareItem, i === 0 && styles.compareItemMain]}>
          <Text style={[styles.compareValue, it.color ? { color: it.color } : null]}>{it.value}</Text>
          <Text style={styles.compareLabel}>{it.label}</Text>
        </View>
      ))}
    </View>
  );
}

function RankRow({ label, rank }: { label: string; rank: Rank | null }) {
  const tone = rankTone(rank);
  const hint = rankHint(rank);
  const color =
    tone === 'good' ? theme.colors.success : tone === 'low' ? theme.colors.error : tone === 'mid' ? theme.colors.bavardageText : theme.colors.textTertiary;
  return (
    <View style={styles.rankRow}>
      <Text style={styles.rankLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.rankValue, { color }]}>
        {rankText(rank)}{hint ? <Text style={styles.rankHint}>  {hint}</Text> : null}
      </Text>
    </View>
  );
}

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <View style={[styles.card, styles.emptyCard]}>
      <Text style={styles.emptyInline}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  backButton: { paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderRadius: theme.radius.md },
  backButtonPressed: { backgroundColor: theme.colors.surfaceHover },
  backButtonText: { color: theme.colors.primary, fontSize: 16, fontFamily: theme.fonts.bodySemibold },

  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
  },
  errorBannerText: { color: theme.colors.error, fontSize: 14, textAlign: 'center', fontFamily: theme.fonts.bodyMedium },
  errorText: { color: theme.colors.textSecondary, fontSize: 16, textAlign: 'center', fontFamily: theme.fonts.body },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: theme.spacing.md, color: theme.colors.textSecondary, fontSize: 15, fontFamily: theme.fonts.body },

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    marginBottom: theme.spacing.md,
  },
  listCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 16 },

  // En-tête
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: theme.colors.primary, fontFamily: theme.fonts.bodyBold, fontSize: 16 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 18, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  headerMeta: { fontSize: 13, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginTop: 1 },
  headerAvg: { alignItems: 'flex-end', marginLeft: 8 },
  headerAvgValue: { fontSize: 22, fontFamily: theme.fonts.bodyBold },
  headerAvgLabel: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textTertiary },

  statStrip: {
    flexDirection: 'row',
    marginTop: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    paddingVertical: 8,
  },
  statChip: { flex: 1, alignItems: 'center' },
  statChipValue: { fontSize: 17, fontFamily: theme.fonts.bodyBold },
  statChipLabel: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginTop: 1 },

  weekRow: { flexDirection: 'row', marginTop: 10, alignItems: 'flex-end' },
  weekCol: { flex: 1, alignItems: 'center' },
  weekBars: { flexDirection: 'row', alignItems: 'flex-end', height: 28, gap: 2 },
  weekBar: { width: 6, borderRadius: 2 },
  weekLabel: { fontSize: 10, fontFamily: theme.fonts.body, color: theme.colors.textTertiary, marginTop: 2 },
  weekCaption: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textTertiary, textAlign: 'center', marginTop: 4 },

  // Sections
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginTop: 2, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 12, fontFamily: theme.fonts.bodySemibold, color: theme.colors.textTertiary, letterSpacing: 0.6 },
  sectionCount: {
    marginLeft: 6,
    fontSize: 11,
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.segmentTrack,
    paddingHorizontal: 6,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },

  // Positionnement
  blockTitle: { fontSize: 14, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text, marginBottom: 8 },
  blockSub: { fontSize: 12, fontFamily: theme.fonts.body, color: theme.colors.textTertiary },
  blockDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 12 },
  compareRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  compareItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  compareItemMain: { backgroundColor: theme.colors.primarySoft },
  compareValue: { fontSize: 18, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  compareLabel: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginTop: 1 },
  detailLine: { fontSize: 12, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginBottom: 2 },
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rankLabel: { flex: 1, fontSize: 13, fontFamily: theme.fonts.body, color: theme.colors.text, marginRight: 8 },
  rankValue: { fontSize: 14, fontFamily: theme.fonts.bodyBold },
  rankHint: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textTertiary },
  footnote: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textTertiary, marginTop: 4 },
  inlineLoader: { marginVertical: 8 },
  emptyInline: { fontSize: 13, fontFamily: theme.fonts.body, color: theme.colors.textTertiary },

  // Évaluations
  itemBorder: { borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  gradeItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  gradeMain: { flex: 1, marginRight: 10 },
  gradeName: { fontSize: 14, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text },
  gradeMeta: { fontSize: 12, fontFamily: theme.fonts.body, color: theme.colors.textSecondary, marginTop: 1 },
  gradeComment: { fontSize: 13, fontFamily: theme.fonts.body, color: theme.colors.text, fontStyle: 'italic', marginTop: 4 },
  gradeRight: { alignItems: 'flex-end', minWidth: 52 },
  gradeValue: { fontSize: 18, fontFamily: theme.fonts.bodyBold },
  gradeRaw: { fontSize: 11, fontFamily: theme.fonts.body, color: theme.colors.textTertiary },
  gradeGap: { fontSize: 11, fontFamily: theme.fonts.bodySemibold },
  gradeStatus: { fontSize: 14, fontFamily: theme.fonts.bodySemibold, color: theme.colors.textSecondary },

  // Journal
  toggleRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.segmentTrack,
  },
  toggleActive: { backgroundColor: theme.colors.primary },
  toggleText: { fontSize: 13, fontFamily: theme.fonts.bodyMedium, color: theme.colors.textSecondary },
  toggleTextActive: { color: theme.colors.textInverse },
  journalItem: { paddingHorizontal: 14, paddingVertical: 10 },
  journalHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  journalDate: { fontSize: 13, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text, textTransform: 'capitalize' },
  journalTopic: { flex: 1, fontSize: 12, fontFamily: theme.fonts.body, color: theme.colors.textSecondary },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.radius.full },
  pillText: { fontSize: 11, fontFamily: theme.fonts.bodySemibold },
  comment: {
    marginTop: 6,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.remarque,
  },
  commentText: { fontSize: 14, fontFamily: theme.fonts.body, color: theme.colors.text, lineHeight: 20 },
  commentType: { fontFamily: theme.fonts.bodySemibold, color: theme.colors.textSecondary },
  commentPhoto: { width: '100%', height: 140, borderRadius: theme.radius.md, marginTop: 6 },
  moreButton: { paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  moreText: { fontSize: 13, fontFamily: theme.fonts.bodySemibold, color: theme.colors.primary },
});
