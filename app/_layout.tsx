import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootProvider } from '../src/boot';
import { useT } from '../src/i18n';
import { Onboarding } from '../src/onboarding/Onboarding';
import { getRingingAlarm, subscribeAlarmRing, type RingingAlarm } from '../src/notify/alarmRing';
import { useSettings } from '../src/settings/store';
import { AlarmOverlay } from '../src/ui/AlarmOverlay';
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
  const [settings, , ready] = useSettings();
  const [ringing, setRinging] = useState<RingingAlarm | null>(getRingingAlarm);

  useEffect(() => subscribeAlarmRing(setRinging), []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  }

  return (
    <>
      <StatusBar style={settings.appearance === 'light' ? 'dark' : 'light'} />
      <View style={{ flex: 1 }}>
        <ThemedTabs hideChrome={!settings.onboardingComplete} />
        {!settings.onboardingComplete ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, zIndex: 20 }]}>
            <Onboarding />
          </View>
        ) : null}
        {ringing ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, zIndex: 30 }]}>
            <AlarmOverlay alarm={ringing} />
          </View>
        ) : null}
      </View>
    </>
  );
}

function ThemedTabs({ hideChrome }: { hideChrome: boolean }) {
  const t = useTheme();
  const tr = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: !hideChrome,
        headerStyle: { backgroundColor: t.bg },
        headerTitleStyle: {
          color: t.ink,
          fontFamily: serifFamily,
          fontSize: 22,
          fontWeight: '400',
        },
        headerShadowVisible: false,
        tabBarStyle: hideChrome
          ? { display: 'none', height: 0 }
          : {
              backgroundColor: t.bg,
              borderTopColor: t.line,
              borderTopWidth: StyleSheet.hairlineWidth,
              elevation: 0,
              shadowOpacity: 0,
            },
        tabBarHideOnKeyboard: true,
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
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tabs.assistant'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: tr('tabs.notes'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: tr('tabs.agenda'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: tr('tabs.people'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: tr('tabs.settings'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
