import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioStream,
} from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { WHISPER_SAMPLE_RATE } from './stt';
import { voiceSession, type SessionSnapshot } from './session';

/**
 * Bridges the native microphone stream into the voice session.
 *
 * expo-audio's `useAudioStream` hands us raw PCM buffers as they are captured. We ask
 * for 16 kHz mono float32 - exactly what whisper.cpp wants - so no resampling is needed
 * anywhere in the pipeline.
 */

type VoiceContextValue = {
  snapshot: SessionSnapshot;
  micGranted: boolean | null;
  isStreaming: boolean;
  /** Turns always-on listening on/off. */
  setListening: (on: boolean) => Promise<void>;
  /** One-shot capture without the wake word. */
  pushToTalk: () => Promise<void>;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => voiceSession.getSnapshot());
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const wantStream = useRef(false);

  useEffect(() => voiceSession.subscribe(setSnapshot), []);

  useEffect(() => {
    void (async () => {
      const current = await getRecordingPermissionsAsync();
      setMicGranted(current.granted);

      // Recording must be explicitly allowed, and we keep playing (TTS) while recording.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  const { stream, isStreaming } = useAudioStream({
    sampleRate: WHISPER_SAMPLE_RATE,
    channels: 1,
    encoding: 'float32',
    onBuffer: (buffer) => {
      voiceSession.pushAudio(new Float32Array(buffer.data), buffer.sampleRate);
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

  const startStream = useCallback(async () => {
    if (wantStream.current) return true;
    if (!(await ensureMic())) return false;

    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await stream.start();
    wantStream.current = true;
    return true;
  }, [ensureMic, stream]);

  const setListening = useCallback(
    async (on: boolean) => {
      if (on) {
        if (await startStream()) voiceSession.start();
        return;
      }

      voiceSession.stop();
      stream.stop();
      wantStream.current = false;
    },
    [startStream, stream],
  );

  const pushToTalk = useCallback(async () => {
    if (!(await startStream())) return;
    voiceSession.beginPushToTalk();
  }, [startStream]);

  // Release the microphone when the provider unmounts.
  useEffect(
    () => () => {
      voiceSession.stop();
      stream.stop();
      wantStream.current = false;
    },
    [stream],
  );

  return (
    <VoiceContext.Provider value={{ snapshot, micGranted, isStreaming, setListening, pushToTalk }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const value = useContext(VoiceContext);
  if (!value) throw new Error('useVoice must be used inside <VoiceProvider>');
  return value;
}
