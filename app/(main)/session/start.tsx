import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Play } from 'lucide-react-native';
import {
  useAuthStore,
  useClassStore,
  useRoomStore,
  useSessionStore,
} from '../../../stores';
import { theme } from '../../../constants/theme';
import { LessonNoteBanner } from '../../../components/LessonNoteBanner';
import { Class, Room } from '../../../types';

export default function StartSessionScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses, isLoading: classesLoading } = useClassStore();
  const { rooms, loadRooms, isLoading: roomsLoading } = useRoomStore();
  const { startSession, isLoading: sessionLoading, loadActiveSession } = useSessionStore();

  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [topic, setTopic] = useState('');
  // Instant de référence pour la note de cours (figé à l'ouverture de l'écran)
  const [startedAt, setStartedAt] = useState(() => new Date());

  // Reset selections and reload data each time screen gets focus
  useFocusEffect(
    useCallback(() => {
      setSelectedClass(null);
      setSelectedRoom(null);
      setTopic('');
      setStartedAt(new Date());
      if (user?.id) {
        loadClasses(user.id);
        loadRooms(user.id);
        loadActiveSession(user.id);
      }
    }, [user?.id, loadClasses, loadRooms, loadActiveSession])
  );

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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header : back chevron + titre */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
          hitSlop={8}
        >
          <ChevronLeft size={22} color={theme.colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Nouvelle séance</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* 1 · Choisir une classe */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>1 · CHOISIR UNE CLASSE</Text>
          {classesLoading ? (
            <View style={styles.loadingSection}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : classes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucune classe disponible</Text>
              <Pressable style={styles.linkButton} onPress={() => router.push('/(main)/')}>
                <Text style={styles.linkButtonText}>Synchroniser les classes</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.classTilesRow}>
              {classes.map((cls) => {
                const isSelected = selectedClass?.id === cls.id;
                return (
                  <Pressable
                    key={cls.id}
                    style={({ pressed }) => [
                      styles.classTile,
                      isSelected && styles.classTileSelected,
                      pressed && !isSelected && styles.classTilePressed,
                    ]}
                    onPress={() => {
                      setSelectedClass(isSelected ? null : cls);
                    }}
                  >
                    <Text
                      style={[styles.classTileText, isSelected && styles.classTileTextSelected]}
                      numberOfLines={1}
                    >
                      {cls.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {/* Note écrite depuis l'accueil web pour le cours qui commence */}
          {selectedClass && <LessonNoteBanner classId={selectedClass.id} at={startedAt} compact />}
        </View>

        {/* 2 · Choisir une salle */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>2 · CHOISIR UNE SALLE</Text>
          {roomsLoading ? (
            <View style={styles.loadingSection}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : rooms.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Aucune salle configurée</Text>
              <Pressable style={styles.linkButton} onPress={() => router.push('/(main)/rooms')}>
                <Text style={styles.linkButtonText}>Configurer une salle</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.roomList}>
              {rooms.map((room, index) => {
                const isSelected = selectedRoom?.id === room.id;
                return (
                  <Pressable
                    key={room.id}
                    style={({ pressed }) => [
                      styles.roomRow,
                      index < rooms.length - 1 && styles.roomRowBorder,
                      isSelected && styles.roomRowSelected,
                      pressed && !isSelected && styles.roomRowPressed,
                    ]}
                    onPress={() => setSelectedRoom(room)}
                  >
                    <View style={styles.roomInfo}>
                      <Text
                        style={[styles.roomName, isSelected && styles.roomNameSelected]}
                      >
                        {room.name}
                      </Text>
                      <Text style={styles.roomDetail}>
                        {room.grid_rows} × {room.grid_cols} places
                      </Text>
                    </View>
                    {isSelected && (
                      <View style={styles.checkmarkContainer}>
                        <Check size={14} color={theme.colors.textInverse} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* 3 · Theme */}
        <View style={styles.section}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>3 · THÈME DE LA SÉANCE</Text>
            <Text style={styles.optionalBadge}>Optionnel</Text>
          </View>
          <View style={styles.topicInputContainer}>
            <TextInput
              style={styles.topicInput}
              placeholder="Ex : Chapitre 3 - Les fonctions linéaires..."
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

      {/* Footer */}
      <View style={styles.footer}>
        {selectedClass && selectedRoom && (
          <Text style={styles.selectionSummary}>
            {selectedClass.name} · {selectedRoom.name}
          </Text>
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
          {sessionLoading ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <>
              <Play
                size={17}
                color={canStart ? theme.colors.textInverse : theme.colors.textTertiary}
                fill={canStart ? theme.colors.textInverse : theme.colors.textTertiary}
                strokeWidth={0}
              />
              <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>
                {canStart ? 'Démarrer la séance' : 'Sélectionnez une classe et une salle'}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  headerTitle: {
    flex: 1,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 19,
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 38,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  section: {
    marginBottom: theme.spacing.xl,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm + 2,
  },
  loadingSection: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
    marginBottom: theme.spacing.md,
  },
  linkButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  linkButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.primary,
    fontSize: 15,
  },

  // Classes en tuiles
  classTilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  classTile: {
    flexGrow: 1,
    flexBasis: '22%',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
  },
  classTilePressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  classTileSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  classTileText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  classTileTextSelected: {
    color: theme.colors.textInverse,
  },

  // Salles en liste
  roomList: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: theme.spacing.md,
  },
  roomRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  roomRowSelected: {
    backgroundColor: theme.colors.primarySoft,
  },
  roomRowPressed: {
    backgroundColor: theme.colors.surfaceHover,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  roomNameSelected: {
    color: theme.colors.primary,
  },
  roomDetail: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textTertiary,
    marginTop: 1,
  },
  checkmarkContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionalBadge: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm + 2,
  },
  topicInputContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: theme.spacing.md,
  },
  topicInput: {
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  topicCharCount: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    color: theme.colors.textTertiary,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },

  // Footer
  footer: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  selectionSummary: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm + 2,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.action,
    borderRadius: 12,
    paddingVertical: 16,
  },
  startButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  startButtonDisabled: {
    backgroundColor: theme.colors.segmentTrack,
  },
  startButtonText: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.textInverse,
    fontSize: 16,
  },
  startButtonTextDisabled: {
    color: theme.colors.textTertiary,
  },
});
