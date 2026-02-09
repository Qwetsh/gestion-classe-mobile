import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { useAuthStore, useClassStore } from '../../../stores';
import { theme } from '../../../constants/theme';
import { Class } from '../../../types';

export default function ClassesListScreen() {
  const { user } = useAuthStore();
  const {
    classes,
    isLoading: classesLoading,
    loadClasses,
  } = useClassStore();

  useEffect(() => {
    if (user?.id) {
      loadClasses(user.id);
    }
  }, [user?.id]);

  const renderClassItem = ({ item, index }: { item: Class; index: number }) => (
    <Pressable
      style={({ pressed }) => [
        styles.classCard,
        pressed && styles.classCardPressed,
      ]}
      onPress={() => {
        router.push(`/(main)/classes/${item.id}`);
      }}
    >
      <View style={[styles.classIconContainer, { backgroundColor: getClassColor(index) }]}>
        <Text style={styles.classIconText}>{item.name.substring(0, 2).toUpperCase()}</Text>
      </View>
      <View style={styles.classInfo}>
        <Text style={styles.className}>{item.name}</Text>
        <Text style={styles.classDate}>
          Creee le {new Date(item.createdAt).toLocaleDateString('fr-FR')}
        </Text>
      </View>
      <View style={styles.chevronContainer}>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );

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

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Text style={styles.placeholderEmoji}>📚</Text>
      </View>
      <Text style={styles.placeholderTitle}>Aucune classe</Text>
      <Text style={styles.placeholderText}>
        Creez vos classes depuis l'application web, puis synchronisez.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mes classes',
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
            ListHeaderComponent={
              classes.length > 0 ? (
                <View style={styles.listHeaderContainer}>
                  <Text style={styles.listHeader}>
                    {classes.length} classe{classes.length > 1 ? 's' : ''}
                  </Text>
                </View>
              ) : null
            }
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
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  classCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  classIconContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  classIconText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  classInfo: {
    flex: 1,
  },
  className: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  classDate: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 20,
    color: theme.colors.textTertiary,
    fontWeight: '600',
  },
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
