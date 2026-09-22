import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { resolveModel } from '../src/boot';
import { writableCalendars, ensureCalendarPermission, hasCalendarPermission } from '../src/calendar/events';
import { deleteFact, listFacts, type Fact } from '../src/db/facts';
import { useT } from '../src/i18n';
import { localeWakeWord, type Locale } from '../src/i18n/wake';
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
import { openAccessibilitySettings, openTtsSettings } from '../src/share/intents';
import { useSettings } from '../src/settings/store';
import { Bento, BentoLabel, Chip, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Meta } from '../src/ui/Type';
import { voiceSession } from '../src/voice/session';
import { isSttReady, loadStt, sttLoadedPath, unloadStt } from '../src/voice/stt';
import { listTtsVoices, speak } from '../src/voice/tts';
import { formatVoiceLabel, type RankedVoice } from '../src/voice/voices';

const SENSITIVITY = [
  { labelKey: 'voice.quiet' as const, value: 0.008 },
  { labelKey: 'voice.normal' as const, value: 0.015 },
  { labelKey: 'voice.noisy' as const, value: 0.03 },
];

export default function SettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const [settings, updateSettings] = useSettings();
  const [engine, setEngine] = useState<EngineStatus>({ state: 'unloaded' });
  const [crawlerOn, setCrawlerOn] = useState(false);
  const [calendars, setCalendars] = useState<{ id: string; title: string }[]>([]);
  const [calendarDenied, setCalendarDenied] = useState(false);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [voices, setVoices] = useState<RankedVoice[]>([]);

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

  const loadFacts = useCallback(async () => {
    setFacts(await listFacts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCalendars();
      void loadFacts();
      setCrawlerOn(isCrawlerEnabled());
      void listTtsVoices().then(setVoices);
    }, [loadCalendars, loadFacts]),
  );

  const setSensitivity = useCallback(
    async (value: number) => {
      await updateSettings({ vadThreshold: value });
      voiceSession.configureVad(value);
    },
    [updateSettings],
  );

  const setLocale = useCallback(
    async (locale: Locale) => {
      await updateSettings({
        locale,
        wakeWord: localeWakeWord(locale, settings.wakeWord),
        ttsVoiceId: null,
      });
      void listTtsVoices().then(setVoices);
    },
    [settings.wakeWord, updateSettings],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
    >
      <Section title={tr('settings.appearance')}>
        <Body style={{ color: t.dim }}>{tr('settings.appearanceHint')}</Body>
        <View style={styles.chipRow}>
          <Chip
            label={tr('settings.dark')}
            active={settings.appearance === 'dark'}
            onPress={() => void updateSettings({ appearance: 'dark' })}
          />
          <Chip
            label={tr('settings.light')}
            active={settings.appearance === 'light'}
            onPress={() => void updateSettings({ appearance: 'light' })}
          />
        </View>
      </Section>

      <Section title={tr('settings.language')}>
        <Body style={{ color: t.dim }}>{tr('settings.languageHint')}</Body>
        <View style={styles.chipRow}>
          <Chip
            label={tr('settings.english')}
            active={settings.locale === 'en'}
            onPress={() => void setLocale('en')}
          />
          <Chip
            label={tr('settings.spanish')}
            active={settings.locale === 'es'}
            onPress={() => void setLocale('es')}
          />
        </View>
      </Section>

      <Section title={tr('settings.wake')}>
        <Body style={{ color: t.dim }}>{tr('settings.wakeHint')}</Body>
        <TextInput
          value={settings.wakeWord}
          onChangeText={(text) => void updateSettings({ wakeWord: text })}
          autoCapitalize="none"
          placeholder={settings.locale === 'es' ? 'computadora' : 'computer'}
          placeholderTextColor={t.dim}
          style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
        />
        <Body style={{ color: t.dim }}>{tr('settings.wakeDetect')}</Body>
      </Section>

      <Section title={tr('settings.calendar')}>
        {calendarDenied ? (
          <>
            <Body style={{ color: t.dim }}>{tr('settings.calendarNeed')}</Body>
            <InkButton label={tr('settings.calendarGrant')} onPress={() => void loadCalendars(true)} />
          </>
        ) : calendars.length === 0 ? (
          <Body style={{ color: t.dim }}>{tr('settings.calendarNone')}</Body>
        ) : (
          <>
            <Body style={{ color: t.dim }}>{tr('settings.calendarPick')}</Body>
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

      <Section title={tr('settings.memory')}>
        <Body style={{ color: t.dim }}>{tr('settings.memoryHint')}</Body>
        {facts.length === 0 ? (
          <Body style={{ color: t.dim }}>{tr('settings.noFacts')}</Body>
        ) : (
          facts.map((fact) => (
            <View
              key={fact.id}
              style={[styles.factRow, { borderColor: t.line, borderRadius: t.radiusChip }]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Meta>{fact.title}</Meta>
                <Body>{fact.text}</Body>
              </View>
              <Pressable
                onPress={() => {
                  void (async () => {
                    await deleteFact(fact.id);
                    await loadFacts();
                  })();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${tr('common.delete')} ${fact.title}`}
                style={{ paddingVertical: 8, paddingHorizontal: 4 }}
              >
                <Meta>{tr('common.delete')}</Meta>
              </Pressable>
            </View>
          ))
        )}
      </Section>

      <Section title={tr('settings.voice')}>
        <Toggle
          label={tr('voice.speakReplies')}
          value={settings.speakReplies}
          onChange={(value) => void updateSettings({ speakReplies: value })}
        />
        <Toggle
          label={tr('voice.voiceConfirm')}
          value={settings.voiceConfirm}
          onChange={(value) => void updateSettings({ voiceConfirm: value })}
        />
        <Body style={{ color: t.dim }}>{tr('voice.voiceConfirmHint')}</Body>

        <Meta style={{ marginTop: 8 }}>{tr('voice.sensitivity')}</Meta>
        <View style={styles.chipRow}>
          {SENSITIVITY.map((option) => (
            <Chip
              key={option.value}
              label={tr(option.labelKey)}
              active={Math.abs(settings.vadThreshold - option.value) < 0.0001}
              onPress={() => void setSensitivity(option.value)}
            />
          ))}
        </View>

        <Meta style={{ marginTop: 8 }}>{tr('voice.voices')}</Meta>
        {voices.length === 0 ? (
          <Body style={{ color: t.dim }}>{tr('voice.noVoices')}</Body>
        ) : (
          voices.slice(0, 12).map((voice) => {
            const active = settings.ttsVoiceId === voice.identifier;
            return (
              <Pressable
                key={voice.identifier}
                onPress={() => void updateSettings({ ttsVoiceId: voice.identifier })}
                style={[
                  styles.factRow,
                  {
                    borderColor: active ? t.ink : t.line,
                    borderRadius: t.radiusChip,
                    paddingVertical: 10,
                  },
                ]}
              >
                <Body style={{ flex: 1 }}>
                  {formatVoiceLabel(voice, tr('voice.neural'))}
                </Body>
              </Pressable>
            );
          })
        )}
        <InkButton
          label={tr('voice.tryVoice')}
          onPress={() => speak(tr('voice.trySample'))}
        />
        <GhostButton label={tr('voice.openTts')} onPress={() => void openTtsSettings()} />

        <Meta style={{ marginTop: 8 }}>{tr('voice.rate')}</Meta>
        <View style={styles.chipRow}>
          {[
            { label: tr('voice.slow'), value: 0.75 },
            { label: tr('voice.normal'), value: 1 },
            { label: tr('voice.fast'), value: 1.15 },
          ].map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={Math.abs(settings.ttsRate - option.value) < 0.001}
              onPress={() => void updateSettings({ ttsRate: option.value })}
            />
          ))}
        </View>
        <Meta style={{ marginTop: 8 }}>{tr('voice.pitch')}</Meta>
        <View style={styles.chipRow}>
          {[
            { label: tr('voice.low'), value: 0.85 },
            { label: tr('voice.normal'), value: 1 },
            { label: tr('voice.high'), value: 1.15 },
          ].map((option) => (
            <Chip
              key={`p-${option.value}`}
              label={option.label}
              active={Math.abs(settings.ttsPitch - option.value) < 0.001}
              onPress={() => void updateSettings({ ttsPitch: option.value })}
            />
          ))}
        </View>
      </Section>

      <Section title={tr('settings.models')}>
        <Body style={{ color: t.dim }}>{tr('settings.modelsHint')}</Body>
        {MODELS.map((spec) => (
          <ModelRow key={spec.id} spec={spec} engine={engine} />
        ))}
      </Section>

      <Section title={tr('settings.sending')}>
        <Body style={{ color: t.dim }}>{tr('settings.sendingHint')}</Body>
        {isCrawlerAvailable() ? (
          <>
            <Body>{crawlerOn ? tr('settings.crawlerOn') : tr('settings.crawlerOff')}</Body>
            <InkButton
              label={tr('settings.accessibility')}
              onPress={() => {
                void openAccessibilitySettings();
              }}
            />
            <GhostButton label={tr('settings.recheck')} onPress={() => setCrawlerOn(isCrawlerEnabled())} />
          </>
        ) : (
          <Body>{tr('settings.crawlerMissing')}</Body>
        )}
        <Body style={{ color: t.dim }}>{tr('settings.sendingNote')}</Body>
      </Section>

      <Section title={tr('settings.privacy')}>
        <Body style={{ color: t.dim }}>{tr('settings.privacyHint')}</Body>
      </Section>
    </ScrollView>
  );
}

function ModelRow({ spec, engine }: { spec: ModelSpec; engine: EngineStatus }) {
  const t = useTheme();
  const tr = useT();
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
            label={`${tr('common.cancel')} (${Math.round(progress * 100)}%)`}
            onPress={() => cancelFn?.()}
          />
        </>
      ) : present ? (
        <View style={styles.modelActions}>
          <Meta style={{ color: t.ink }}>{inUse ? tr('settings.loaded') : tr('settings.downloaded')}</Meta>
          <Pressable onPress={() => void remove()} hitSlop={8}>
            <Meta>{tr('common.delete')}</Meta>
          </Pressable>
        </View>
      ) : (
        <>
          <InkButton label={tr('settings.download')} onPress={() => void start()} />
          <GhostButton label={tr('settings.import')} onPress={() => void pickFile()} />
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
  factRow: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
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
