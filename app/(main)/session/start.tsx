import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAuthStore,
  useClassStore,
  useRoomStore,
  useSessionStore,
} from '../../../stores';
import { theme } from '../../../constants/theme';
import { Class, Room } from '../../../types';

export default function StartSessionScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses, isLoading: classesLoading } = useClassStore();
  const { rooms, loadRooms, isLoading: roomsLoading } = useRoomStore();
  const { startSession, isLoading: sessionLoading, loadActiveSession } = useSessionStore();

  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [topic, setTopic] = useState('');

  // Reset selections and reload data each time screen gets focus
  useFocusEffect(
    useCallback(() => {
      setSelectedClass(null);
      setSelectedRoom(null);
      setTopic('');
      if (user?.id) {
        loadClasses(user.id);
        loadRooms(user.id);
        loadActiveSession(user.id);
      }
    }, [user?.id, loadClasses, loadRooms, loadActiveSession])
  );

  // Memoize displayed classes to avoid recalculation on each render
  const displayedClasses = useMemo(() => {
    return selectedClass ? classes.filter(c => c.id === selectedClass.id) : classes;
  }, [selectedClass, classes]);

  const handleStartSession = async () => {
    if (!user?.id || !selectedClass || !selectedRoom) return;

    try {
      const session = await startSession(user.id, selectedClass.id, selectedRoom.id, topic || null);
      router.replace(`/(main)/session/${session.id}`);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const canStart = selectedClass && selectedRoom && !sessionLoading;

  const getClassColor = (index: number) => {
    const colors = [
      theme.colors.primarySoft,
      theme.colors.participationSoft,
      theme.colors.sortieSoft,
      theme.colors.remarqueSoft,
      theme.colors.bavardageSoft,
    ];
    return colors[index % colors.length];
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Nouvelle séance',
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
        }}
      />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Class Selection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.primarySoft }]}>
                <Text style={styles.sectionIcon}>📚</Text>
              </View>
              <Text style={styles.sectionTitle}>Choisir une classe</Text>
            </View>
            {classesLoading ? (
              <View style={styles.loadingSection}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : classes.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📚</Text>
                <Text style={styles.emptyText}>Aucune classe disponible</Text>
                <Pressable
                  style={styles.linkButton}
                  onPress={() => router.push('/(main)/')}
                >
                  <Text style={styles.linkButtonText}>Synchroniser les classes</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.optionsList}>
                {displayedClasses.map((cls, index) => (
                  <Pressable
                    key={cls.id}
                    style={({ pressed }) => [
                      styles.optionCard,
                      selectedClass?.id === cls.id && styles.optionCardSelected,
                      pressed && styles.optionCardPressed,
                    ]}
                    onPress={() => {
                      if (selectedClass?.id === cls.id) {
                        setSelectedClass(null);
                        setSelectedRoom(null);
                      } else {
                        setSelectedClass(cls);
                      }
                    }}
                  >
                    <View style={[styles.optionIconContainer, { backgroundColor: getClassColor(index) }]}>
                      <Text style={styles.optionIconText}>{cls.name.substring(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text
                        style={[
                          styles.optionName,
                          selectedClass?.id === cls.id && styles.optionNameSelected,
                        ]}
                      >
                        {cls.name}
                      </Text>
                    </View>
                    {selectedClass?.id === cls.id ? (
                      <View style={styles.changeButton}>
                        <Text style={styles.changeButtonText}>Changer</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Room Selection */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.sortieSoft }]}>
                <Text style={styles.sectionIcon}>🏫</Text>
              </View>
              <Text style={styles.sectionTitle}>Choisir une salle</Text>
            </View>
            {roomsLoading ? (
              <View style={styles.loadingSection}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : rooms.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🏫</Text>
                <Text style={styles.emptyText}>Aucune salle configurée</Text>
                <Pressable
                  style={styles.linkButton}
                  onPress={() => router.push('/(main)/rooms')}
                >
                  <Text style={styles.linkButtonText}>Configurer une salle</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.optionsList}>
                {rooms.map((room, index) => (
                  <Pressable
                    key={room.id}
                    style={({ pressed }) => [
                      styles.optionCard,
                      selectedRoom?.id === room.id && styles.optionCardSelected,
                      pressed && styles.optionCardPressed,
                    ]}
                    onPress={() => setSelectedRoom(room)}
                  >
                    <View style={[styles.optionIconContainer, { backgroundColor: theme.colors.sortieSoft }]}>
                      <Text style={styles.optionIconText}>{room.name.substring(0, 2).toUpperCase()}</Text>
                    </View>
                    <View style={styles.optionInfo}>
                      <Text
                        style={[
                          styles.optionName,
                          selectedRoom?.id === room.id && styles.optionNameSelected,
                        ]}
                      >
                        {room.name}
                      </Text>
                      <Text style={styles.optionDetail}>
                        {room.grid_rows} x {room.grid_cols} places
                      </Text>
                    </View>
                    {selectedRoom?.id === room.id && (
                      <View style={styles.checkmarkContainer}>
                        <Text style={styles.checkmark}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Topic/Theme Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.remarqueSoft }]}>
                <Text style={styles.sectionIcon}>📝</Text>
              </View>
              <Text style={styles.sectionTitle}>Thème de la séance</Text>
              <Text style={styles.optionalBadge}>Optionnel</Text>
            </View>
            <View style={styles.topicInputContainer}>
              <TextInput
                style={styles.topicInput}
                placeholder="Ex: Chapitre 3 - Les fonctions linéaires..."
                placeholderTextColor={theme.colors.textTertiary}
                value={topic}
                onChangeText={setTopic}
                multiline
                numberOfLines={2}
                maxLength={200}
              />
              {topic.length > 0 && (
                <Text style={styles.topicCharCount}>{topic.length}/200</Text>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Start Button */}
        <View style={styles.footer}>
          {selectedClass && selectedRoom && (
            <View style={styles.selectionSummaryCard}>
              <Text style={styles.selectionSummaryLabel}>Sélection</Text>
              <Text style={styles.selectionSummary}>
                {selectedClass.name} • {selectedRoom.name}
              </Text>
            </View>
          )}
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              !canStart && styles.startButtonDisabled,
              pressed && canStart && styles.startButtonPressed,
            ]}
            onPress={handleStartSession}
            disabled={!canStart}
          >
            {canStart ? (
              <LinearGradient
                colors={theme.gradients.success}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.startButtonGradient}
              >
                {sessionLoading ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <>
                    <Text style={styles.startButtonIcon}>▶</Text>
                    <Text style={styles.startButtonText}>Démarrer la séance</Text>
                  </>
                )}
              </LinearGradient>
            ) : (
              <View style={styles.startButtonDisabledInner}>
                <Text style={styles.startButtonIcon}>▶</Text>
                <Text style={styles.startButtonTextDisabled}>Sélectionnez une classe et une salle</Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  sectionIcon: {
    fontSize: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  loadingSection: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: theme.spacing.md,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginBottom: theme.spacing.md,
  },
  linkButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  linkButtonText: {
    color: theme.colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  optionsList: {
    gap: theme.spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  optionCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  optionCardSelected: {
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  optionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  optionIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
  },
  optionInfo: {
    flex: 1,
  },
  optionName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  optionNameSelected: {
    color: theme.colors.primary,
    fontWeight: '700',
  },
  optionDetail: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  checkmarkContainer: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textInverse,
  },
  changeButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  footer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.md,
  },
  selectionSummaryCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  selectionSummaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  selectionSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  startButton: {
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
  },
  startButtonGradient: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  startButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  startButtonDisabled: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  startButtonDisabledInner: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  startButtonIcon: {
    fontSize: 16,
    color: theme.colors.textInverse,
  },
  startButtonText: {
    color: theme.colors.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
  startButtonTextDisabled: {
    color: theme.colors.textTertiary,
    fontSize: 15,
    fontWeight: '500',
  },
  optionalBadge: {
    marginLeft: 'auto',
    fontSize: 12,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
  },
  topicInputContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  topicInput: {
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  topicCharCount: {
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
});
