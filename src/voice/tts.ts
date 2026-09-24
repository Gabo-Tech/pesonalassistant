import * as Speech from 'expo-speech';
import { localeTag } from '../i18n/wake';
import { peekSettings } from '../settings/store';
import { rankVoices, type RankedVoice } from './voices';

/**
 * Text to speech via the Android system engine.
 *
 * Enhanced/Premium voices on the phone are on-device neural packs (Google/Samsung).
 * The user picks one in Settings; we never upload the spoken text.
 */

let speaking = false;
let queue: string[] = [];
let queueToken = 0;
let drain: (() => void) | null = null;

export async function listTtsVoices(): Promise<RankedVoice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return rankVoices(voices, peekSettings().locale);
}

/** Speaks and resolves when the utterance finishes (or fails). */
export function speak(text: string, onDone?: () => void): void {
  utter(text, onDone);
}

/**
 * Appends a sentence behind anything already speaking.
 * `onDrained` runs when this sentence and everything queued before it have finished.
 */
export function speakQueued(text: string, onDrained?: () => void): void {
  const chunk = text.trim();
  if (onDrained) drain = onDrained;
  if (!chunk) {
    if (!speaking && queue.length === 0) {
      const done = drain;
      drain = null;
      done?.();
    }
    return;
  }

  queue.push(chunk);
  if (!speaking) pump(queueToken);
}

function pump(token: number): void {
  if (token !== queueToken) return;
  const next = queue.shift();
  if (!next) {
    const done = drain;
    drain = null;
    done?.();
    return;
  }

  utter(
    next,
    () => {
      if (token !== queueToken) return;
      pump(token);
    },
    true,
  );
}

function utter(text: string, onDone?: () => void, fromQueue = false): void {
  if (!text.trim()) {
    onDone?.();
    return;
  }

  speaking = true;
  const tokenAtFinish = queueToken;
  const finish = () => {
    speaking = queue.length > 0;
    onDone?.();
    // A one-shot line (the "one moment" filler) must still release anything queued behind it.
    if (!fromQueue && queue.length > 0 && queueToken === tokenAtFinish) pump(queueToken);
  };

  const settings = peekSettings();
  Speech.speak(text, {
    language: localeTag(settings.locale),
    voice: settings.ttsVoiceId ?? undefined,
    rate: settings.ttsRate || 1,
    pitch: settings.ttsPitch || 1,
    onDone: finish,
    onStopped: finish,
    onError: finish,
  });
}

export function stopSpeaking(): void {
  queueToken += 1;
  queue = [];
  drain = null;
  speaking = false;
  Speech.stop();
}

export const isSpeaking = (): boolean => speaking;
