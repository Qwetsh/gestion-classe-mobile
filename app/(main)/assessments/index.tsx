import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useAuthStore, useClassStore } from '../../../stores';
import { useAssessmentStore } from '../../../stores/assessmentStore';
import { theme } from '../../../constants/theme';
import { OfflineIndicator } from '../../../components';
import type { WrittenAssessment } from '../../../types';

export default function AssessmentsListScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses } = useClassStore();
  const {
    assessments,
    isLoading,
    loadAssessments,
    addAssessment,
    purgeAssessment,
  } = useAssessmentStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bareme, setBareme] = useState('20');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadAssessments(user.id);
      }
    }, [user?.id])
  );

  const classNameById = (classId: string) =>
    classes.find((c) => c.id === classId)?.name ?? 'Classe inconnue';

  const openCreateModal = () => {
    setName('');
    setSubject('');
    setBareme('20');
    setSelectedClassId(classes[0]?.id ?? null);
    setModalVisible(true);
  };

  const handleCreate = async () => {
    if (!user?.id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Nom requis', 'Donne un nom à l’évaluation (ex : "Éval Nutrition").');
      return;
    }
    if (!selectedClassId) {
      Alert.alert('Classe requise', 'Sélectionne une classe pour cette évaluation.');
      return;
    }
    const baremeNum = parseFloat(bareme.replace(',', '.'));

    setSubmitting(true);
    try {
      const created = await addAssessment({
        userId: user.id,
        classId: selectedClassId,
        name: trimmed,
        subject: subject.trim() || null,
        baremeTotal: Number.isFinite(baremeNum) && baremeNum > 0 ? baremeNum : 20,
      });
      setModalVisible(false);
      // Enchaîne direct sur le scan de la nouvelle éval
      router.push(
        `/(main)/assessments/scan?assessmentId=${created.id}&classId=${created.class_id}&name=${encodeURIComponent(created.name)}`
      );
    } catch (err) {
      Alert.alert(
        'Création impossible',
        err instanceof Error ? err.message : 'Réessaie une fois connecté à Internet.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (item: WrittenAssessment) => {
    Alert.alert(
      'Supprimer cette évaluation ?',
      `Toutes les copies scannées de « ${item.name} » seront définitivement effacées (fichiers + données), ce qui libère l’espace de stockage. Action irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const n = await purgeAssessment(item.id);
              Alert.alert(
                'Évaluation supprimée',
                `${n} fichier${n > 1 ? 's' : ''} libéré${n > 1 ? 's' : ''} du stockage.`
              );
            } catch (err) {
              Alert.alert(
                'Suppression impossible',
                err instanceof Error ? err.message : 'Réessaie une fois connecté à Internet.'
              );
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: WrittenAssessment }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        router.push(
          `/(main)/assessments/scan?assessmentId=${item.id}&classId=${item.class_id}&name=${encodeURIComponent(item.name)}`
        )
      }
    >
      <View style={styles.cardIcon}>
        <Text style={styles.cardIconText}>📄</Text>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.name}</Text>
        <Text style={styles.cardMeta}>
          {classNameById(item.class_id)}
          {item.subject ? ` · ${item.subject}` : ''} · /{item.bareme_total}
        </Text>
        <Text style={styles.cardDate}>
          {new Date(item.created_at).toLocaleDateString('fr-FR')}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.trashButton, pressed && styles.trashPressed]}
        onPress={() => handleDelete(item)}
        hitSlop={10}
      >
        <Text style={styles.trashIcon}>🗑️</Text>
      </Pressable>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );

  const renderEmpty = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIcon}>
        <Text style={styles.placeholderEmoji}>📄</Text>
      </View>
      <Text style={styles.placeholderTitle}>Aucune évaluation</Text>
      <Text style={styles.placeholderText}>
        Crée une évaluation, puis scanne les copies de chaque élève. Elles arriveront
        déjà nominées pour la correction.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <OfflineIndicator />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Copies d’éval</Text>
      </View>

      <View style={styles.container}>
        {isLoading && assessments.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Chargement…</Text>
          </View>
        ) : (
          <FlatList
            data={assessments}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmpty}
            contentContainerStyle={
              assessments.length === 0 ? styles.emptyList : styles.list
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={openCreateModal}
      >
        <Text style={styles.fabText}>+ Nouvelle évaluation</Text>
      </Pressable>

      {/* Modal création */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Nouvelle évaluation</Text>

            <Text style={styles.label}>Nom</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Éval Nutrition"
              placeholderTextColor={theme.colors.textTertiary}
            />

            <Text style={styles.label}>Classe</Text>
            {classes.length === 0 ? (
              <Text style={styles.noClasses}>
                Aucune classe. Synchronise d’abord tes classes.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
                {classes.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[
                      styles.chip,
                      selectedClassId === c.id && styles.chipSelected,
                    ]}
                    onPress={() => setSelectedClassId(c.id)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedClassId === c.id && styles.chipTextSelected,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Matière</Text>
                <TextInput
                  style={styles.input}
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="SVT"
                  placeholderTextColor={theme.colors.textTertiary}
                />
              </View>
              <View style={styles.rowItemSmall}>
                <Text style={styles.label}>Barème</Text>
                <TextInput
                  style={styles.input}
                  value={bareme}
                  onChangeText={setBareme}
                  keyboardType="numeric"
                  placeholder="20"
                  placeholderTextColor={theme.colors.textTertiary}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                (submitting || classes.length === 0) && styles.submitDisabled,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleCreate}
              disabled={submitting || classes.length === 0}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.textInverse} />
              ) : (
                <Text style={styles.submitText}>Créer et scanner</Text>
              )}
            </Pressable>

            <Pressable style={styles.modalCancel} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancelText}>Annuler</Text>
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
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: { fontSize: 30, color: theme.colors.text, lineHeight: 30 },
  title: { fontSize: 28, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.5 },

  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: theme.spacing.md, color: theme.colors.textSecondary },

  list: { padding: theme.spacing.lg, paddingBottom: 120 },
  emptyList: { flex: 1, padding: theme.spacing.lg },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  cardPressed: { backgroundColor: theme.colors.surfaceHover, transform: [{ scale: 0.98 }] },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  cardIconText: { fontSize: 24 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  cardMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  cardDate: { fontSize: 12, color: theme.colors.textTertiary, marginTop: 2 },
  trashButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.xs,
  },
  trashPressed: { backgroundColor: theme.colors.errorSoft },
  trashIcon: { fontSize: 18 },
  chevron: { fontSize: 22, color: theme.colors.textTertiary, fontWeight: '600' },

  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  placeholderIcon: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderEmoji: { fontSize: 40 },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  placeholderText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },

  fab: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  fabPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  fabText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl + 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  chipsRow: { marginBottom: theme.spacing.md },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    marginRight: theme.spacing.sm,
  },
  chipSelected: { backgroundColor: theme.colors.primary },
  chipText: { color: theme.colors.text, fontWeight: '600' },
  chipTextSelected: { color: theme.colors.textInverse },
  noClasses: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: theme.spacing.md,
  },
  row: { flexDirection: 'row', gap: theme.spacing.md },
  rowItem: { flex: 1 },
  rowItemSmall: { width: 90 },

  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: theme.colors.textInverse, fontWeight: '700', fontSize: 16 },
  buttonPressed: { opacity: 0.95, transform: [{ scale: 0.99 }] },
  modalCancel: { alignItems: 'center', paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs },
  modalCancelText: { color: theme.colors.textSecondary, fontWeight: '500', fontSize: 15 },
});
