import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  TextInput,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useAuthStore, useClassStore } from '../../../stores';
import { useParentMeetingStore } from '../../../stores/parentMeetingStore';
import { StudentWithMapping } from '../../../stores/studentStore';
import { theme, PERIOD_LABELS_SHORT, Period } from '../../../constants';

export default function ParentMeetingScreen() {
  const { user } = useAuthStore();
  const { classes, loadClasses } = useClassStore();
  const {
    selectedPeriod,
    allStudents,
    studentQuickStats,
    isLoading,
    error,
    setSelectedPeriod,
    loadAllStudents,
    clearError,
  } = useParentMeetingStore();

  const [searchQuery, setSearchQuery] = useState('');

  // Load data on mount
  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
      loadAllStudents(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Reload when period changes
  useEffect(() => {
    if (user?.id) {
      loadAllStudents(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, user?.id]);

  const handleRefresh = useCallback(async () => {
    if (user?.id) {
      await loadAllStudents(user.id);
    }
  }, [user?.id]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    if (!searchQuery) return allStudents;
    const query = searchQuery.toLowerCase();
    return allStudents.filter(s =>
      s.fullName?.toLowerCase().includes(query) ||
      s.pseudo.toLowerCase().includes(query)
    );
  }, [allStudents, searchQuery]);

  // Group students by class
  const studentsByClass = useMemo(() => {
    const grouped: Record<string, StudentWithMapping[]> = {};
    for (const student of filteredStudents) {
      const classId = student.classId;
      if (!grouped[classId]) {
        grouped[classId] = [];
      }
      grouped[classId].push(student);
    }
    return grouped;
  }, [filteredStudents]);

  // Create sections for FlatList
  const sections = useMemo(() => {
    const result: { type: 'header' | 'student'; classId?: string; className?: string; student?: StudentWithMapping }[] = [];

    for (const classId of Object.keys(studentsByClass)) {
      const className = classes.find(c => c.id === classId)?.name || 'Classe inconnue';
      result.push({ type: 'header', classId, className });

      for (const student of studentsByClass[classId]) {
        result.push({ type: 'student', student, classId });
      }
    }

    return result;
  }, [studentsByClass, classes]);

  const handleStudentPress = (student: StudentWithMapping) => {
    router.push({
      pathname: '/(main)/parent-meeting/[studentId]',
      params: { studentId: student.id },
    });
  };

  const handlePeriodChange = (period: Period) => {
    setSelectedPeriod(period);
  };

  const renderItem = ({ item }: { item: typeof sections[0] }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderIcon}>📚</Text>
          <Text style={styles.sectionHeaderText}>{item.className}</Text>
          <Text style={styles.sectionHeaderCount}>
            {studentsByClass[item.classId!]?.length || 0}
          </Text>
        </View>
      );
    }

    const student = item.student!;
    const stats = studentQuickStats[student.id];
    const score = stats?.score ?? 0;
    const oralGrade = stats?.oralGrade;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.studentCard,
          pressed && styles.studentCardPressed,
        ]}
        onPress={() => handleStudentPress(student)}
      >
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>
            {student.fullName || student.pseudo}
          </Text>
          <Text style={styles.studentPseudo}>
            {student.fullName ? student.pseudo : ''}
          </Text>
        </View>

        <View style={styles.studentStats}>
          <View style={[
            styles.scoreBadge,
            score > 0 && styles.scoreBadgePositive,
            score < 0 && styles.scoreBadgeNegative,
          ]}>
            <Text style={[
              styles.scoreText,
              score > 0 && styles.scoreTextPositive,
              score < 0 && styles.scoreTextNegative,
            ]}>
              {score > 0 ? '+' : ''}{score}
            </Text>
          </View>

          {oralGrade !== null && (
            <View style={styles.oralBadge}>
              <Text style={styles.oralText}>🎤 {oralGrade}</Text>
            </View>
          )}
        </View>

        <View style={styles.chevronContainer}>
          <Text style={styles.chevron}>›</Text>
        </View>
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Text style={styles.placeholderEmoji}>👨‍👩‍👧</Text>
      </View>
      <Text style={styles.placeholderTitle}>
        {searchQuery ? 'Aucun resultat' : 'Aucun eleve'}
      </Text>
      <Text style={styles.placeholderText}>
        {searchQuery
          ? 'Aucun eleve ne correspond a votre recherche'
          : 'Ajoutez des eleves a vos classes pour les voir ici'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Reunion Parent-Prof',
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

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un eleve..."
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Period Filter */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {(Object.keys(PERIOD_LABELS_SHORT) as Period[]).map((period) => (
            <Pressable
              key={period}
              style={[
                styles.filterChip,
                selectedPeriod === period && styles.filterChipActive,
              ]}
              onPress={() => handlePeriodChange(period)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedPeriod === period && styles.filterChipTextActive,
                ]}
              >
                {PERIOD_LABELS_SHORT[period]}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Error display */}
      {error && (
        <Pressable style={styles.errorBanner} onPress={clearError}>
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      )}

      {/* Students List */}
      {isLoading && allStudents.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement des eleves...</Text>
        </View>
      ) : (
        <FlatList
          data={sections}
          renderItem={renderItem}
          keyExtractor={(item, index) =>
            item.type === 'header'
              ? `header-${item.classId}`
              : `student-${item.student?.id || index}`
          }
          ListEmptyComponent={renderEmptyList}
          contentContainerStyle={sections.length === 0 ? styles.emptyList : styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={
            sections.length > 0 ? (
              <View style={styles.listHeaderContainer}>
                <Text style={styles.listHeader}>
                  {filteredStudents.length} eleve{filteredStudents.length > 1 ? 's' : ''}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
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

  // Search
  searchContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.sm,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: theme.colors.text,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  clearButtonText: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },

  // Filter
  filterContainer: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterScroll: {
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  filterChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.xs,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: theme.colors.textInverse,
    fontWeight: '600',
  },

  // Error
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // List
  list: {
    padding: theme.spacing.lg,
  },
  emptyList: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  listHeaderContainer: {
    marginBottom: theme.spacing.md,
  },
  listHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  sectionHeaderIcon: {
    fontSize: 18,
    marginRight: theme.spacing.sm,
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  sectionHeaderCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textTertiary,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },

  // Student Card
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  studentCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  studentPseudo: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  studentStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginRight: theme.spacing.sm,
  },
  scoreBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSecondary,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreBadgePositive: {
    backgroundColor: theme.colors.participationSoft,
  },
  scoreBadgeNegative: {
    backgroundColor: theme.colors.bavardageSoft,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  scoreTextPositive: {
    color: theme.colors.participation,
  },
  scoreTextNegative: {
    color: theme.colors.bavardage,
  },
  oralBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.remarqueSoft,
  },
  oralText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.remarque,
  },
  chevronContainer: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    fontWeight: '600',
  },

  // Placeholder
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  placeholderIconContainer: {
    width: 80,
    height: 80,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderEmoji: {
    fontSize: 40,
  },
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
});
