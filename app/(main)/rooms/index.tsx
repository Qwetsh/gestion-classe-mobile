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
import { useAuthStore, useRoomStore } from '../../../stores';
import { theme } from '../../../constants/theme';
import { Room } from '../../../services/database';

export default function RoomsScreen() {
  const { user } = useAuthStore();
  const {
    rooms,
    isLoading,
    loadRooms,
  } = useRoomStore();

  // Load rooms on mount
  useEffect(() => {
    if (user?.id) {
      loadRooms(user.id);
    }
  }, [user?.id]);

  const getRoomColor = (index: number) => {
    const colors = [
      theme.colors.sortieSoft,
      theme.colors.primarySoft,
      theme.colors.participationSoft,
      theme.colors.remarqueSoft,
    ];
    return colors[index % colors.length];
  };

  const renderRoomItem = ({ item, index }: { item: Room; index: number }) => (
    <Pressable
      style={({ pressed }) => [
        styles.roomCard,
        pressed && styles.roomCardPressed,
      ]}
      onPress={() => {
        router.push(`/(main)/rooms/${item.id}`);
      }}
    >
      <View style={[styles.roomIconContainer, { backgroundColor: getRoomColor(index) }]}>
        <Text style={styles.roomIconText}>🏫</Text>
      </View>
      <View style={styles.roomInfo}>
        <Text style={styles.roomName}>{item.name}</Text>
        <Text style={styles.roomGrid}>
          {item.grid_rows} rangees × {item.grid_cols} colonnes
        </Text>
      </View>
      <View style={styles.chevronContainer}>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );

  const renderEmptyList = () => (
    <View style={styles.placeholder}>
      <View style={styles.placeholderIconContainer}>
        <Text style={styles.placeholderEmoji}>🏫</Text>
      </View>
      <Text style={styles.placeholderTitle}>Aucune salle</Text>
      <Text style={styles.placeholderText}>
        Creez vos salles depuis l'application web, puis synchronisez.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Mes Salles',
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
      <View style={styles.content}>
        {isLoading && rooms.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Chargement des salles...</Text>
          </View>
        ) : (
          <FlatList
            data={rooms}
            renderItem={renderRoomItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={renderEmptyList}
            contentContainerStyle={rooms.length === 0 ? styles.emptyList : styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              rooms.length > 0 ? (
                <View style={styles.listHeaderContainer}>
                  <Text style={styles.listHeader}>
                    {rooms.length} salle{rooms.length > 1 ? 's' : ''}
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
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
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
  roomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  roomCardPressed: {
    backgroundColor: theme.colors.surfaceHover,
    transform: [{ scale: 0.98 }],
  },
  roomIconContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  roomIconText: {
    fontSize: 24,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  roomGrid: {
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
    backgroundColor: theme.colors.sortieSoft,
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
