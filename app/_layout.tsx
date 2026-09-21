import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '../src/ui/theme';
import { VoiceProvider } from '../src/voice/VoiceProvider';

// Registers the notification handler before any reminder can arrive.
import '../src/notify';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* The voice session lives above the navigator so the microphone keeps
          running while the user browses notes or settings. */}
      <VoiceProvider>
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: theme.bg },
            headerTitleStyle: { color: theme.text },
            headerShadowVisible: false,
            tabBarStyle: {
              backgroundColor: theme.surface,
              borderTopColor: theme.border,
            },
            tabBarActiveTintColor: theme.accent,
            tabBarInactiveTintColor: theme.textDim,
            sceneStyle: { backgroundColor: theme.bg },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Assistant' }} />
          <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
          <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
          <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        </Tabs>
      </VoiceProvider>
    </SafeAreaProvider>
  );
}
