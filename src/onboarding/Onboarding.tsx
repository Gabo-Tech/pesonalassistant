import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { loadLlm } from '../llm/engine';
import {
  downloadModel,
  formatBytes,
  isDownloaded,
  localPath,
  MODELS,
} from '../models/catalog';
import { prepareNotifications } from '../notify';
import { useSettings } from '../settings/store';
import { Bento, BentoLabel, GUTTER, InkSwitch, PAGE_MARGIN } from '../ui/Bento';
import { useTheme } from '../ui/ThemeProvider';
import { Body, Display, Meta } from '../ui/Type';
import { loadStt } from '../voice/stt';
import { useVoice } from '../voice/VoiceProvider';

const RECOMMENDED_STT = MODELS.find((m) => m.id === 'whisper-tiny-en')!;
const RECOMMENDED_LLM = MODELS.find((m) => m.id === 'qwen2.5-1.5b-q4')!;
const PAIR_BYTES = RECOMMENDED_STT.bytes + RECOMMENDED_LLM.bytes;

/**
 * First launch only. Four steps, one job each. Skip is allowed: typed commands
 * work without models.
 */
export function Onboarding() {
  const t = useTheme();
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
  const cancelRef = useRef<(() => void) | null>(null);

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
    const word = wakeWord.trim() || 'computer';
    setWakeWord(word);
    await updateSettings({ wakeWord: word, alwaysListening: alwaysListen });
    if (alwaysListen) await prepareNotifications();
    setStep(3);
  }, [alwaysListen, updateSettings, wakeWord]);

  const downloadRecommended = useCallback(async () => {
    setError(null);
    setBusy(true);
    setProgress(0);

    const run = async (spec: typeof RECOMMENDED_STT, offset: number, weight: number) => {
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
      setPhase('Speech');
      const sttUri = await run(
        RECOMMENDED_STT,
        0,
        RECOMMENDED_STT.bytes / PAIR_BYTES,
      );
      await loadStt(sttUri);
      await updateSettings({ sttModelPath: sttUri });

      setPhase('Language model');
      const llmUri = await run(
        RECOMMENDED_LLM,
        RECOMMENDED_STT.bytes / PAIR_BYTES,
        RECOMMENDED_LLM.bytes / PAIR_BYTES,
      );
      await loadLlm(llmUri);
      await updateSettings({ llmModelPath: llmUri });

      setProgress(1);
      await finish({ wakeWord: wakeWord.trim() || 'computer', alwaysListening: alwaysListen });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setPhase(null);
    }
  }, [alwaysListen, finish, updateSettings, wakeWord]);

  const skip = useCallback(async () => {
    cancelRef.current?.();
    await finish({ wakeWord: wakeWord.trim() || 'computer', alwaysListening: alwaysListen });
  }, [alwaysListen, finish, wakeWord]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <View style={styles.page}>
        <Meta>
          {step + 1} of 4
        </Meta>

        {step === 0 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>Welcome</BentoLabel>
            <Display>Private by default</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>
              Speech and reasoning run on this phone. Messages to WhatsApp, Signal,
              or X only go out after you confirm.
            </Body>
          </Bento>
        )}

        {step === 1 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>Voice</BentoLabel>
            <Display>Microphone</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>
              Needed to hear you. You can still type if you skip this.
            </Body>
            {micState === 'granted' && (
              <Body style={{ marginTop: 16 }}>Microphone is on.</Body>
            )}
            {micState === 'denied' && (
              <Body style={{ marginTop: 16, color: t.dim }}>
                Voice is off. You can type, and you can allow the microphone later
                in system settings.
              </Body>
            )}
          </Bento>
        )}

        {step === 2 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>Wake</BentoLabel>
            <Display>Your wake word</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>
              Spoken to start a request. Two or three syllables work best.
            </Body>
            <TextInput
              value={wakeWord}
              onChangeText={setWakeWord}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="computer"
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
              <Body style={{ flex: 1 }}>Always listen for the wake word</Body>
              <InkSwitch
                value={alwaysListen}
                onValueChange={(on) => {
                  setAlwaysListen(on);
                  if (on) void prepareNotifications();
                }}
              />
            </View>
            <Body style={{ color: t.dim }}>
              Always-listen needs a persistent notification so Android will keep
              the microphone on.
            </Body>
          </Bento>
        )}

        {step === 3 && (
          <Bento span={2} style={styles.card}>
            <BentoLabel>Models</BentoLabel>
            <Display>Voice on this phone</Display>
            <Body style={{ color: t.dim, marginTop: 12 }}>
              Download speech and the language model once ({formatBytes(PAIR_BYTES)}).
              This is the only time the app uses the network. Typed commands work
              if you skip.
            </Body>
            <Body style={{ marginTop: 12 }}>
              {RECOMMENDED_STT.label}
              {'\n'}
              {RECOMMENDED_LLM.label}
            </Body>
            {busy && (
              <View style={{ gap: 8, marginTop: 16 }}>
                <Meta>{phase ?? 'Downloading'}</Meta>
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
            <InkButton label="Continue" onPress={() => setStep(1)} />
          )}

          {step === 1 && (
            <>
              {micState !== 'granted' && (
                <InkButton label="Allow microphone" onPress={() => void askMic()} />
              )}
              {micState === 'granted' ? (
                <InkButton label="Continue" onPress={() => setStep(2)} />
              ) : (
                <GhostButton label="Continue without voice" onPress={() => setStep(2)} />
              )}
              <GhostButton label="Back" onPress={() => setStep(0)} />
            </>
          )}

          {step === 2 && (
            <>
              <InkButton label="Continue" onPress={() => void saveWake()} />
              <GhostButton label="Back" onPress={() => setStep(1)} />
            </>
          )}

          {step === 3 && (
            <>
              {!busy && (
                <InkButton
                  label="Download"
                  onPress={() => void downloadRecommended()}
                />
              )}
              <GhostButton label="Skip for now" onPress={() => void skip()} />
              {!busy && <GhostButton label="Back" onPress={() => setStep(2)} />}
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
