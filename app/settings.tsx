import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { resolveModel } from '../src/boot';
import { writableCalendars, ensureCalendarPermission, hasCalendarPermission } from '../src/calendar/events';
import { loadLlm, subscribeEngine, unloadLlm, type EngineStatus } from '../src/llm/engine';
import {
  MODELS,
  deleteModel,
  downloadModel,
  formatBytes,
  importModel,
  isDownloaded,
  localPath,
  type ModelSpec,
} from '../src/models/catalog';
import { isCrawlerAvailable, isCrawlerEnabled } from '../src/share/crawler';
import { openAccessibilitySettings } from '../src/share/intents';
import { useSettings } from '../src/settings/store';
import { Bento, BentoLabel, Chip, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Meta } from '../src/ui/Type';
import { voiceSession } from '../src/voice/session';
import { isSttReady, loadStt, sttLoadedPath, unloadStt } from '../src/voice/stt';

const SENSITIVITY = [
  { label: 'Quiet room', value: 0.008 },
  { label: 'Normal', value: 0.015 },
  { label: 'Noisy', value: 0.03 },
];

export default function SettingsScreen() {
  const t = useTheme();
  const [settings, updateSettings] = useSettings();
  const [engine, setEngine] = useState<EngineStatus>({ state: 'unloaded' });
  const [crawlerOn, setCrawlerOn] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; title: string }[]>([]);
  const [calendarDenied, setCalendarDenied] = useState(false);

  useEffect(() => subscribeEngine(setEngine), []);

  const loadCalendars = useCallback(async (request = false) => {
    const granted = request
      ? await ensureCalendarPermission()
      : await hasCalendarPermission();
    setCalendarDenied(!granted);
    if (!granted) {
      setCalendars([]);
      return;
    }
    const list = await writableCalendars();
    setCalendars(list.map((calendar) => ({ id: calendar.id, title: calendar.title ?? calendar.id })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCalendars();
      setCrawlerOn(isCrawlerEnabled());
    }, [loadCalendars]),
  );

  const setSensitivity = useCallback(
    async (value: number) => {
      await updateSettings({ vadThreshold: value });
      voiceSession.configureVad(value);
    },
    [updateSettings],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
    >
      <Section title="Appearance">
        <Body style={{ color: t.dim }}>
          Dark is the default. The phone’s system theme is ignored until you change this.
        </Body>
        <View style={styles.chipRow}>
          <Chip
            label="Dark"
            active={settings.appearance === 'dark'}
            onPress={() => void updateSettings({ appearance: 'dark' })}
          />
          <Chip
            label="Light"
            active={settings.appearance === 'light'}
            onPress={() => void updateSettings({ appearance: 'light' })}
          />
        </View>
      </Section>

      <Section title="Wake word">
        <Body style={{ color: t.dim }}>
          Spoken to start a request. Two or three syllables work best.
        </Body>
        <TextInput
          value={settings.wakeWord}
          onChangeText={(text) => void updateSettings({ wakeWord: text })}
          autoCapitalize="none"
          placeholder="computer"
          placeholderTextColor={t.dim}
          style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
        />
        <Body style={{ color: t.dim }}>
          Detected by transcribing short bursts of audio on-device. No account needed.
        </Body>
      </Section>

      <Section title="Calendar">
        {calendarDenied ? (
          <>
            <Body style={{ color: t.dim }}>
              Calendar permission is needed to create and list events.
            </Body>
            <InkButton label="Grant calendar access" onPress={() => void loadCalendars(true)} />
          </>
        ) : calendars.length === 0 ? (
          <Body style={{ color: t.dim }}>No writable calendars on this device.</Body>
        ) : (
          <>
            <Body style={{ color: t.dim }}>New events are written to this calendar.</Body>
            <View style={styles.chipRow}>
              {calendars.map((calendar) => (
                <Chip
                  key={calendar.id}
                  label={calendar.title}
                  active={settings.calendarId === calendar.id}
                  onPress={() => void updateSettings({ calendarId: calendar.id })}
                />
              ))}
            </View>
          </>
        )}
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
        <Body style={{ color: t.dim }}>
          With this off, messages can only be sent by tapping the button.
        </Body>

        <Meta style={{ marginTop: 8 }}>Microphone sensitivity</Meta>
        <View style={styles.chipRow}>
          {SENSITIVITY.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              active={Math.abs(settings.vadThreshold - option.value) < 0.0001}
              onPress={() => void setSensitivity(option.value)}
            />
          ))}
        </View>
      </Section>

      <Section title="Models">
        <Body style={{ color: t.dim }}>
          Downloaded once, then used entirely offline. This is the only time the app uses the
          network.
        </Body>
        {MODELS.map((spec) => (
          <ModelRow key={spec.id} spec={spec} engine={engine} />
        ))}
      </Section>

      <Section title="Sending messages">
        <Body style={{ color: t.dim }}>
          WhatsApp, Signal and X have no private API for sending as you, so after you confirm,
          the app opens the real app with your draft.
        </Body>
        {isCrawlerAvailable() ? (
          <>
            <Body>Auto-tap send: {crawlerOn ? 'enabled' : 'disabled'}</Body>
            <InkButton
              label="Open Accessibility settings"
              onPress={() => {
                void openAccessibilitySettings();
              }}
            />
            <GhostButton label="Re-check status" onPress={() => setCrawlerOn(isCrawlerEnabled())} />
          </>
        ) : (
          <Body>Auto-tap send is not in this build. Drafts open for you to tap send.</Body>
        )}
        <Body style={{ color: t.dim }}>
          Even with auto-tap on, nothing is sent until you confirm, and it is authorised for one
          message at a time.
        </Body>
      </Section>

      <Section title="Privacy">
        <Body style={{ color: t.dim }}>
          Speech recognition and the language model run on this device. Notes and reminders are
          stored in a local database. Nothing is uploaded.
        </Body>
      </Section>
    </ScrollView>
  );
}

