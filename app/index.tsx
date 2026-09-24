import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
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
import { Button, TextAction } from '../src/ui/Button';
import { ConfirmCard } from '../src/ui/ConfirmCard';
import { KeyboardGutter } from '../src/ui/KeyboardGutter';
import { Orb } from '../src/ui/Orb';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body } from '../src/ui/Type';
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
  const navigation = useNavigation();
  const router = useRouter();

  const listening = settings.alwaysListening;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TextAction label={tr('home.clear')} onPress={() => void voiceSession.clearChat()} />
      ),
    });
  }, [navigation, tr]);

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
  const examples = [tr('home.exampleWeek'), tr('home.exampleRemind'), tr('home.exampleNote')];

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
      <KeyboardGutter>
      <View style={styles.page}>
        {alerts.length > 0 && (
          <Bento span={2} style={{ gap: 10 }}>
            <BentoLabel>{tr('home.notice')}</BentoLabel>
            {alerts.map((line) => (
              <Body key={line}>{line}</Body>
            ))}
            {boot.needsModels ? (
              <Button label={tr('home.openSettings')} onPress={() => router.push('/settings')} />
            ) : null}
          </Bento>
        )}

        <View style={[styles.listenBar, { borderColor: t.line, backgroundColor: t.surface, borderRadius: t.radiusChip }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Body>{tr('home.alwaysListen', { wake: settings.wakeWord })}</Body>
            <Body style={{ color: t.dim, fontSize: 13, lineHeight: 18 }}>{status}</Body>
          </View>
          <InkSwitch value={listening} onValueChange={(on) => void toggleListening(on)} />
        </View>

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          data={turns}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.thread}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ gap: 10, marginTop: 24 }}>
              <Body style={{ color: t.dim, textAlign: 'center' }}>{tr('home.emptyChat')}</Body>
              {examples.map((example) => (
                <Pressable
                  key={example}
                  onPress={() => void voiceSession.submitText(example)}
                  style={[styles.example, { borderColor: t.line, borderRadius: t.radiusChip }]}
                >
                  <Body>{example}</Body>
                </Pressable>
              ))}
            </View>
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

        {(snapshot.error || boot.error) && snapshot.state !== 'off' && snapshot.error !== status ? (
          <Body style={{ color: t.danger }}>{snapshot.error ?? boot.error}</Body>
        ) : null}

        <View style={[styles.composer, { backgroundColor: t.surface, borderColor: t.line, borderRadius: t.radius }]}>
          <Orb
            state={snapshot.state}
            active={snapshot.hearingSpeech}
            onPress={() => void pushToTalk()}
            compact
            showLabel={false}
          />
          <View style={styles.field}>
            {typed ? null : (
              <Text numberOfLines={2} pointerEvents="none" style={[styles.placeholder, { color: t.dim }]}>
                {tr('home.composer')}
              </Text>
            )}
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder=""
              style={[styles.typedInput, !typed && StyleSheet.absoluteFill, { color: t.ink }]}
              onSubmitEditing={sendTyped}
            />
          </View>
          <Pressable
            style={[styles.go, { backgroundColor: t.inverse, borderRadius: t.radiusChip }]}
            onPress={sendTyped}
            accessibilityRole="button"
          >
            <Body style={{ color: t.inverseInk }}>{tr('home.go')}</Body>
          </Pressable>
        </View>
      </View>
      </KeyboardGutter>
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

const styles = StyleSheet.create({
  page: {
    flex: 1,
    padding: PAGE_MARGIN,
    gap: GUTTER,
    paddingBottom: 16,
  },
  listenBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
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
  field: { flex: 1, minWidth: 0, justifyContent: 'center' },
  placeholder: { alignSelf: 'stretch', fontSize: 15, lineHeight: 20, paddingVertical: 8 },
  typedInput: { fontSize: 15, paddingVertical: 8 },
  go: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  example: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
