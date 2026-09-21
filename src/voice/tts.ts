import * as Speech from 'expo-speech';

/**
 * Text to speech via the Android system engine.
 *
 * Using the OS voice instead of a neural TTS model keeps another few hundred megabytes
 * off the phone, works offline, and respects the voice the user already picked.
 */

let speaking = false;

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

  Speech.speak(text, {
    language: 'en-US',
    rate: 1.0,
    pitch: 1.0,
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
