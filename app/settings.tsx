import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { resolveModel } from '../src/boot';
import { loadLlm, subscribeEngine, unloadLlm, type EngineStatus } from '../src/llm/engine';
import {
  MODELS,
  deleteModel,
  downloadModel,
  formatBytes,
  isDownloaded,
  localPath,
  type ModelSpec,
} from '../src/models/catalog';
import { isCrawlerAvailable, isCrawlerEnabled } from '../src/share/crawler';
import { openAccessibilitySettings } from '../src/share/intents';
import { useSettings } from '../src/settings/store';
import { theme } from '../src/ui/theme';
import { voiceSession } from '../src/voice/session';
import { loadStt } from '../src/voice/stt';

const SENSITIVITY = [
  { label: 'Quiet room', value: 0.008 },
  { label: 'Normal', value: 0.015 },
  { label: 'Noisy', value: 0.03 },
];

export default function SettingsScreen() {
  const [settings, updateSettings] = useSettings();
  const [engine, setEngine] = useState<EngineStatus>({ state: 'unloaded' });
  const [crawlerOn, setCrawlerOn] = useState(false);

  useEffect(() => subscribeEngine(setEngine), []);

  // Accessibility state can change while we are backgrounded, so re-check on mount.
  useEffect(() => {
    setCrawlerOn(isCrawlerEnabled());
  }, []);

  const setSensitivity = useCallback(
    async (value: number) => {
      await updateSettings({ vadThreshold: value });
      voiceSession.configureVad(value);
    },
    [updateSettings],
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Section title="Wake word">
        <Text style={styles.help}>
          Spoken to start a request. Two or three syllables work best.
        </Text>
        <TextInput
          value={settings.wakeWord}
          onChangeText={(text) => void updateSettings({ wakeWord: text })}
          autoCapitalize="none"
          placeholder="computer"
          placeholderTextColor={theme.textDim}
          style={styles.input}
        />
        <Text style={styles.help}>
          Detected by transcribing short bursts of audio on-device. No account needed.
        </Text>
      </Section>

      <Section title="Voice">
        <Toggle
          label="Speak replies out loud"
          value={settings.speakReplies}
          onChange={(value) => void updateSettings({ speakReplies: value })}
        />
        <Toggle
          label={'Allow spoken "send" to confirm'}
          value={settings.voiceConfirm}
          onChange={(value) => void updateSettings({ voiceConfirm: value })}
        />
        <Text style={styles.help}>
          With this off, messages can only be sent by tapping the button.
        </Text>

        <Text style={styles.subheading}>Microphone sensitivity</Text>
        <View style={styles.chipRow}>
          {SENSITIVITY.map((option) => {
            const active = Math.abs(settings.vadThreshold - option.value) < 0.0001;
            return (
              <Pressable
                key={option.label}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => void setSensitivity(option.value)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Models">
        <Text style={styles.help}>
          Downloaded once, then used entirely offline. This is the only time the app uses
          the network.
        </Text>
        {MODELS.map((spec) => (
          <ModelRow key={spec.id} spec={spec} engine={engine} />
        ))}
      </Section>

      <Section title="Sending messages">
        <Text style={styles.help}>
          WhatsApp, Signal and X have no private API for sending as you, so after you
          confirm, the app opens the real app with your draft.
        </Text>
        {isCrawlerAvailable() ? (
          <>
            <Text style={styles.status}>
              Auto-tap send: {crawlerOn ? 'enabled' : 'disabled'}
            </Text>
            <Pressable
              style={styles.button}
              onPress={() => {
                void openAccessibilitySettings();
              }}
            >
              <Text style={styles.buttonText}>Open Accessibility settings</Text>
            </Pressable>
            <Pressable style={styles.buttonGhost} onPress={() => setCrawlerOn(isCrawlerEnabled())}>
              <Text style={styles.buttonGhostText}>Re-check status</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.status}>
            Auto-tap send is not in this build. Drafts open for you to tap send.
          </Text>
        )}
        <Text style={styles.help}>
          Even with auto-tap on, nothing is sent until you confirm, and it is authorised
          for one message at a time.
        </Text>
      </Section>

      <Section title="Privacy">
        <Text style={styles.help}>
          Speech recognition and the language model run on this device. Notes and
          reminders are stored in a local database. Nothing is uploaded.
        </Text>
      </Section>
    </ScrollView>
  );
}

function ModelRow({ spec, engine }: { spec: ModelSpec; engine: EngineStatus }) {
  const [present, setPresent] = useState(() => isDownloaded(spec));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelFn, setCancelFn] = useState<(() => void) | null>(null);
  const [, updateSettings] = useSettings();

  const inUse =
    engine.state === 'ready' && localPath(spec) !== null && engine.modelName === spec.fileName;

  const start = useCallback(async () => {
    setError(null);
    setProgress(0);

    const handle = downloadModel(spec, (fraction) => setProgress(fraction));
    setCancelFn(() => handle.cancel);

    try {
      const uri = await handle.promise;
      setPresent(true);

      // Load it straight away so the user can try it without restarting the app.
      if (spec.kind === 'llm') {
        await updateSettings({ llmModelPath: uri });
        await unloadLlm();
        await loadLlm(uri);
      } else {
        await updateSettings({ sttModelPath: uri });
        await loadStt(uri);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      setCancelFn(null);
    }
  }, [spec, updateSettings]);

  const remove = useCallback(async () => {
    if (spec.kind === 'llm' && inUse) await unloadLlm();
    deleteModel(spec);
    setPresent(false);

    const fallback = resolveModel(spec.kind);
    await updateSettings(
      spec.kind === 'llm'
        ? { llmModelPath: fallback?.path ?? null }
        : { sttModelPath: fallback?.path ?? null },
    );
  }, [inUse, spec, updateSettings]);

  return (
    <View style={styles.model}>
      <View style={styles.modelHead}>
        <Text style={styles.modelTitle}>{spec.label}</Text>
        <Text style={styles.modelSize}>{formatBytes(spec.bytes)}</Text>
      </View>
      <Text style={styles.help}>{spec.note}</Text>

      {progress !== null ? (
        <>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Pressable style={styles.buttonGhost} onPress={() => cancelFn?.()}>
            <Text style={styles.buttonGhostText}>
              Cancel ({Math.round(progress * 100)}%)
            </Text>
          </Pressable>
        </>
      ) : present ? (
        <View style={styles.modelActions}>
          <Text style={styles.ready}>{inUse ? 'Loaded' : 'Downloaded'}</Text>
          <Pressable onPress={() => void remove()} hitSlop={8}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.button} onPress={() => void start()}>
          <Text style={styles.buttonText}>Download</Text>
        </Pressable>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: theme.accentDim, false: theme.border }}
        thumbColor={value ? theme.accent : theme.textDim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 16, paddingBottom: 48 },
  section: {
    backgroundColor: theme.surface,
    borderRadius: theme.radius,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { color: theme.text, fontSize: 17, fontWeight: '700' },
  subheading: { color: theme.text, fontSize: 14, fontWeight: '600', marginTop: 6 },
  help: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
  status: { color: theme.text, fontSize: 14 },
  input: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 10,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: { color: theme.text, fontSize: 15, flex: 1 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.accentDim, borderColor: theme.accent },
  chipText: { color: theme.textDim, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  model: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  modelHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  modelTitle: { color: theme.text, fontSize: 14, fontWeight: '600', flex: 1 },
  modelSize: { color: theme.textDim, fontSize: 12 },
  modelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  ready: { color: theme.good, fontSize: 13, fontWeight: '600' },
  delete: { color: theme.bad, fontSize: 13 },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  buttonGhost: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonGhostText: { color: theme.textDim, fontSize: 13 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.border,
    overflow: 'hidden',
  },
  progressFill: { height: 8, backgroundColor: theme.accent },
  error: { color: theme.bad, fontSize: 12 },
});
