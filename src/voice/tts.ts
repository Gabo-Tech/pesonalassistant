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

export async function listTtsVoices(): Promise<RankedVoice[]> {
  const voices = await Speech.getAvailableVoicesAsync();
  return rankVoices(voices, peekSettings().locale);
}

/** Speaks and resolves when the utterance finishes (or fails). */
export function speak(text: string, onDone?: () => void): void {
  if (!text.trim()) {
    onDone?.();
    return;
  }

  speaking = true;
  const finish = () => {
    speaking = false;
    onDone?.();
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
  speaking = false;
  Speech.stop();
}

export const isSpeaking = (): boolean => speaking;
