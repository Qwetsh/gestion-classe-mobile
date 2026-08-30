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
import { router } from 'expo-router';
import { ChevronRight, Mic, Search, Users, X } from 'lucide-react-native';
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
          <Text style={styles.sectionHeaderText}>{item.className}</Text>
          <View style={styles.sectionHeaderCountBadge}>
            <Text style={styles.sectionHeaderCount}>
              {studentsByClass[item.classId!]?.length || 0}
            </Text>
          </View>
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
          {student.fullName ? (
            <Text style={styles.studentPseudo}>{student.pseudo}</Text>
          ) : null}
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
              {score > 0 ? '+' : score < 0 ? '−' : ''}{Math.abs(score)}
            </Text>
          </View>

          {oralGrade !== null && oralGrade !== undefined && (
            <View style={styles.oralBadge}>
              <Mic size={12} color={theme.colors.remarque} strokeWidth={2} />
              <Text style={styles.oralText}>{oralGrade}</Text>
            </View>
          )}
        </View>

        <ChevronRight size={17} color={theme.colors.textTertiary} strokeWidth={1.8} />
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Users size={32} color={theme.colors.primary} strokeWidth={1.7} />
      </View>
      <Text style={styles.placeholderTitle}>
        {searchQuery ? 'Aucun résultat' : 'Aucun élève'}
      </Text>
      <Text style={styles.placeholderText}>
        {searchQuery
          ? 'Aucun élève ne correspond à votre recherche'
          : 'Ajoutez des élèves à vos classes pour les voir ici'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Réunions parents</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={17} color={theme.colors.textTertiary} strokeWidth={1.8} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un élève…"
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} style={styles.clearButton} hitSlop={8}>
              <X size={16} color={theme.colors.textTertiary} strokeWidth={2} />
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
          <Text style={styles.loadingText}>Chargement des élèves...</Text>
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
  screenHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  screenTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 26,
    color: theme.colors.text,
    letterSpacing: -0.3,
  },

  // Search
  searchContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontFamily: theme.fonts.body,
    fontSize: 15,
    color: theme.colors.text,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },

  // Filter
  filterContainer: {
    paddingBottom: theme.spacing.sm,
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
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.text,
    borderColor: theme.colors.text,
  },
  filterChipText: {
    fontFamily: theme.fonts.bodyMedium,
    fontSize: 14,
    color: theme.colors.text,
  },
  filterChipTextActive: {
    fontFamily: theme.fonts.bodySemibold,
    color: theme.colors.textInverse,
  },

  // Error
  errorBanner: {
    backgroundColor: theme.colors.errorSoft,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    borderRadius: 12,
  },
  errorText: {
    fontFamily: theme.fonts.bodyMedium,
    color: theme.colors.error,
    fontSize: 14,
    textAlign: 'center',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
  },

  // List
  list: {
    padding: theme.spacing.lg,
    paddingTop: 0,
  },
  emptyList: {
    flex: 1,
    padding: theme.spacing.lg,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  sectionHeaderText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  sectionHeaderCountBadge: {
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
  },
  sectionHeaderCount: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },

  // Student Card
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  studentCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 15,
    color: theme.colors.text,
  },
  studentPseudo: {
    fontFamily: theme.fonts.body,
    fontSize: 12.5,
    color: theme.colors.textTertiary,
    marginTop: 1,
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
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    minWidth: 40,
    alignItems: 'center',
  },
  scoreBadgePositive: {
    backgroundColor: theme.colors.actionSoft,
  },
  scoreBadgeNegative: {
    backgroundColor: theme.colors.bavardageSoft,
  },
  scoreText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  scoreTextPositive: {
    color: theme.colors.action,
  },
  scoreTextNegative: {
    color: theme.colors.bavardageText,
  },
  oralBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.remarqueSoft,
  },
  oralText: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13,
    color: theme.colors.remarque,
  },

  // Placeholder
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
  },
  placeholderIconContainer: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 20,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  placeholderText: {
    fontFamily: theme.fonts.body,
    color: theme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
