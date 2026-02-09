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
      <Stack.Screen name="classes/[id]" />
    </Stack>
  );
}
