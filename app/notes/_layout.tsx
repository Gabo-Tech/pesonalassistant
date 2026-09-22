import { Stack } from 'expo-router';
import { useTheme } from '../../src/ui/ThemeProvider';

export default function NotesLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.bg },
      }}
    />
  );
}
