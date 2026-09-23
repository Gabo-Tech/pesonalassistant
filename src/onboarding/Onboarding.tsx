import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Device from 'expo-device';
import { loadLlm } from '../llm/engine';
import {
  MODELS,
  downloadModel,
  formatBytes,
  isDownloaded,
  localPath,
  type ModelSpec,
} from '../models/catalog';
import { recommendForRam } from '../models/devicePick';
import { prepareNotifications } from '../notify';
import { useSettings } from '../settings/store';
import { useT } from '../i18n';
import { localeWakeWord } from '../i18n/wake';
import { Bento, BentoLabel, Chip, GUTTER, InkSwitch, PAGE_MARGIN } from '../ui/Bento';
import { useTheme } from '../ui/ThemeProvider';
import { Body, Display, Meta } from '../ui/Type';
import { loadStt } from '../voice/stt';
import { listTtsVoices } from '../voice/tts';
import { useVoice } from '../voice/VoiceProvider';

/**
 * First launch only. Four steps, one job each. Skip is allowed: typed commands
 * work without models.
 */
export function Onboarding() {
  const t = useTheme();
  const tr = useT();
  const [settings, updateSettings] = useSettings();
  const { refreshMic, setListening } = useVoice();
  const [step, setStep] = useState(0);
  const [wakeWord, setWakeWord] = useState(settings.wakeWord);
  const [alwaysListen, setAlwaysListen] = useState(false);
  const [micState, setMicState] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ram, setRam] = useState<number | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const pick = recommendForRam(ram, settings.locale);
  const sttPick = MODELS.find((model) => model.id === pick.sttId)!;
  const llmPick = MODELS.find((model) => model.id === pick.llmId)!;
  const heavier = pick.heavierLlmId
    ? MODELS.find((model) => model.id === pick.heavierLlmId)
    : null;

  useEffect(() => {
    setRam(Device.totalMemory);
    void listTtsVoices().then((voices) => {
      const neural = voices.find((voice) => voice.neural) ?? voices[0];
      if (neural) void updateSettings({ ttsVoiceId: neural.identifier });
    });
  }, [settings.locale, updateSettings]);

  useEffect(
    () => () => {
      cancelRef.current?.();
    },
    [],
  );

  const finish = useCallback(
    async (patch: { wakeWord: string; alwaysListening: boolean }) => {
      await updateSettings({ ...patch, onboardingComplete: true });
      if (patch.alwaysListening) await setListening(true);
    },
    [setListening, updateSettings],
  );

  const askMic = useCallback(async () => {
    const asked = await requestRecordingPermissionsAsync();
    setMicState(asked.granted ? 'granted' : 'denied');
    await refreshMic();
  }, [refreshMic]);

  const saveWake = useCallback(async () => {
    const word = wakeWord.trim() || localeWakeWord(settings.locale, '');
    setWakeWord(word);
    await updateSettings({ wakeWord: word, alwaysListening: alwaysListen });
    if (alwaysListen) await prepareNotifications();
    setStep(3);
  }, [alwaysListen, settings.locale, updateSettings, wakeWord]);

  const downloadRecommended = useCallback(async () => {
    setError(null);
    setBusy(true);
    setProgress(0);
    const sttSpec = sttPick;
    const pairBytes = sttSpec.bytes + llmPick.bytes;

    const run = async (spec: ModelSpec, offset: number, weight: number) => {
      if (isDownloaded(spec)) {
        setProgress(offset + weight);
        return localPath(spec)!;
      }

      const handle = downloadModel(spec, (fraction) => {
        setProgress(offset + weight * fraction);
      });
      cancelRef.current = handle.cancel;
      const uri = await handle.promise;
      cancelRef.current = null;
      return uri;
    };

    try {
      setPhase(tr('onboarding.speech'));
      const sttUri = await run(sttSpec, 0, sttSpec.bytes / pairBytes);
      await loadStt(sttUri);
      await updateSettings({ sttModelPath: sttUri });

      setPhase(tr('onboarding.llm'));
      const llmUri = await run(
        llmPick,
        sttSpec.bytes / pairBytes,
        llmPick.bytes / pairBytes,
      );
      await loadLlm(llmUri);
      await updateSettings({ llmModelPath: llmUri });

      setProgress(1);
      await finish({
        wakeWord: wakeWord.trim() || localeWakeWord(settings.locale, ''),
        alwaysListening: alwaysListen,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setPhase(null);
    }
  }, [alwaysListen, finish, llmPick, settings.locale, sttPick, tr, updateSettings, wakeWord]);

  const skip = useCallback(async () => {
    cancelRef.current?.();
    await finish({
      wakeWord: wakeWord.trim() || localeWakeWord(settings.locale, ''),
      alwaysListening: alwaysListen,
    });
  }, [alwaysListen, finish, settings.locale, wakeWord]);

  const pairBytes = sttPick.bytes + llmPick.bytes;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.page}>
        <Meta>{tr('onboarding.step', { n: step + 1 })}</Meta>

        {step === 0 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>{tr('onboarding.welcome')}</BentoLabel>
            <Display>{tr('onboarding.welcomeTitle')}</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>{tr('onboarding.welcomeBody')}</Body>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Chip
                label={tr('settings.english')}
                active={settings.locale === 'en'}
                onPress={() => {
                  void updateSettings({
                    locale: 'en',
                    wakeWord: localeWakeWord('en', wakeWord),
                  });
                  setWakeWord((word) => localeWakeWord('en', word));
                }}
              />
              <Chip
                label={tr('settings.spanish')}
                active={settings.locale === 'es'}
                onPress={() => {
                  void updateSettings({
                    locale: 'es',
                    wakeWord: localeWakeWord('es', wakeWord),
                  });
                  setWakeWord((word) => localeWakeWord('es', word));
                }}
              />
            </View>
          </Bento>
        )}

        {step === 1 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>{tr('onboarding.voice')}</BentoLabel>
            <Display>{tr('onboarding.micTitle')}</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>{tr('onboarding.micBody')}</Body>
            {micState === 'granted' && (
              <Body style={{ marginTop: 16 }}>{tr('onboarding.micOn')}</Body>
            )}
            {micState === 'denied' && (
              <Body style={{ marginTop: 16, color: t.dim }}>{tr('onboarding.micDenied')}</Body>
            )}
          </Bento>
        )}

        {step === 2 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>{tr('onboarding.wake')}</BentoLabel>
            <Display>{tr('onboarding.wakeTitle')}</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>{tr('onboarding.wakeBody')}</Body>
            <TextInput
              value={wakeWord}
              onChangeText={setWakeWord}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={localeWakeWord(settings.locale, '')}
              placeholderTextColor={t.dim}
              style={[
                styles.input,
                {
                  color: t.ink,
                  borderColor: t.line,
                  borderRadius: t.radiusChip,
                },
              ]}
            />
            <View style={styles.toggleRow}>
              <Body style={{ flex: 1 }}>{tr('onboarding.alwaysListen')}</Body>
              <InkSwitch
                value={alwaysListen}
                onValueChange={(on) => {
                  setAlwaysListen(on);
                  if (on) void prepareNotifications();
                }}
              />
            </View>
            <Body style={{ color: t.dim }}>{tr('onboarding.alwaysHint')}</Body>
          </Bento>
        )}

        {step === 3 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>{tr('onboarding.models')}</BentoLabel>
            <Display>{tr('onboarding.modelsTitle')}</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>
              {tr('onboarding.modelsBody', { size: formatBytes(pairBytes) })}
            </Body>
            <Body style={{ marginTop: 12 }}>
              {tr('onboarding.forThisPhone', {
                ram: ram ? formatBytes(ram) : '…',
              })}
              {'\n'}
              {sttPick.label}
              {'\n'}
              {llmPick.label}
              {heavier
                ? `\n${tr('onboarding.heavierOptional', { name: heavier.label })}`
                : ''}
            </Body>
            {busy && (
              <View style={{ gap: 8, marginTop: 16 }}>
                <Meta>{phase ?? tr('settings.download')}</Meta>
                <View style={[styles.track, { backgroundColor: t.line }]}>
                  <View
                    style={[
                      styles.fill,
                      { width: `${Math.round(progress * 100)}%`, backgroundColor: t.ink },
                    ]}
                  />
                </View>
                <Meta>{Math.round(progress * 100)}%</Meta>
              </View>
            )}
            {error ? <Body style={{ marginTop: 12, color: t.dim }}>{error}</Body> : null}
          </Bento>
        )}

        <View style={styles.actions}>
          {step === 0 && (
            <InkButton label={tr('onboarding.continue')} onPress={() => setStep(1)} />
          )}

          {step === 1 && (
            <>
              {micState !== 'granted' && (
                <InkButton label={tr('onboarding.allowMic')} onPress={() => void askMic()} />
              )}
              {micState === 'granted' ? (
                <InkButton label={tr('onboarding.continue')} onPress={() => setStep(2)} />
              ) : (
                <GhostButton label={tr('onboarding.skipMic')} onPress={() => setStep(2)} />
              )}
              <GhostButton label={tr('onboarding.back')} onPress={() => setStep(0)} />
            </>
          )}

          {step === 2 && (
            <>
              <InkButton label={tr('onboarding.continue')} onPress={() => void saveWake()} />
              <GhostButton label={tr('onboarding.back')} onPress={() => setStep(1)} />
            </>
          )}

          {step === 3 && (
            <>
              {!busy && (
                <InkButton
                  label={tr('onboarding.download')}
                  onPress={() => void downloadRecommended()}
                />
              )}
              <GhostButton label={tr('onboarding.skip')} onPress={() => void skip()} />
              {!busy && <GhostButton label={tr('onboarding.back')} onPress={() => setStep(2)} />}
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
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
        paddingVertical: 14,
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
        paddingVertical: 14,
        alignItems: 'center',
      }}
    >
      <Meta>{label}</Meta>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: {
    flex: 1,
    padding: PAGE_MARGIN,
    gap: GUTTER,
    justifyContent: 'space-between',
  },
  card: { gap: 4 },
  actions: { gap: 10, paddingBottom: 8 },
  input: {
    marginTop: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 18,
    marginBottom: 8,
  },
  track: { height: 2, overflow: 'hidden' },
  fill: { height: 2 },
});
