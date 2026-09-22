import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useBoot } from '../src/boot';
import { recentTurns, subscribeTurns, type Turn } from '../src/db/turns';
import { useT } from '../src/i18n';
import { commitPending } from '../src/share/confirmGate';
import { useGate } from '../src/share/useGate';
import { useSettings } from '../src/settings/store';
import { Bento, BentoLabel, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { ConfirmCard } from '../src/ui/ConfirmCard';
import { Orb } from '../src/ui/Orb';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Meta } from '../src/ui/Type';
import { isEnglishOnlyModel } from '../src/voice/sttLanguage';
import { voiceSession } from '../src/voice/session';
import { useVoice } from '../src/voice/VoiceProvider';
import type { SessionState } from '../src/voice/sessionLogic';

export default function HomeScreen() {
  const t = useTheme();
  const tr = useT();
  const boot = useBoot();
  const gate = useGate();
  const { snapshot, micGranted, isStreaming, backgroundListenOk, setListening, pushToTalk } =
    useVoice();
  const [settings, updateSettings] = useSettings();
  const [typed, setTyped] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const listRef = useRef<FlatList<Turn>>(null);

  const listening = settings.alwaysListening;

  const refreshTurns = useCallback(async () => {
    try {
      setTurns(await recentTurns(80));
    } catch {
      // Database may still be opening on first paint.
    }
  }, []);

  useEffect(() => subscribeTurns(() => void refreshTurns()), [refreshTurns]);

  const toggleListening = useCallback(
    async (on: boolean) => {
      await updateSettings({ alwaysListening: on });
      await setListening(on);
    },
    [setListening, updateSettings],
  );

  const alerts: string[] = [];
  if (boot.needsModels) alerts.push(tr('home.needsModels'));
  if (micGranted === false) alerts.push(tr('home.micDenied'));
  if (backgroundListenOk === false && settings.alwaysListening) {
    alerts.push(tr('home.notifyDenied'));
  }
  if (settings.locale === 'es' && isEnglishOnlyModel(settings.sttModelPath)) {
    alerts.push(tr('stt.englishOnly'));
  }

  const status = listenStatus(snapshot.state, snapshot.error, boot.sttReady, settings.wakeWord, tr);

  const sendTyped = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    void voiceSession.submitText(text);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.page}>
        {alerts.length > 0 && (
          <Bento span={2} style={{ gap: 10 }}>
            <BentoLabel>{tr('home.notice')}</BentoLabel>
            {alerts.map((line) => (
              <Body key={line}>{line}</Body>
            ))}
            {boot.needsModels ? (
              <Link href="/settings">
                <Meta style={{ color: t.ink }}>{tr('home.openSettings')}</Meta>
              </Link>
            ) : null}
          </Bento>
        )}

        <View style={styles.statusRow}>
          <Bento span={1} style={styles.half}>
            <BentoLabel>{tr('home.listen')}</BentoLabel>
            <Body style={{ marginBottom: 10 }}>{tr('home.alwaysListen', { wake: settings.wakeWord })}</Body>
            <InkSwitch value={listening} onValueChange={(on) => void toggleListening(on)} />
          </Bento>
          <Bento span={1} style={styles.half}>
            <BentoLabel>{tr('home.model')}</BentoLabel>
            <Body>{describeEngine(boot, tr)}</Body>
          </Bento>
        </View>

        <Meta>{status}</Meta>

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={turns}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Meta style={{ textAlign: 'center', marginTop: 24 }}>{tr('home.emptyChat')}</Meta>
          }
          renderItem={({ item }) => <Bubble turn={item} />}
        />

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

        {(snapshot.error || boot.error) && snapshot.state !== 'off' ? (
          <Meta>{snapshot.error ?? boot.error}</Meta>
        ) : null}

        <Pressable onPress={() => void voiceSession.clearChat()} hitSlop={8}>
          <Meta>{tr('home.clear')}</Meta>
        </Pressable>

        <View style={[styles.composer, { backgroundColor: t.surface, borderColor: t.line, borderRadius: t.radius }]}>
          <Orb
            state={snapshot.state}
            active={snapshot.hearingSpeech}
            onPress={() => void pushToTalk()}
            compact
            showLabel={false}
          />
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={tr('home.composer')}
            placeholderTextColor={t.dim}
            style={[styles.typedInput, { color: t.ink }]}
            onSubmitEditing={sendTyped}
          />
          <Pressable
            style={[styles.go, { backgroundColor: t.inverse, borderRadius: t.radiusChip }]}
            onPress={sendTyped}
          >
            <Meta style={{ color: t.inverseInk }}>{tr('home.go')}</Meta>
          </Pressable>
        </View>

        <Meta style={{ textAlign: 'center', letterSpacing: 0.8, textTransform: 'none' }}>
          {tr('home.privacy')}
        </Meta>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ turn }: { turn: Turn }) {
  const t = useTheme();
  const mine = turn.role === 'user';
  const system = turn.role === 'system';
  return (
    <View style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mine ? t.inverse : t.surface,
            borderColor: t.line,
            borderRadius: t.radius,
            maxWidth: '82%',
          },
        ]}
      >
        <Body style={{ color: mine ? t.inverseInk : system ? t.dim : t.ink }}>{turn.text}</Body>
      </View>
    </View>
  );
}

function listenStatus(
  state: SessionState,
  error: string | null,
  sttReady: boolean,
  wake: string,
  tr: ReturnType<typeof useT>,
): string {
  if (error) return error;
  if (!sttReady) return tr('stt.missing');
  switch (state) {
    case 'listening':
      return tr('stt.listening');
    case 'thinking':
      return tr('stt.thinking');
    case 'speaking':
      return tr('stt.speaking');
    case 'confirming':
      return tr('stt.confirming');
    case 'idle':
      return tr('stt.waiting', { wake });
    default:
      return tr('stt.off');
  }
}

function describeEngine(
  boot: ReturnType<typeof useBoot>,
  tr: ReturnType<typeof useT>,
): string {
  const stt = boot.sttReady ? tr('home.speechReady') : tr('home.speechNotLoaded');
  switch (boot.engine.state) {
    case 'ready':
      return tr('home.modelReady', { name: boot.engine.modelName, stt });
    case 'loading':
      return tr('home.loadingModel', { pct: Math.round(boot.engine.progress * 100), stt });
    case 'error':
      return tr('home.modelFailed', { message: boot.engine.message });
    default:
      return tr('home.noModel', { stt });
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: PAGE_MARGIN,
    gap: GUTTER,
    paddingBottom: 16,
  },
  statusRow: { flexDirection: 'row', gap: GUTTER },
  half: { flex: 1, justifyContent: 'space-between' },
  thread: { gap: 10, paddingVertical: 8, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { width: '100%', flexDirection: 'row' },
  bubble: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 10 },
  composer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  typedInput: { flex: 1, fontSize: 15, paddingVertical: 8 },
  go: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
