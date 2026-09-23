import { initWhisper, type WhisperContext } from 'whisper.rn';
import { peekSettings } from '../settings/store';
import { floatToPcm16 } from './pcm';
import { whisperLanguage } from './sttLanguage';

/**
 * Speech to text with whisper.cpp, fully offline.
 *
 * whisper expects 16 kHz mono audio. The microphone hook resamples to that rate.
 * whisper.rn reads the ArrayBuffer as signed 16-bit PCM, so we convert here.
 */

export const WHISPER_SAMPLE_RATE = 16_000;

let context: WhisperContext | null = null;
let loadedPath: string | null = null;
let loading: Promise<void> | null = null;

const sttListeners = new Set<(ready: boolean) => void>();

function publishStt(): void {
  const ready = context !== null;
  sttListeners.forEach((fn) => fn(ready));
}

export function subscribeStt(fn: (ready: boolean) => void): () => void {
  sttListeners.add(fn);
  fn(context !== null);
  return () => sttListeners.delete(fn);
}

export const isSttReady = (): boolean => context !== null;
export const sttLoadedPath = (): string | null => loadedPath;

export async function loadStt(modelPath: string): Promise<void> {
  if (context && loadedPath === modelPath) return;
  if (context && loadedPath !== modelPath) await unloadStt();
  if (loading) return loading;

  loading = (async () => {
    try {
      context = await initWhisper({ filePath: modelPath });
      loadedPath = modelPath;
      publishStt();
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function unloadStt(): Promise<void> {
  await context?.release();
  context = null;
  loadedPath = null;
  publishStt();
}

/**
 * Transcribes one utterance.
 *
 * `maxLen`/`beamSize` are kept small because we transcribe short commands, and a phone
 * doing beam search on every "yes" would feel sluggish.
 */
export async function transcribe(samples: Float32Array): Promise<string> {
  if (!context) throw new Error('Speech model is not loaded yet.');

  const buffer = floatToPcm16(samples);

  const language = whisperLanguage(peekSettings().locale, loadedPath);

  const { promise } = context.transcribeData(buffer, {
    language,
    maxThreads: 4,
    // No timestamps, no context carry-over: each command is independent.
    tokenTimestamps: false,
    translate: false,
  });

  const result = await promise;
  return cleanup(result.result ?? '');
}

/**
 * Whisper emits bracketed non-speech annotations like "[BLANK_AUDIO]" or "(wind)"
 * when it hears noise. Those must not reach the wake-word matcher or the LLM.
 */
function cleanup(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