function ModelRow({ spec, engine }: { spec: ModelSpec; engine: EngineStatus }) {
  const t = useTheme();
  const [present, setPresent] = useState(() => isDownloaded(spec));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelFn, setCancelFn] = useState<(() => void) | null>(null);
  const [, updateSettings] = useSettings();

  const inUse =
    spec.kind === 'llm'
      ? engine.state === 'ready' &&
        localPath(spec) !== null &&
        engine.modelName === spec.fileName
      : isSttReady() &&
        localPath(spec) !== null &&
        (sttLoadedPath() === localPath(spec) || (sttLoadedPath() ?? '').endsWith(spec.fileName));

  const activate = useCallback(
    async (uri: string) => {
      if (spec.kind === 'llm') {
        await updateSettings({ llmModelPath: uri });
        await unloadLlm();
        await loadLlm(uri);
      } else {
        await updateSettings({ sttModelPath: uri });
        await unloadStt();
        await loadStt(uri);
      }
    },
    [spec.kind, updateSettings],
  );

  const start = useCallback(async () => {
    setError(null);
    setProgress(0);

    const handle = downloadModel(spec, (fraction) => setProgress(fraction));
    setCancelFn(() => handle.cancel);

    try {
      const uri = await handle.promise;
      setPresent(true);
      await activate(uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      setCancelFn(null);
    }
  }, [activate, spec]);

  const pickFile = useCallback(async () => {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: '*/*',
    });
    if (picked.canceled || !picked.assets[0]) return;

    try {
      const uri = await importModel(spec, picked.assets[0].uri);
      setPresent(true);
      await activate(uri);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activate, spec]);

  const remove = useCallback(async () => {
    if (spec.kind === 'llm' && inUse) await unloadLlm();
    if (spec.kind === 'stt' && inUse) await unloadStt();
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
    <View style={[styles.model, { borderColor: t.line, borderRadius: t.radiusChip }]}>
      <View style={styles.modelHead}>
        <Body style={{ flex: 1 }}>{spec.label}</Body>
        <Meta>{formatBytes(spec.bytes)}</Meta>
      </View>
      <Body style={{ color: t.dim }}>{spec.note}</Body>

      {progress !== null ? (
        <>
          <View style={[styles.progressTrack, { backgroundColor: t.line }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%`, backgroundColor: t.ink },
              ]}
            />
          </View>
          <GhostButton
            label={`Cancel (${Math.round(progress * 100)}%)`}
            onPress={() => cancelFn?.()}
          />
        </>
      ) : present ? (
        <View style={styles.modelActions}>
          <Meta style={{ color: t.ink }}>{inUse ? 'Loaded' : 'Downloaded'}</Meta>
          <Pressable onPress={() => void remove()} hitSlop={8}>
            <Meta>Delete</Meta>
          </Pressable>
        </View>
      ) : (
        <>
          <InkButton label="Download" onPress={() => void start()} />
          <GhostButton label="Import from Files" onPress={() => void pickFile()} />
        </>
      )}

      {error ? <Meta>{error}</Meta> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Bento span={2} style={{ gap: 10 }}>
      <BentoLabel>{title}</BentoLabel>
      {children}
    </Bento>
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
      <Body style={{ flex: 1 }}>{label}</Body>
      <InkSwitch value={value} onValueChange={onChange} />
    </View>
  );
}

function InkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: t.inverse,
        borderRadius: t.radiusChip,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <Meta style={{ color: t.inverseInk }}>{label}</Meta>
    </Pressable>
  );
}

function GhostButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.line,
        borderRadius: t.radiusChip,
        paddingVertical: 12,
        alignItems: 'center',
      }}
    >
      <Meta>{label}</Meta>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: PAGE_MARGIN,
    gap: GUTTER,
    paddingBottom: 48,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
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
  model: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 8,
  },
  modelHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  modelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  progressTrack: {
    height: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 2 },
});
