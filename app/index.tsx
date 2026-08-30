import { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { useAuthStore } from '../stores';
import { theme } from '../constants/theme';

export default function Index() {
  const { checkAuth, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      await checkAuth();
    };
    initAuth();
  }, []);

  useEffect(() => {
    // Only navigate after loading is complete
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/(main)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [isLoading, isAuthenticated]);

  // Show loading screen while checking auth
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoSquare}>
          <BookOpen size={34} color={theme.colors.textInverse} strokeWidth={2} />
        </View>
        <Text style={styles.title}>Gestion Classe</Text>
        <Text style={styles.subtitle}>Chargement...</Text>
        <ActivityIndicator
          size="large"
          color={theme.colors.primary}
          style={styles.loader}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logoSquare: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  loader: {
    marginTop: theme.spacing.md,
  },
});
