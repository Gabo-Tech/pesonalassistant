import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { resolveModel } from '../src/boot';
import { writableCalendars, ensureCalendarPermission, hasCalendarPermission } from '../src/calendar/events';
import { deleteFact, listFacts, type Fact } from '../src/db/facts';
import { useT } from '../src/i18n';
import { localeWakeWord, type Locale } from '../src/i18n/wake';
import { loadLlm, subscribeEngine, unloadLlm, type EngineStatus } from '../src/llm/engine';
import { CLOUD_PRESETS } from '../src/llm/cloud';
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
import { useSettings, type LlmProvider } from '../src/settings/store';
import { clearCloudKey, readCloudKey, saveCloudKey } from '../src/settings/secrets';
import { Bento, BentoLabel, Chip, GUTTER, InkSwitch, PAGE_MARGIN } from '../src/ui/Bento';
import { Button, TextAction } from '../src/ui/Button';
import { KeyboardGutter } from '../src/ui/KeyboardGutter';
import { useTheme } from '../src/ui/ThemeProvider';
import { Body, Display, Meta } from '../src/ui/Type';
import { voiceSession } from '../src/voice/session';
import { isSttReady, loadStt, sttLoadedPath, unloadStt } from '../src/voice/stt';
import { listTtsVoices, speak } from '../src/voice/tts';
import { formatVoiceLabel, type RankedVoice } from '../src/voice/voices';

const SENSITIVITY = [
  { labelKey: 'voice.quiet' as const, value: 0.005 },
  { labelKey: 'voice.normal' as const, value: 0.01 },
  { labelKey: 'voice.noisy' as const, value: 0.03 },
];

const CLOUD_CHOICES = ['local', 'openai', 'anthropic', 'gemini', 'openrouter'] as const;

