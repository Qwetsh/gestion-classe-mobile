import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, FileText, Plus, CloudOff } from 'lucide-react-native';
import { useAuthStore } from '../../../stores';
import { useAssessmentStore } from '../../../stores/assessmentStore';
import { setActiveForSession } from '../../../services/copies/localCache';
import { theme } from '../../../constants/theme';
import { OfflineIndicator } from '../../../components';
import type { WrittenAssessment } from '../../../types';

const BAREMES = [10, 20, 30, 40];

function isToday(date: string | null): boolean {
  if (!date) return false;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return date.slice(0, 10) === today;
}

function formatDate(date: string | null): string {
  if (!date) return 'sans date';
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Choix de l'éval dont on scanne les copies, depuis la séance.
 * L'éval de la séance (ou du jour) est mise en avant ; on peut en créer une, même hors ligne.
 * Le choix est retenu pour la séance : le bouton « Copies » et le menu radial y mènent ensuite
 * directement.
 */
export default function ChooseAssessmentScreen() {
  const params = useLocalSearchParams<{ classId: string; className?: string; sessionId?: string }>();
  const { classId } = params;
  const sessionId = params.sessionId || null;

  const { user } = useAuthStore();
  const { assessments, isLoading, loadAssessments, createAssessment } = useAssessmentStore();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [bareme, setBareme] = useState(20);

  useFocusEffect(
    useCallback(() => {
      if (user?.id && classId) loadAssessments(user.id, classId);
    }, [user?.id, classId, loadAssessments])
  );

  const list = useMemo(() => {
    const rank = (a: WrittenAssessment) =>
      sessionId && a.session_id === sessionId ? 0 : isToday(a.date) ? 1 : 2;
    return [...assessments].sort((a, b) => rank(a) - rank(b));
  }, [assessments, sessionId]);

  const choose = async (a: WrittenAssessment) => {
    if (sessionId) {
      await setActiveForSession(sessionId, { assessmentId: a.id, classId: a.class_id, name: a.name });
    }
    router.replace(
      `/(main)/assessments/scan?assessmentId=${a.id}&classId=${a.class_id}&name=${encodeURIComponent(a.name)}`
    );
  };

  const handleCreate = async () => {
    if (!user?.id || !classId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Nom requis', 'Ex. « Éval Nutrition ».');
      return;
    }
    const created = await createAssessment({
      userId: user.id,
      classId,
      name: trimmed,
      baremeTotal: bareme,
      sessionId,
    });
    setCreating(false);
    setName('');
    await choose(created);
  };

  const renderItem = ({ item }: { item: WrittenAssessment }) => {
    const highlighted = (sessionId && item.session_id === sessionId) || isToday(item.date);
    return (
      <Pressable
        style={({ pressed }) => [styles.card, highlighted && styles.cardHighlighted, pressed && styles.pressed]}
        onPress={() => choose(item)}
      >
        <FileText size={22} color={highlighted ? theme.colors.primary : theme.colors.textSecondary} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {item.series_name ?? item.name}
          </Text>
          <Text style={styles.cardMeta}>
            {formatDate(item.date)} · /{item.bareme_total}
            {item.period ? ` · T${item.period}` : ''}
            {item.published_to_students ? ' · publiée' : ''}
          </Text>
        </View>
        {item.is_pending ? <CloudOff size={16} color={theme.colors.warning} /> : null}
        {highlighted ? <Text style={styles.badge}>{item.session_id === sessionId ? 'Séance' : 'Aujourd’hui'}</Text> : null}
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <OfflineIndicator />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} hitSlop={12}>
          <ChevronLeft size={26} color={theme.colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Copies</Text>
          <Text style={styles.subtitle}>{params.className ? `${params.className} · ` : ''}quelle éval scanner ?</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {creating ? (
          <View style={styles.form}>
            <Text style={styles.label}>Nom de l’éval</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Éval Nutrition"
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Text style={styles.label}>Barème</Text>
            <View style={styles.chips}>
              {BAREMES.map((b) => (
                <Pressable
                  key={b}
                  style={[styles.chip, bareme === b && styles.chipActive]}
                  onPress={() => setBareme(b)}
                >
                  <Text style={[styles.chipText, bareme === b && styles.chipTextActive]}>/{b}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.formHint}>
              Datée d’aujourd’hui, rattachée à la séance. Le reste (coefficient, série…) se règle sur le web.
            </Text>
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={handleCreate}>
              <Text style={styles.primaryText}>Créer et scanner</Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setCreating(false)}>
              <Text style={styles.cancelText}>Annuler</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={list}
            renderItem={renderItem}
            keyExtractor={(a) => a.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <Pressable style={({ pressed }) => [styles.newCard, pressed && styles.pressed]} onPress={() => setCreating(true)}>
                <Plus size={20} color={theme.colors.primary} />
                <Text style={styles.newText}>Nouvelle éval</Text>
              </Pressable>
            }
            ListEmptyComponent={
              isLoading ? (
                <ActivityIndicator style={{ marginTop: theme.spacing.xl }} color={theme.colors.primary} />
              ) : (
                <Text style={styles.empty}>Aucune éval écrite pour cette classe.</Text>
              )
            }
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

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
  title: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.text },
  subtitle: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  list: { padding: theme.spacing.md },
  newCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.primarySoft,
    marginBottom: theme.spacing.md,
  },
  newText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.primary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  cardHighlighted: { borderColor: theme.colors.primary },
  cardInfo: { flex: 1 },
  cardName: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.text },
  cardMeta: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textSecondary, marginTop: 2 },
  badge: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 11,
    color: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.85 },
  empty: { fontFamily: theme.fonts.body, color: theme.colors.textSecondary, textAlign: 'center', marginTop: theme.spacing.lg },
  form: { padding: theme.spacing.md },
  label: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  chips: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontFamily: theme.fonts.bodySemibold, fontSize: 14, color: theme.colors.text },
  chipTextActive: { color: theme.colors.textInverse },
  formHint: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textTertiary, marginBottom: theme.spacing.md },
  primary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
  cancel: { alignItems: 'center', paddingVertical: theme.spacing.md },
  cancelText: { fontFamily: theme.fonts.bodyMedium, fontSize: 14, color: theme.colors.textSecondary },
});
