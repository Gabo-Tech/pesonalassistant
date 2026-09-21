import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useBoot } from '../src/boot';
import { commitPending } from '../src/share/confirmGate';
import { useGate } from '../src/share/useGate';
import { useSettings } from '../src/settings/store';
import { Bento, BentoLabel, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { ConfirmCard } from '../src/ui/ConfirmCard';
import { Orb } from '../src/ui/Orb';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Meta } from '../src/ui/Type';
import { voiceSession } from '../src/voice/session';
import { useVoice } from '../src/voice/VoiceProvider';

export default function HomeScreen() {
  const t = useTheme();
  const boot = useBoot();
  const gate = useGate();
  const { snapshot, micGranted, isStreaming, backgroundListenOk, setListening, pushToTalk } =
    useVoice();
  const [settings, updateSettings] = useSettings();
  const [typed, setTyped] = useState('');

  const listening = settings.alwaysListening;

  const toggleListening = useCallback(
    async (on: boolean) => {
      await updateSettings({ alwaysListening: on });
      await setListening(on);
    },
    [setListening, updateSettings],
  );

  const alerts: string[] = [];
  if (boot.needsModels) {
    alerts.push(
      'No models downloaded yet. Typed commands still work. Open Settings to download speech and the language model.',
    );
  }
  if (micGranted === false) {
    alerts.push('Microphone permission denied. Voice input will not work.');
  }
  if (backgroundListenOk === false && settings.alwaysListening) {
    alerts.push(
      'Notification permission denied. Listening works in the app, but Android will mute the microphone after you leave.',
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.grid}
    >
      {alerts.length > 0 && (
        <Bento span={2} style={{ gap: 10 }}>
          <BentoLabel>Notice</BentoLabel>
          {alerts.map((line) => (
            <Body key={line}>{line}</Body>
          ))}
          {boot.needsModels ? (
            <Link href="/settings">
              <Meta style={{ color: t.ink }}>Open settings</Meta>
            </Link>
          ) : null}
        </Bento>
      )}

      <Bento span={1} style={styles.halfInner}>
        <BentoLabel>Listen</BentoLabel>
        <Body style={{ marginBottom: 12 }}>
          Always listen for “{settings.wakeWord}”
        </Body>
        <InkSwitch value={listening} onValueChange={(on) => void toggleListening(on)} />
      </Bento>

      <Bento span={1} style={styles.halfInner}>
        <BentoLabel>Model</BentoLabel>
        <Body>{describeEngine(boot)}</Body>
      </Bento>

      <Bento span={2}>
        <Orb
          state={snapshot.state}
          active={snapshot.hearingSpeech}
          onPress={() => void pushToTalk()}
        />
      </Bento>

      <Bento span={1} style={{ minHeight: 120 }}>
        <BentoLabel>You</BentoLabel>
        <Body style={snapshot.heard ? undefined : { color: t.dim }}>
          {snapshot.heard || 'Nothing heard yet'}
        </Body>
      </Bento>

      <Bento span={1} style={{ minHeight: 120 }}>
        <BentoLabel>Assistant</BentoLabel>
        <Body style={snapshot.said ? undefined : { color: t.dim }}>
          {snapshot.said || 'Waiting'}
        </Body>
      </Bento>

      {gate.pending && (
        <ConfirmCard
          pending={gate.pending}
          voiceHint={settings.voiceConfirm}
          micReady={isStreaming}
          onConfirm={() =>
            void commitPending().then((msg) => {
              if (msg) voiceSession.say(msg);
            })
          }
          onCancel={() => voiceSession.cancelConfirmation()}
        />
      )}

      {gate.lastOutcome ? (
        <Bento span={2}>
          <Meta>Outcome</Meta>
          <Body style={{ marginTop: 8 }}>{gate.lastOutcome}</Body>
        </Bento>
      ) : null}

      {(snapshot.error || boot.error) && (
        <Bento span={2}>
          <BentoLabel>Error</BentoLabel>
          <Body>{snapshot.error ?? boot.error}</Body>
        </Bento>
      )}

      <Bento span={2} style={styles.composer}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Type a command if you would rather not speak"
          placeholderTextColor={t.dim}
          style={[styles.typedInput, { color: t.ink }]}
          onSubmitEditing={() => {
            const text = typed.trim();
            if (!text) return;
            setTyped('');
            void voiceSession.submitText(text);
          }}
        />
        <Pressable
          style={[styles.go, { backgroundColor: t.inverse, borderRadius: t.radiusChip }]}
          onPress={() => {
            const text = typed.trim();
            if (!text) return;
            setTyped('');
            void voiceSession.submitText(text);
          }}
        >
          <Meta style={{ color: t.inverseInk }}>Go</Meta>
        </Pressable>
      </Bento>

      <View style={styles.privacyWrap}>
        <Meta style={{ textAlign: 'center', letterSpacing: 0.8, textTransform: 'none' }}>
          Speech and reasoning run on this phone. Nothing is sent anywhere until you
          confirm.
        </Meta>
      </View>
    </ScrollView>
  );
}

function describeEngine(boot: ReturnType<typeof useBoot>): string {
  const stt = boot.sttReady ? 'Speech ready' : 'Speech not loaded';

  switch (boot.engine.state) {
    case 'ready':
      return `${boot.engine.modelName} loaded. ${stt}.`;
    case 'loading':
      return `Loading model ${Math.round(boot.engine.progress * 100)}%. ${stt}.`;
    case 'error':
      return `Model failed: ${boot.engine.message}`;
    default:
      return `No model loaded. ${stt}.`;
  }
}

const styles = StyleSheet.create({
  grid: {
    padding: PAGE_MARGIN,
    gap: GUTTER,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 48,
  },
  halfInner: { justifyContent: 'space-between' },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  typedInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  go: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyWrap: { width: '100%', paddingTop: 8, paddingHorizontal: 8 },
});
