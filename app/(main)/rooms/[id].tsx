import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRoomStore } from '../../../stores';
import { theme } from '../../../constants/theme';

export default function RoomDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    currentRoom,
    isLoading,
    loadRoomById,
  } = useRoomStore();

  // Load room on mount
  useEffect(() => {
    if (id) {
      loadRoomById(id);
    }
  }, [id]);

  // Render grid preview
  const renderGridPreview = () => {
    if (!currentRoom) return null;

    const { grid_rows, grid_cols } = currentRoom;

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
        cells.push(
          <View
            key={`${r}-${c}`}
            style={[
              styles.gridCell,
              disabled && styles.gridCellDisabled,
            ]}
          >
            {!disabled && <View style={styles.gridCellInner} />}
          </View>
        );
      }
      rows.push(
        <View key={r} style={styles.gridRow}>
          {cells}
        </View>
      );
    }

    // Count active cells
    const totalCells = grid_rows * grid_cols;
    const activeCells = totalCells - disabledCells.length;

    return (
      <View style={styles.gridPreviewCard}>
        <View style={styles.teacherArea}>
          <Text style={styles.teacherText}>Tableau</Text>
        </View>
        <View style={styles.gridContainer}>{rows}</View>
        <View style={styles.gridLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
            <Text style={styles.legendText}>{activeCells} places</Text>
          </View>
          {disabledCells.length > 0 && (
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.border }]} />
              <Text style={styles.legendText}>{disabledCells.length} allees</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (isLoading && !currentRoom) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top']}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  if (!currentRoom) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top']}>
        <View style={styles.errorCard}>
          <Text style={styles.errorEmoji}>😕</Text>
          <Text style={styles.errorText}>Salle non trouvee</Text>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: currentRoom.name,
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
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Room Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.sortieSoft }]}>
              <Text style={styles.sectionIcon}>ℹ️</Text>
            </View>
            <Text style={styles.sectionTitle}>Informations</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nom</Text>
              <Text style={styles.infoText}>{currentRoom.name}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Disposition</Text>
              <Text style={styles.infoText}>
                {currentRoom.grid_rows} rangees × {currentRoom.grid_cols} colonnes
              </Text>
            </View>
          </View>
        </View>

        {/* Grid Preview */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconContainer, { backgroundColor: theme.colors.primarySoft }]}>
              <Text style={styles.sectionIcon}>📐</Text>
            </View>
            <Text style={styles.sectionTitle}>Apercu du plan</Text>
          </View>
          {renderGridPreview()}
        </View>

        {/* Info message */}
        <View style={styles.infoMessage}>
          <View style={styles.infoMessageIcon}>
            <Text style={styles.infoMessageEmoji}>💡</Text>
          </View>
          <Text style={styles.infoMessageText}>
            Pour modifier ou supprimer cette salle, utilisez l'application web.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: theme.spacing.lg,
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

  // Sections
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

  // Info Card
  infoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  infoLabel: {
    fontSize: 15,
    color: theme.colors.textSecondary,
  },
  infoText: {
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },

  // Grid Preview
  gridPreviewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
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
    marginBottom: 4,
  },
  gridCell: {
    width: 28,
    height: 28,
    margin: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridCellDisabled: {
    backgroundColor: theme.colors.border,
    opacity: 0.4,
  },
  gridCellInner: {
    width: 20,
    height: 20,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.primary + '30',
  },
  gridLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // Info message
  infoMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.xs,
  },
  infoMessageIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.warningSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  infoMessageEmoji: {
    fontSize: 18,
  },
  infoMessageText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
});
