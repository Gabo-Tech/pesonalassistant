import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootProvider } from '../src/boot';
import { useSettings } from '../src/settings/store';
import { ThemeProvider, useTheme } from '../src/ui/ThemeProvider';
import { serifFamily } from '../src/ui/Type';
import { VoiceProvider } from '../src/voice/VoiceProvider';

// Registers the notification handler before any reminder can arrive.
import '../src/notify';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <BootProvider>
        <VoiceProvider>
          <ThemeProvider>
            <ThemedShell />
          </ThemeProvider>
        </VoiceProvider>
      </BootProvider>
    </SafeAreaProvider>
  );
}

function ThemedShell() {
  const t = useTheme();
  const [settings] = useSettings();

  return (
    <>
      <StatusBar style={settings.appearance === 'light' ? 'dark' : 'light'} />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: t.bg },
          headerTitleStyle: {
            color: t.ink,
            fontFamily: serifFamily,
            fontSize: 22,
            fontWeight: '400',
          },
          headerShadowVisible: false,
          tabBarStyle: {
            backgroundColor: t.bg,
            borderTopColor: t.line,
            borderTopWidth: StyleSheet.hairlineWidth,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarActiveTintColor: t.ink,
          tabBarInactiveTintColor: t.dim,
          tabBarLabelStyle: {
            fontSize: 11,
            letterSpacing: 0.8,
            fontFamily: Platform.select({ android: 'sans-serif', default: undefined }),
          },
          sceneStyle: { backgroundColor: t.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Assistant' }} />
        <Tabs.Screen name="notes" options={{ title: 'Notes' }} />
        <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </>
  );
}
