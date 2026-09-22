import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { prepareNotifications } from '../notify';
import { startListenService, stopListenService } from '../native/listen';
import { subscribeGate } from '../share/confirmGate';
import { loadSettings, peekSettings } from '../settings/store';
import { resampleTo16k } from './resample';
import { decodePcm } from './pcm';
import { WHISPER_SAMPLE_RATE } from './stt';
import { voiceSession, type SessionSnapshot } from './session';

/**
 * Bridges the native microphone stream into the voice session.
 *
 * expo-audio's `useAudioStream` hands us raw PCM buffers as they are captured. We
 * request 16 kHz, but many Android HALs still deliver 48 kHz, so we resample before
 * the VAD and Whisper see the audio.
 */

type VoiceContextValue = {
  snapshot: SessionSnapshot;
  micGranted: boolean | null;
  isStreaming: boolean;
  /** False when notifications were denied so the mic FGS could not start. */
  backgroundListenOk: boolean | null;
  setListening: (on: boolean) => Promise<void>;
  pushToTalk: () => Promise<void>;
  refreshMic: () => Promise<boolean>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => voiceSession.getSnapshot());
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [backgroundListenOk, setBackgroundListenOk] = useState<boolean | null>(null);
  const wantStream = useRef(false);
  /** User toggle wins over the async always-listen restore. */
  const listenIntent = useRef<'unset' | 'on' | 'off'>('unset');
  const startStreamRef = useRef<() => Promise<boolean>>(async () => false);
  const lastListenState = useRef<SessionSnapshot['state'] | null>(null);

  useEffect(() => voiceSession.subscribe(setSnapshot), []);

  useEffect(() => {
    void (async () => {
      const current = await getRecordingPermissionsAsync();
      setMicGranted(current.granted);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  const { stream, isStreaming } = useAudioStream({
    sampleRate: WHISPER_SAMPLE_RATE,
    channels: 1,
    encoding: 'float32',
    onBuffer: (buffer) => {
      const pcm = decodePcm(buffer.data);
      const resampled = resampleTo16k(pcm, buffer.sampleRate);
      voiceSession.pushAudio(resampled, WHISPER_SAMPLE_RATE);
    },
  });

  const ensureMic = useCallback(async (): Promise<boolean> => {
    const current = await getRecordingPermissionsAsync();
    if (current.granted) {
      setMicGranted(true);
      return true;
    }
    const asked = await requestRecordingPermissionsAsync();
    setMicGranted(asked.granted);
    return asked.granted;
  }, []);

  const refreshMic = useCallback(async (): Promise<boolean> => {
    const current = await getRecordingPermissionsAsync();
    setMicGranted(current.granted);
    return current.granted;
  }, []);

  const startStream = useCallback(async () => {
    if (wantStream.current) return true;
    if (!(await ensureMic())) return false;

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await stream.start();
    wantStream.current = true;

    const notifyOk = await prepareNotifications();
    if (notifyOk) {
      startListenService();
      setBackgroundListenOk(true);
    } else {
      setBackgroundListenOk(false);
    }
    return true;
  }, [ensureMic, stream]);

  startStreamRef.current = startStream;

  const remicForListen = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    if (wantStream.current) {
      stream.stop();
      wantStream.current = false;
    }
    await startStreamRef.current();
  }, [stream]);

  // TTS can steal the recording session. Re-arm the mic when we start listening again.
  useEffect(() => {
    const state = snapshot.state;
    const entered =
      (state === 'listening' || state === 'confirming') && lastListenState.current !== state;
    lastListenState.current = state;
    if (!entered) return;
    void remicForListen();
  }, [remicForListen, snapshot.state]);

  const setListening = useCallback(
    async (on: boolean) => {
      listenIntent.current = on ? 'on' : 'off';
      if (on) {
        if (await startStream()) voiceSession.start();
        return;
      }

      voiceSession.stop();
      stream.stop();
      stopListenService();
      wantStream.current = false;
    },
    [startStream, stream],
  );

  const pushToTalk = useCallback(async () => {
    if (!(await startStream())) return;
    voiceSession.beginPushToTalk();
  }, [startStream]);

  // Restore VAD + always-listen once. A late restore must not override the user.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await loadSettings();
      if (cancelled) return;
      voiceSession.configureVad(settings.vadThreshold);
      if (listenIntent.current !== 'unset') return;
      if (settings.alwaysListening) await startStreamRef.current().then((ok) => {
        if (ok && listenIntent.current !== 'off') voiceSession.start();
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Spoken confirm needs the mic even if always-listen is off.
  useEffect(
    () =>
      subscribeGate((gate) => {
        if (gate.pending && peekSettings().voiceConfirm) {
          void startStreamRef.current();
        }
      }),
    [],
  );

  useEffect(
    () => () => {
      voiceSession.stop();
      stream.stop();
      stopListenService();
      wantStream.current = false;
    },
    [stream],
  );

  return (
    <VoiceContext.Provider
      value={{
        snapshot,
        micGranted,
        isStreaming,
        backgroundListenOk,
        setListening,
        pushToTalk,
        refreshMic,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoice must be used inside <VoiceProvider>');
  return value;
}