function cloudLabelKey(
  provider: LlmProvider,
): 'settings.cloudLocal' | 'settings.cloudOpenAI' | 'settings.cloudAnthropic' | 'settings.cloudGemini' | 'settings.cloudOpenRouter' {
  if (provider === 'openai') return 'settings.cloudOpenAI';
  if (provider === 'anthropic') return 'settings.cloudAnthropic';
  if (provider === 'gemini') return 'settings.cloudGemini';
  if (provider === 'openrouter') return 'settings.cloudOpenRouter';
  return 'settings.cloudLocal';
}

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
  const [diskRev, setDiskRev] = useState(0);
  const [bulkProgress, setBulkProgress] = useState<{ name: string; fraction: number } | null>(null);
  const [voicesOpen, setVoicesOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyTail, setKeyTail] = useState<string | null>(null);
  const bulkCancel = useRef<(() => void) | null>(null);

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
      void readCloudKey().then((value) => setKeyTail(value ? value.slice(-4) : null));
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

  const remaining = MODELS.filter((spec) => !isDownloaded(spec));
  const remainingBytes = remaining.reduce((sum, spec) => sum + spec.bytes, 0);

  const downloadRemaining = useCallback(async () => {
    const queue = MODELS.filter((spec) => !isDownloaded(spec));
    if (queue.length === 0) return;
    const total = queue.reduce((sum, spec) => sum + spec.bytes, 0);
    let offset = 0;
    setBulkProgress({ name: queue[0].label, fraction: 0 });

    try {
      for (const spec of queue) {
        if (isDownloaded(spec)) {
          offset += spec.bytes;
          continue;
        }
        setBulkProgress({ name: spec.label, fraction: offset / total });
        const handle = downloadModel(spec, (fraction) => {
          setBulkProgress({
            name: spec.label,
            fraction: (offset + spec.bytes * fraction) / total,
          });
        });
        bulkCancel.current = handle.cancel;
        await handle.promise;
        bulkCancel.current = null;
        offset += spec.bytes;
        setDiskRev((value) => value + 1);
      }
    } catch {
      bulkCancel.current = null;
      setBulkProgress(null);
      setDiskRev((value) => value + 1);
      return;
    }
    setBulkProgress(null);
    setDiskRev((value) => value + 1);
  }, []);

  return (
    <KeyboardGutter style={{ backgroundColor: t.bg }}>
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
        <Body style={{ color: t.dim }}>{tr('settings.calendarModeHint')}</Body>
        <View style={styles.chipRow}>
          <Chip
            label={tr('settings.calendarApp')}
            active={settings.calendarMode !== 'phone'}
            onPress={() => void updateSettings({ calendarMode: 'app' })}
          />
          <Chip
            label={tr('settings.calendarPhone')}
            active={settings.calendarMode === 'phone'}
            onPress={() => void updateSettings({ calendarMode: 'phone' })}
          />
        </View>
        {settings.calendarMode === 'phone' ? (
          calendarDenied ? (
            <>
              <Body style={{ color: t.dim }}>{tr('settings.calendarNeed')}</Body>
              <Button label={tr('settings.calendarGrant')} onPress={() => void loadCalendars(true)} />
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
          )
        ) : null}
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
              <TextAction
                label={tr('common.delete')}
                danger
                onPress={() => {
                  void (async () => {
                    await deleteFact(fact.id);
                    await loadFacts();
                  })();
                }}
              />
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
          <>
            <Body>
              {formatVoiceLabel(
                voices.find((voice) => voice.identifier === settings.ttsVoiceId) ?? voices[0],
                tr('voice.neural'),
              )}
            </Body>
            <Button
              tone="secondary"
              label={voicesOpen ? tr('settings.hideVoices') : tr('settings.chooseVoice')}
              onPress={() => setVoicesOpen((open) => !open)}
            />
            {voicesOpen
              ? voices.slice(0, 12).map((voice) => {
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
                      <Body style={{ flex: 1 }}>{formatVoiceLabel(voice, tr('voice.neural'))}</Body>
                    </Pressable>
                  );
                })
              : null}
          </>
        )}
        <Button
          label={tr('voice.tryVoice')}
          onPress={() => speak(tr('voice.trySample'))}
        />
        <Button tone="secondary" label={tr('voice.openTts')} onPress={() => void openTtsSettings()} />

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

      <Display style={{ fontSize: 28, width: '100%', marginTop: 8 }}>{tr('settings.advanced')}</Display>

      <Section title={tr('settings.models')}>
        <Body style={{ color: t.dim }}>{tr('settings.modelsHint')}</Body>
        {remaining.length > 0 ? (
          bulkProgress ? (
            <>
              <Meta>{tr('settings.downloadingRemaining', { name: bulkProgress.name })}</Meta>
              <View style={[styles.progressTrack, { backgroundColor: t.line }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(bulkProgress.fraction * 100)}%`, backgroundColor: t.ink },
                  ]}
                />
              </View>
              <Button tone="secondary"
                label={`${tr('common.cancel')} (${Math.round(bulkProgress.fraction * 100)}%)`}
                onPress={() => bulkCancel.current?.()}
              />
            </>
          ) : (
            <Button
              label={`${tr('settings.downloadRemaining')} (${formatBytes(remainingBytes)})`}
              onPress={() => void downloadRemaining()}
            />
          )
        ) : null}
        {MODELS.map((spec) => (
          <ModelRow key={spec.id} spec={spec} engine={engine} diskRev={diskRev} />
        ))}
      </Section>

      <Section title={tr('settings.cloud')}>
        <Body style={{ color: t.dim }}>{tr('settings.cloudHint')}</Body>
        <View style={styles.chipRow}>
          {CLOUD_CHOICES.map((provider) => (
            <Chip
              key={provider}
              label={tr(cloudLabelKey(provider))}
              active={settings.llmProvider === provider}
              onPress={() => void updateSettings({ llmProvider: provider })}
            />
          ))}
        </View>
        {settings.llmProvider !== 'local' ? (
          <>
            <View style={styles.chipRow}>
              {CLOUD_PRESETS[settings.llmProvider].map((model) => (
                <Chip
                  key={model}
                  label={model}
                  active={settings.cloudModel === model}
                  onPress={() => void updateSettings({ cloudModel: model })}
                />
              ))}
            </View>
            <TextInput
              value={settings.cloudModel}
              onChangeText={(cloudModel) => void updateSettings({ cloudModel })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={tr('settings.cloudModel')}
              placeholderTextColor={t.dim}
              style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
            />
            <TextInput
              value={keyDraft}
              onChangeText={setKeyDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder={
                keyTail ? tr('settings.cloudKeySaved', { tail: keyTail }) : tr('settings.cloudKey')
              }
              placeholderTextColor={t.dim}
              style={[styles.input, { color: t.ink, borderColor: t.line, borderRadius: t.radiusChip }]}
            />
            <Button
              label={tr('settings.cloudSave')}
              onPress={() => {
                const next = keyDraft.trim();
                if (!next) return;
                void saveCloudKey(next).then(() => {
                  setKeyTail(next.slice(-4));
                  setKeyDraft('');
                });
              }}
            />
            {keyTail ? (
              <Button tone="secondary"
                label={tr('settings.cloudClear')}
                onPress={() => {
                  void clearCloudKey().then(() => {
                    setKeyTail(null);
                    setKeyDraft('');
                  });
                }}
              />
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title={tr('settings.sending')}>
        <Body style={{ color: t.dim }}>{tr('settings.sendingHint')}</Body>
        {isCrawlerAvailable() ? (
          <>
            <Body>{crawlerOn ? tr('settings.crawlerOn') : tr('settings.crawlerOff')}</Body>
            <Button
              label={tr('settings.accessibility')}
              onPress={() => {
                void openAccessibilitySettings();
              }}
            />
            <Button tone="secondary" label={tr('settings.recheck')} onPress={() => setCrawlerOn(isCrawlerEnabled())} />
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
    </KeyboardGutter>
  );
}

function ModelRow({
  spec,
  engine,
  diskRev,
}: {
  spec: ModelSpec;
  engine: EngineStatus;
  diskRev: number;
}) {
  const t = useTheme();
  const tr = useT();
  const [present, setPresent] = useState(() => isDownloaded(spec));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelFn, setCancelFn] = useState<(() => void) | null>(null);
  const [, updateSettings] = useSettings();

  useEffect(() => {
    setPresent(isDownloaded(spec));
  }, [diskRev, spec]);

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
    if (fallback && spec.kind === 'llm') await loadLlm(fallback.path);
    if (fallback && spec.kind === 'stt') await loadStt(fallback.path);
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
          <Button tone="secondary"
            label={`${tr('common.cancel')} (${Math.round(progress * 100)}%)`}
            onPress={() => cancelFn?.()}
          />
        </>
      ) : present ? (
        <View style={styles.modelActions}>
          <Meta style={{ color: t.ink }}>{inUse ? tr('settings.loaded') : tr('settings.downloaded')}</Meta>
          <View style={styles.chipRow}>
            {!inUse && localPath(spec) ? (
              <TextAction label={tr('settings.use')} onPress={() => void activate(localPath(spec)!)} />
            ) : null}
            <TextAction label={tr('common.delete')} onPress={() => void remove()} danger />
          </View>
        </View>
      ) : (
        <>
          <Button label={tr('settings.download')} onPress={() => void start()} />
          <Button tone="secondary" label={tr('settings.import')} onPress={() => void pickFile()} />
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
