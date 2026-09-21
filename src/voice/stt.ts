import { initWhisper, type WhisperContext } from 'whisper.rn';

/**
 * Speech to text with whisper.cpp, fully offline.
 *
 * whisper expects 16 kHz mono audio. We request exactly that from the microphone so
 * there is no resampling step, and hand it raw float32 PCM through `transcribeData`.
 */

export const WHISPER_SAMPLE_RATE = 16_000;

let context: WhisperContext | null = null;
let loading: Promise<void> | null = null;

export const isSttReady = (): boolean => context !== null;

export async function loadStt(modelPath: string): Promise<void> {
  if (context) return;
  if (loading) return loading;

  loading = (async () => {
    try {
      context = await initWhisper({ filePath: modelPath });
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function unloadStt(): Promise<void> {
  await context?.release();
  context = null;
}

/**
 * Transcribes one utterance.
 *
 * `maxLen`/`beamSize` are kept small because we transcribe short commands, and a phone
 * doing beam search on every "yes" would feel sluggish.
 */
export async function transcribe(samples: Float32Array): Promise<string> {
  if (!context) throw new Error('Speech model is not loaded yet.');

  // Copy into a standalone ArrayBuffer: the VAD may reuse its backing store.
  const buffer = new ArrayBuffer(samples.length * 4);
  new Float32Array(buffer).set(samples);

  const { promise } = context.transcribeData(buffer, {
    language: 'en',
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
