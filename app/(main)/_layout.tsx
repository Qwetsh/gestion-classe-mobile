import { Stack } from 'expo-router';
import { theme } from '../../constants/theme';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="classes" />
      <Stack.Screen name="history" />
      <Stack.Screen name="rooms" />
      <Stack.Screen name="session" />
      <Stack.Screen name="students" />
      <Stack.Screen name="group-session" />
      <Stack.Screen name="parent-meeting" />
      <Stack.Screen name="plan" />
    </Stack>
  );
}
