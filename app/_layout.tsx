import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useDatabase, useAutoSync } from '../hooks';
import { useNetworkStore } from '../stores';
import { ErrorBoundary, OfflineIndicator } from '../components';
import { theme } from '../constants/theme';

export default function RootLayout() {
  const { isReady: isDatabaseReady, error: databaseError } = useDatabase();
  const initializeNetwork = useNetworkStore((state) => state.initialize);

  // Initialize network monitoring
  useEffect(() => {
    const unsubscribe = initializeNetwork();
    return () => unsubscribe();
  }, []);

  // Enable auto-sync (when network restored or session ends)
  useAutoSync();

  // Show loading screen while database initializes
  if (!isDatabaseReady) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          {databaseError ? (
            <>
              <Text style={styles.errorEmoji}>⚠️</Text>
              <Text style={styles.errorTitle}>Erreur</Text>
              <Text style={styles.errorText}>{databaseError}</Text>
            </>
          ) : (
            <>
              <Text style={styles.loadingEmoji}>📚</Text>
              <Text style={styles.loadingText}>Initialisation...</Text>
              <ActivityIndicator
                size="large"
                color={theme.colors.participation}
                style={styles.loader}
              />
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <StatusBar style="dark" />
        <OfflineIndicator />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(main)" />
        </Stack>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  loadingText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  loader: {
    marginTop: theme.spacing.lg,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
});
