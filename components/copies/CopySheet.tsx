import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { ChevronLeft, ChevronRight, Plus, RotateCcw, X, Check } from 'lucide-react-native';
import { BottomSheet } from '../session/BottomSheet';
import { theme } from '../../constants/theme';
import { getCopyPageUrl } from '../../services/copies';
import { scanPages, preparePage } from '../../services/copies/scanner';
import type { CopyInfo, CopyPageView } from '../../services/copies/outboxLogic';
import type { StudentScanStatus } from '../../stores/assessmentStore';

export interface CopySheetSave {
  /** Nouvelles pages, compressées, dans l'ordre voulu (ajoutées après les pages existantes). */
  pageUris: string[];
  /** Seulement ce qui a changé. */
  info: CopyInfo;
}

interface CopySheetProps {
  status: StudentScanStatus | null;
  /** Pages qui viennent d'être scannées à l'ouverture (déjà compressées). */
  initialDraft: string[];
  /** Versions du sujet déjà utilisées sur cette éval, plus la dernière saisie. */
  knownVersions: string[];
  defaultVersion: string | null;
  nextStudentName: string | null;
  onClose: () => void;
  onSave: (save: CopySheetSave, goNext: boolean) => void;
  onDeletePage: (page: CopyPageView) => void;
}

/**
 * Copie d'un élève : pages déjà enregistrées (envoyées ou en attente), pages qui viennent
 * d'être scannées (à relire : déplacer, reprendre, supprimer, compléter), et les trois
 * réglages utiles au correcteur — version du sujet, version adaptée, copie déjà annotée.
 * Rien ne part tant que le prof n'a pas validé.
 */
