import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  useAuthStore,
  useClassStore,
  useStudentStore,
  useRoomStore,
  usePlanStore,
  StudentWithMapping,
} from '../../../../stores';
import { theme } from '../../../../constants/theme';
import { getStudentAtPosition } from '../../../../services/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PlanEditorScreen() {
  const { classId, roomId } = useLocalSearchParams<{ classId: string; roomId: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { loadClassById, currentClass } = useClassStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const { loadRoomById, currentRoom } = useRoomStore();

  // Get students for this class
  const students: StudentWithMapping[] = classId ? studentsByClass[classId] || [] : [];
  const {
    currentPlan,
    isLoading,
    loadPlan,
    setStudentPosition,
    removeStudentFromPlan,
    clearAllPositions,
  } = usePlanStore();

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      if (!classId || !roomId || !user?.id) return;

      setIsInitializing(true);
      await Promise.all([
        loadClassById(classId),
        loadRoomById(roomId),
        loadStudentsForClass(classId),
        loadPlan(classId, roomId),
      ]);
      setIsInitializing(false);
    };

    loadData();
  }, [classId, roomId, user?.id]);

  // Helper to get display name
  const getDisplayName = (student: StudentWithMapping): string => {
    return student.fullName || student.pseudo;
  };

  // Get students not yet placed
  const unplacedStudents = students.filter((s) => {
    if (!currentPlan) return true;
    const positions = currentPlan.positions;
    return !Object.values(positions).includes(s.id);
  });

  // Handle cell press
  const handleCellPress = async (row: number, col: number) => {
    if (!currentPlan || !currentRoom) return;

    // Check if cell is disabled
    let disabledCells: string[] = [];
    try {
      disabledCells = currentRoom.disabled_cells
        ? JSON.parse(currentRoom.disabled_cells)
        : [];
    } catch {
      disabledCells = [];
    }
    const isDisabled = disabledCells.includes(`${row},${col}`);
    if (isDisabled) return;

    const studentAtPosition = getStudentAtPosition(currentPlan.positions, row, col);

    if (studentAtPosition) {
      // Cell is occupied - ask to remove
      const student = students.find((s) => s.id === studentAtPosition);
      Alert.alert(
        'Place occupee',
        `${student ? getDisplayName(student) : 'Eleve'} est a cette place.\n\nQue voulez-vous faire ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Retirer',
            style: 'destructive',
            onPress: () => removeStudentFromPlan(studentAtPosition),
          },
        ]
      );
    } else if (selectedStudent) {
      // Place the selected student
      await setStudentPosition(selectedStudent, row, col);
      setSelectedStudent(null);
    }
  };

  // Handle student selection from unplaced list
  const handleStudentSelect = (studentId: string) => {
    if (selectedStudent === studentId) {
      setSelectedStudent(null);
    } else {
      setSelectedStudent(studentId);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    Alert.alert(
      'Reinitialiser le plan',
      'Voulez-vous retirer tous les eleves du plan ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Reinitialiser',
          style: 'destructive',
          onPress: clearAllPositions,
        },
      ]
    );
  };

  // Render the grid
  const renderGrid = () => {
    if (!currentRoom || !currentPlan) return null;

    const { grid_rows, grid_cols } = currentRoom;
    const cellSize = Math.min(
      (SCREEN_WIDTH - theme.spacing.lg * 2 - theme.spacing.md * 2) / grid_cols,
      50
    );

    // Parse disabled cells
    let disabledCells: string[] = [];
    try {
      disabledCells = currentRoom.disabled_cells
        ? JSON.parse(currentRoom.disabled_cells)
        : [];
    } catch {
      disabledCells = [];
    }
    const isDisabled = (row: number, col: number) => disabledCells.includes(`${row},${col}`);

    const rows = [];
    for (let r = 0; r < grid_rows; r++) {
      const cells = [];
      for (let c = 0; c < grid_cols; c++) {
        const disabled = isDisabled(r, c);
        const studentId = getStudentAtPosition(currentPlan.positions, r, c);
        const student = studentId ? students.find((s) => s.id === studentId) : null;

        cells.push(
          <Pressable
            key={`${r}-${c}`}
            style={[
              styles.gridCell,
              { width: cellSize, height: cellSize },
              disabled && styles.gridCellDisabled,
              student && styles.gridCellOccupied,
              selectedStudent && !student && !disabled && styles.gridCellAvailable,
            ]}
            onPress={() => handleCellPress(r, c)}
            disabled={disabled}
          >
            {student ? (
              <Text style={styles.cellText} numberOfLines={2}>
                {getDisplayName(student)}
              </Text>
            ) : null}
          </Pressable>
        );
      }
      rows.push(
        <View key={r} style={styles.gridRow}>
          {cells}
        </View>
      );
    }

    // Count placed students
    const placedCount = students.length - unplacedStudents.length;

    return (
      <View style={styles.gridWrapper}>
        <View style={styles.teacherArea}>
          <Text style={styles.teacherText}>Tableau</Text>
        </View>
        <View style={styles.gridContainer}>{rows}</View>
        <View style={styles.gridStats}>
          <Text style={styles.gridStatsText}>
            {placedCount} / {students.length} eleves places
          </Text>
        </View>
      </View>
    );
  };

  if (isInitializing) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement du plan...</Text>
      </SafeAreaView>
    );
  }

  if (!currentClass || !currentRoom) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top']}>
        <View style={styles.errorCard}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorText}>Donnees introuvables</Text>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Plan - ${currentRoom.name}`,
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
          headerRight: () => (
            <Pressable
              style={styles.clearButton}
              onPress={handleClearAll}
            >
              <Text style={styles.clearButtonText}>Reinitialiser</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {/* Header info */}
        <View style={styles.header}>
          <View style={[styles.headerIconContainer, { backgroundColor: theme.colors.primarySoft }]}>
            <Text style={styles.headerIcon}>📐</Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.className}>{currentClass.name}</Text>
            <Text style={styles.subtitle}>
              Appuyez sur un eleve, puis sur une place
            </Text>
          </View>
        </View>

        {/* Grid */}
        <ScrollView
          style={styles.gridScroll}
          contentContainerStyle={styles.gridScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {renderGrid()}
        </ScrollView>

        {/* Unplaced students */}
        <View style={[styles.unplacedSection, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) + theme.spacing.md }]}>
          <Text style={styles.unplacedTitle}>
            {selectedStudent
              ? '👆 Appuyez sur une place libre'
              : unplacedStudents.length > 0
              ? `👥 Eleves a placer (${unplacedStudents.length})`
              : '✓ Tous les eleves sont places'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.unplacedList}
          >
            {unplacedStudents.map((student) => (
              <Pressable
                key={student.id}
                style={[
                  styles.unplacedStudent,
                  selectedStudent === student.id && styles.unplacedStudentSelected,
                ]}
                onPress={() => handleStudentSelect(student.id)}
              >
                <Text
                  style={[
                    styles.unplacedStudentText,
                    selectedStudent === student.id && styles.unplacedStudentTextSelected,
                  ]}
                  numberOfLines={1}
                >
                  {getDisplayName(student)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  errorCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
  },
  backLink: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.lg,
  },
  backLinkText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
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
  clearButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  clearButtonText: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '500',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  headerIconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerInfo: {
    flex: 1,
  },
  className: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },

  // Grid
  gridScroll: {
    flex: 1,
  },
  gridScrollContent: {
    padding: theme.spacing.lg,
    paddingTop: 0,
    alignItems: 'center',
  },
  gridWrapper: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  teacherArea: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  teacherText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  gridContainer: {
    alignItems: 'center',
  },
  gridRow: {
    flexDirection: 'row',
  },
  gridCell: {
    margin: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  gridCellDisabled: {
    backgroundColor: theme.colors.border,
    borderColor: theme.colors.border,
    opacity: 0.4,
  },
  gridCellOccupied: {
    backgroundColor: theme.colors.participationSoft,
    borderColor: theme.colors.participation,
  },
  gridCellAvailable: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
  },
  cellText: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    padding: 2,
  },
  gridStats: {
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  gridStatsText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },

  // Unplaced students
  unplacedSection: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    ...theme.shadows.md,
  },
  unplacedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  unplacedList: {
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  unplacedStudent: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
  },
  unplacedStudentSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  unplacedStudentText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  unplacedStudentTextSelected: {
    color: theme.colors.textInverse,
    fontWeight: '600',
  },

  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
