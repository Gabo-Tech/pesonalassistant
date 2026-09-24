import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AgendaNav } from '../../src/agenda/nav';
import { useTheme } from '../../src/ui/ThemeProvider';

export default function AgendaLayout() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <AgendaNav />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: t.bg },
          }}
        />
      </View>
    </View>
  );
}
