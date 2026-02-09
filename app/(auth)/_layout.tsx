import { Stack } from 'expo-router';
import { theme } from '../../constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitleStyle: { fontWeight: '600' },
        headerTintColor: theme.colors.text,
        contentStyle: { backgroundColor: theme.colors.background },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="login"
        options={{
          headerTitle: 'Connexion',
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          headerTitle: 'Inscription',
        }}
      />
    </Stack>
  );
}