export function CopySheet({
  status,
  initialDraft,
  knownVersions,
  defaultVersion,
  nextStudentName,
  onClose,
  onSave,
  onDeletePage,
}: CopySheetProps) {
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [adapted, setAdapted] = useState(false);
  const [annotated, setAnnotated] = useState(false);
  const [customVersion, setCustomVersion] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const studentId = status?.student.id ?? null;

  useEffect(() => {
    if (!status) return;
    setDraft(initialDraft);
    // Une copie neuve reprend la dernière version saisie (on scanne souvent une pile v5 d'affilée).
    setVersion(status.subjectVersion ?? (status.pages.length === 0 ? defaultVersion : null));
    setAdapted(status.isAdapted);
    setAnnotated(status.copyAnnotated);
    setCustomVersion(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, initialDraft]);

  // URL signées des pages déjà envoyées (les pages en attente s'affichent depuis le téléphone).
  useEffect(() => {
    if (!status) return;
    let cancelled = false;
    const missing = status.pages.filter((p) => p.uploaded && !urls[p.pageId]);
    if (missing.length === 0) return;
    Promise.all(
      missing.map(async (p) => [p.pageId, await getCopyPageUrl(p.storagePath)] as const)
    ).then((entries) => {
      if (cancelled) return;
      setUrls((prev) => {
        const next = { ...prev };
        for (const [id, url] of entries) if (url) next[id] = url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.pages]);

  if (!status) return null;

  const scanAndPrepare = async (limit: number): Promise<string[]> => {
    setBusy(true);
    try {
      const raw = await scanPages(limit);
      const prepared = [];
      for (const uri of raw) prepared.push((await preparePage(uri)).uri);
      return prepared;
    } catch (err) {
      Alert.alert('Scan impossible', err instanceof Error ? err.message : 'Réessaie.');
      return [];
    } finally {
      setBusy(false);
    }
  };

  const addPages = async () => {
    const pages = await scanAndPrepare(8);
    if (pages.length > 0) setDraft((d) => [...d, ...pages]);
  };

  const retake = async (index: number) => {
    const pages = await scanAndPrepare(1);
    if (pages[0]) setDraft((d) => d.map((u, i) => (i === index ? pages[0] : u)));
  };

  const move = (index: number, delta: -1 | 1) => {
    setDraft((d) => {
      const target = index + delta;
      if (target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const confirmDeleteExisting = (page: CopyPageView) => {
    Alert.alert(
      `Supprimer la page ${page.pageOrder} ?`,
      page.uploaded ? 'Elle sera aussi effacée du serveur.' : 'Elle n’a pas encore été envoyée.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => onDeletePage(page) },
      ]
    );
  };

  const changedInfo = (): CopyInfo => {
    const info: CopyInfo = {};
    if (version !== status.subjectVersion) info.subjectVersion = version;
    if (adapted !== status.isAdapted) info.isAdapted = adapted;
    if (annotated !== status.copyAnnotated) info.copyAnnotated = annotated;
    // Une copie rendue n'est plus celle d'un absent.
    if (status.absent && draft.length > 0) info.status = 'noted';
    return info;
  };

  // Des pages scannées non validées ne se perdent jamais sur un geste malheureux.
  const requestClose = () => {
    if (draft.length === 0) return onClose();
    Alert.alert(
      `Abandonner ${draft.length > 1 ? `les ${draft.length} pages scannées` : 'la page scannée'} ?`,
      'Elles ne seront pas enregistrées.',
      [
        { text: 'Garder', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: onClose },
      ]
    );
  };

  const save = (goNext: boolean) => onSave({ pageUris: draft, info: changedInfo() }, goNext);

  const versions = Array.from(
    new Set([...knownVersions, ...(version ? [version] : [])].filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const total = status.pages.length + draft.length;
  const canSave = draft.length > 0 || Object.keys(changedInfo()).length > 0;

  return (
    <BottomSheet visible={!!status} onClose={requestClose} avoidKeyboard>
      <Text style={styles.title}>{status.student.pseudo}</Text>
      <Text style={styles.subtitle}>
        {total} page{total > 1 ? 's' : ''}
        {status.pendingCount > 0 ? ` · ${status.pendingCount} en attente d’envoi` : ''}
        {draft.length > 0 ? ` · ${draft.length} à valider` : ''}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
        {status.pages.map((p) => {
          const uri = p.uploaded ? urls[p.pageId] : p.localPath;
          return (
            <View key={p.pageId} style={styles.thumbWrap}>
              {uri ? (
                <Image source={{ uri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <ActivityIndicator color={theme.colors.textTertiary} />
                </View>
              )}
              <Text style={styles.thumbLabel}>
                p{p.pageOrder}
                {p.uploaded ? ' ✓' : ' ⏳'}
              </Text>
              <Pressable style={styles.thumbDelete} onPress={() => confirmDeleteExisting(p)} hitSlop={8}>
                <X size={14} color={theme.colors.textInverse} strokeWidth={2.5} />
              </Pressable>
            </View>
          );
        })}

        {draft.map((uri, i) => (
          <View key={`${uri}-${i}`} style={[styles.thumbWrap, styles.draftWrap]}>
            <Image source={{ uri }} style={styles.thumb} />
            <Text style={[styles.thumbLabel, styles.draftLabel]}>
              p{status.pages.length + i + 1} · nouvelle
            </Text>
            <View style={styles.draftActions}>
              <Pressable onPress={() => move(i, -1)} hitSlop={6} disabled={i === 0}>
                <ChevronLeft size={20} color={i === 0 ? theme.colors.border : theme.colors.text} />
              </Pressable>
              <Pressable onPress={() => retake(i)} hitSlop={6}>
                <RotateCcw size={18} color={theme.colors.text} />
              </Pressable>
              <Pressable onPress={() => move(i, 1)} hitSlop={6} disabled={i === draft.length - 1}>
                <ChevronRight
                  size={20}
                  color={i === draft.length - 1 ? theme.colors.border : theme.colors.text}
                />
              </Pressable>
            </View>
            <Pressable
              style={styles.thumbDelete}
              onPress={() => setDraft((d) => d.filter((_, j) => j !== i))}
              hitSlop={8}
            >
              <X size={14} color={theme.colors.textInverse} strokeWidth={2.5} />
            </Pressable>
          </View>
        ))}

        <Pressable style={[styles.thumb, styles.addTile]} onPress={addPages} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <>
              <Plus size={22} color={theme.colors.primary} />
              <Text style={styles.addTileText}>{total === 0 ? 'Scanner' : 'Pages'}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Text style={styles.sectionLabel}>Version du sujet</Text>
      <View style={styles.chips}>
        <Chip label="—" active={version === null} onPress={() => setVersion(null)} />
        {versions.map((v) => (
          <Chip key={v} label={v} active={version === v} onPress={() => setVersion(v)} />
        ))}
        {customVersion === null ? (
          <Chip label="+" active={false} onPress={() => setCustomVersion('v')} />
        ) : (
          <TextInput
            style={styles.versionInput}
            value={customVersion}
            onChangeText={setCustomVersion}
            autoFocus
            autoCapitalize="none"
            maxLength={12}
            onSubmitEditing={() => {
              const v = customVersion.trim();
              if (v) setVersion(v);
              setCustomVersion(null);
            }}
            onBlur={() => {
              const v = customVersion.trim();
              if (v && v !== 'v') setVersion(v);
              setCustomVersion(null);
            }}
          />
        )}
      </View>

      <View style={styles.toggles}>
        <Toggle label="Version adaptée" value={adapted} onPress={() => setAdapted((x) => !x)} />
        <Toggle label="Déjà annotée par moi" value={annotated} onPress={() => setAnnotated((x) => !x)} />
      </View>

      {nextStudentName && draft.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => save(true)}
        >
          <Text style={styles.primaryText}>Valider · suivant : {nextStudentName}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={({ pressed }) => [
          nextStudentName && draft.length > 0 ? styles.secondary : styles.primary,
          !canSave && styles.disabled,
          pressed && styles.pressed,
        ]}
        onPress={() => save(false)}
        disabled={!canSave}
      >
        <Text style={nextStudentName && draft.length > 0 ? styles.secondaryText : styles.primaryText}>
          {draft.length > 0 ? 'Valider la copie' : 'Enregistrer'}
        </Text>
      </Pressable>
      <Pressable style={styles.cancel} onPress={requestClose}>
        <Text style={styles.cancelText}>{draft.length > 0 ? 'Abandonner ces pages' : 'Fermer'}</Text>
      </Pressable>
    </BottomSheet>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, value, onPress }: { label: string; value: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.toggle, value && styles.toggleOn]} onPress={onPress}>
      <View style={[styles.checkbox, value && styles.checkboxOn]}>
        {value && <Check size={13} color={theme.colors.textInverse} strokeWidth={3} />}
      </View>
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 2,
    marginBottom: theme.spacing.md,
  },
  thumbs: { marginBottom: theme.spacing.md, flexGrow: 0 },
  thumbWrap: { marginRight: theme.spacing.sm, position: 'relative', alignItems: 'center' },
  draftWrap: {},
  thumb: { width: 96, height: 132, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceSecondary },
  thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  thumbLabel: { fontFamily: theme.fonts.bodyMedium, fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 },
  draftLabel: { color: theme.colors.primary },
  draftActions: { flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'center' },
  thumbDelete: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addTile: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.primarySoft,
    gap: 4,
  },
  addTileText: { fontFamily: theme.fonts.bodySemibold, fontSize: 12, color: theme.colors.primary },
  sectionLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: theme.spacing.md },
  chip: {
    minWidth: 40,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontFamily: theme.fonts.bodySemibold, fontSize: 13, color: theme.colors.text },
  chipTextActive: { color: theme.colors.textInverse },
  versionInput: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.text,
  },
  toggles: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toggleText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 13, color: theme.colors.text },
  primary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  primaryText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
  secondary: {
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.text },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.9 },
  cancel: { alignItems: 'center', paddingVertical: theme.spacing.md },
  cancelText: { fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.textSecondary },
});
