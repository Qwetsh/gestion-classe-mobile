import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BookOpen, ChevronRight } from 'lucide-react-native';
import { useAuthStore, useClassStore } from '../../../stores';
import { getStudentsByClassId, getSessionsByClassId } from '../../../services/database';
import { theme } from '../../../constants/theme';
import { Class } from '../../../types';

// Couleurs soft tournantes des tuiles (1f)
const TILE_COLORS: { bg: string; text: string }[] = [
  { bg: theme.colors.primarySoft, text: theme.colors.primary },
  { bg: theme.colors.actionSoft, text: theme.colors.action },
  { bg: theme.colors.bavardageSoft, text: theme.colors.bavardageText },
];

interface ClassCounts {
  students: number;
  sessions: number;
}

export default function ClassesListScreen() {
  const { user } = useAuthStore();
  const { classes, isLoading: classesLoading, loadClasses } = useClassStore();
  const [counts, setCounts] = useState<Record<string, ClassCounts>>({});

  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      const result: Record<string, ClassCounts> = {};
      for (const cls of classes) {
        try {
          const [students, sessions] = await Promise.all([
            getStudentsByClassId(cls.id),
            getSessionsByClassId(cls.id),
          ]);
          result[cls.id] = {
            students: students.length,
            sessions: sessions.filter((s) => s.ended_at !== null).length,
          };
        } catch {
          result[cls.id] = { students: 0, sessions: 0 };
        }
      }
      if (!cancelled) setCounts(result);
    };
    if (classes.length > 0) loadCounts();
    return () => {
      cancelled = true;
    };
  }, [classes]);

  const totalStudents = Object.values(counts).reduce((sum, c) => sum + c.students, 0);

  const renderClassItem = ({ item, index }: { item: Class; index: number }) => {
    const tile = TILE_COLORS[index % TILE_COLORS.length];
    const classCounts = counts[item.id];
    return (
      <Pressable
        style={({ pressed }) => [styles.classCard, pressed && styles.classCardPressed]}
        onPress={() => {
          router.push(`/(main)/classes/${item.id}`);
        }}
      >
        <View style={[styles.classTile, { backgroundColor: tile.bg }]}>
          <Text style={[styles.classTileText, { color: tile.text }]} numberOfLines={1}>
            {item.name.length <= 4 ? item.name : item.name.substring(0, 3)}
          </Text>
        </View>
        <View style={styles.classInfo}>
          <Text style={styles.className}>{item.name}</Text>
          <Text style={styles.classMeta}>
            {classCounts
              ? `${classCounts.students} élève${classCounts.students > 1 ? 's' : ''} · ${classCounts.sessions} séance${classCounts.sessions > 1 ? 's' : ''}`
              : '…'}
          </Text>
        </View>
        <ChevronRight size={18} color={theme.colors.textTertiary} strokeWidth={1.8} />
      </Pressable>
    );
  };

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <BookOpen size={32} color={theme.colors.primary} strokeWidth={1.7} />
      </View>
      <Text style={styles.placeholderTitle}>Aucune classe</Text>
      <Text style={styles.placeholderText}>
        Créez vos classes depuis l'application web, puis synchronisez.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Mes classes</Text>
        {classes.length > 0 && (
          <Text style={styles.screenSubtitle}>
            {classes.length} classe{classes.length > 1 ? 's' : ''} · {totalStudents} élève
            {totalStudents > 1 ? 's' : ''}
          </Text>
        )}
      </View>
      <View style={styles.container}>
        {classesLoading && classes.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Chargement des classes...</Text>
          </View>
        ) : (
          <FlatList
            data={classes}
            renderItem={renderClassItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmptyList}
            contentContainerStyle={classes.length === 0 ? styles.emptyList : styles.list}
            showsVerticalScrollIndicator={false}
          />
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
  screenSubtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
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
  list: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  emptyList: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm + 2,
  },
  classCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  classTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  classTileText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 2,
  },
  classMeta: {
    fontFamily: theme.fonts.body,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
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
