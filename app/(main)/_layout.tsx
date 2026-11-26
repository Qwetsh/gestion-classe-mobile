import { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { BookOpen, Clock, Home, Users } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import { useAuthStore } from '../../stores';

const HIDDEN_TAB = { href: null, tabBarStyle: { display: 'none' as const } };

export default function MainLayout() {
  // L'app s'ouvre sur la session enregistrée, sans attendre le serveur (voir authStore.checkAuth).
  // Si le serveur la refuse ensuite (session révoquée, compte supprimé), retour à la connexion.
  const sessionRevoked = useAuthStore((state) => state.sessionRevoked);
  useEffect(() => {
    if (sessionRevoked) router.replace('/(auth)/login');
  }, [sessionRevoked]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: theme.colors.background },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: {
          fontFamily: theme.fonts.bodySemibold,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color, focused }) => (
            <Home size={22} color={color} strokeWidth={focused ? 2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: 'Classes',
          tabBarIcon: ({ color, focused }) => (
            <BookOpen size={22} color={color} strokeWidth={focused ? 2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, focused }) => (
            <Clock size={22} color={color} strokeWidth={focused ? 2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="parent-meeting"
        options={{
          title: 'Réunions',
          tabBarIcon: ({ color, focused }) => (
            <Users size={22} color={color} strokeWidth={focused ? 2 : 1.8} />
          ),
        }}
      />
      {/* Routes hors tab bar (plein ecran, sans barre) */}
      <Tabs.Screen name="rooms" options={HIDDEN_TAB} />
      <Tabs.Screen name="session" options={HIDDEN_TAB} />
      <Tabs.Screen name="students" options={HIDDEN_TAB} />
      <Tabs.Screen name="group-session" options={HIDDEN_TAB} />
      <Tabs.Screen name="plan" options={HIDDEN_TAB} />
      <Tabs.Screen name="assessments" options={HIDDEN_TAB} />
    </Tabs>
  );
}
