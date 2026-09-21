import { Link } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useBoot } from '../src/boot';
import { commitPending } from '../src/share/confirmGate';
import { useGate } from '../src/share/useGate';
import { useSettings } from '../src/settings/store';
import { ConfirmCard } from '../src/ui/ConfirmCard';
import { Orb } from '../src/ui/Orb';
import { theme } from '../src/ui/theme';
import { voiceSession } from '../src/voice/session';
import { useVoice } from '../src/voice/VoiceProvider';

export default function HomeScreen() {
  const boot = useBoot();
  const gate = useGate();
  const { snapshot, micGranted, setListening, pushToTalk } = useVoice();
  const [settings, updateSettings] = useSettings();

  const listening = snapshot.state !== 'off';

  const toggleListening = useCallback(
    async (on: boolean) => {
      await updateSettings({ alwaysListening: on });
      await setListening(on);
    },
    [setListening, updateSettings],
  );

  const engineLine = describeEngine(boot);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {boot.needsModels && (
        <Link href="/settings" style={styles.banner}>
          <Text style={styles.bannerText}>
            No models on this phone yet. Open Settings to download them.
          </Text>
        </Link>
      )}

      {micGranted === false && (
        <View style={[styles.banner, styles.bannerBad]}>
          <Text style={styles.bannerText}>
            Microphone permission denied. Voice input will not work.
          </Text>
        </View>
      )}

      <Orb
        state={snapshot.state}
        active={snapshot.hearingSpeech}
        onPress={() => void pushToTalk()}
      />

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>
          Always listen for &ldquo;{settings.wakeWord}&rdquo;
        </Text>
        <Switch
          value={listening}
          onValueChange={(on) => void toggleListening(on)}
          trackColor={{ true: theme.accentDim, false: theme.border }}
          thumbColor={listening ? theme.accent : theme.textDim}
        />
      </View>

      {gate.pending && (
        <ConfirmCard
          pending={gate.pending}
          voiceHint={settings.voiceConfirm && listening}
          onConfirm={() => void commitPending()}
          onCancel={() => voiceSession.cancelConfirmation()}
        />
      )}

      {snapshot.heard !== '' && (
        <View style={styles.bubbleUser}>
          <Text style={styles.bubbleLabel}>You</Text>
          <Text style={styles.bubbleText}>{snapshot.heard}</Text>
        </View>
      )}

      {snapshot.said !== '' && (
        <View style={styles.bubbleAssistant}>
          <Text style={styles.bubbleLabel}>Assistant</Text>
          <Text style={styles.bubbleText}>{snapshot.said}</Text>
        </View>
      )}

      {gate.lastOutcome && <Text style={styles.outcome}>{gate.lastOutcome}</Text>}

      {(snapshot.error || boot.error) && (
        <Text style={styles.error}>{snapshot.error ?? boot.error}</Text>
      )}

      <Text style={styles.status}>{engineLine}</Text>
      <Text style={styles.privacy}>
        Speech and reasoning run on this phone. Nothing is sent anywhere until you
        confirm.
      </Text>
    </ScrollView>
  );
}

function describeEngine(boot: ReturnType<typeof useBoot>): string {
  const stt = boot.sttReady ? 'speech ready' : 'speech not loaded';

  switch (boot.engine.state) {
    case 'ready':
      return `Model ${boot.engine.modelName} loaded, ${stt}.`;
    case 'loading':
      return `Loading model ${Math.round(boot.engine.progress * 100)}%, ${stt}.`;
    case 'error':
      return `Model failed: ${boot.engine.message}`;
    default:
      return `No model loaded, ${stt}.`;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 20, gap: 18, alignItems: 'center', paddingBottom: 48 },
  banner: {
    width: '100%',
    backgroundColor: theme.surfaceAlt,
    borderColor: theme.warn,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: 12,
  },
  bannerBad: { borderColor: theme.bad },
  bannerText: { color: theme.text, fontSize: 13 },
  toggleRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  toggleLabel: { color: theme.text, fontSize: 15, flexShrink: 1, paddingRight: 12 },
  bubbleUser: {
    width: '100%',
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 14,
    gap: 4,
  },
  bubbleAssistant: {
    width: '100%',
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
    padding: 14,
    gap: 4,
  },
  bubbleLabel: { color: theme.textDim, fontSize: 11, textTransform: 'uppercase' },
  bubbleText: { color: theme.text, fontSize: 16, lineHeight: 22 },
  outcome: { color: theme.good, fontSize: 13, textAlign: 'center' },
  error: { color: theme.bad, fontSize: 13, textAlign: 'center' },
  status: { color: theme.textDim, fontSize: 12, textAlign: 'center' },
  privacy: { color: theme.textDim, fontSize: 11, textAlign: 'center', opacity: 0.8 },
});
