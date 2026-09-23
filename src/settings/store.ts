import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import type { Locale } from '../i18n/wake';
import type { CloudProvider } from '../llm/cloud';
import type { Appearance } from '../ui/theme';

export type { Locale };
export type WakeEngine = 'off' | 'whisper' | 'porcupine';
export type LlmProvider = 'local' | CloudProvider;

export type Settings = {
  /** Phrase that activates the assistant. Matched loosely against STT output. */
  wakeWord: string;
  wakeEngine: WakeEngine;
  /** Porcupine needs a free AccessKey; empty means the whisper engine is used. */
  porcupineAccessKey: string;
  /** Imported .ppn custom keyword file, if any. */
  porcupineKeywordPath: string | null;
  alwaysListening: boolean;
  speakReplies: boolean;
  /** Allow "send"/"yes" spoken confirmation in addition to the button. */
  voiceConfirm: boolean;
  /** How long a pending confirmation stays live, in ms. */
  confirmTimeoutMs: number;
  /** RMS loudness that counts as speech. Higher = less sensitive, for noisy rooms. */
  vadThreshold: number;
  llmModelPath: string | null;
  sttModelPath: string | null;
  /** On-device llama, or an optional cloud provider. The key itself is not stored here. */
  llmProvider: LlmProvider;
  /** Empty uses the provider's default model id. */
  cloudModel: string;
  /** Android calendar chosen for new events. */
  calendarId: string | null;
  /** In-app events, or the phone calendar when the user opts in. */
  calendarMode: 'app' | 'phone';
  /** Whether the user opted into the Accessibility auto-tap-send service. */
  sendCrawlerEnabled: boolean;
  /** Japandi UI. Dark is the product default, independent of the OS scheme. */
  appearance: Appearance;
  /** First-launch pager has been finished or skipped to Home. */
  onboardingComplete: boolean;
  /** Interface, Whisper, and TTS language. */
  locale: Locale;
  /** Android TTS voice identifier from Speech.getAvailableVoicesAsync. */
  ttsVoiceId: string | null;
  /** 1.0 is the system default. */
  ttsRate: number;
  ttsPitch: number;
};

export const DEFAULT_SETTINGS: Settings = {
  wakeWord: 'computer',
  wakeEngine: 'whisper',
  porcupineAccessKey: '',
  porcupineKeywordPath: null,
  alwaysListening: false,
  speakReplies: true,
  voiceConfirm: true,
  confirmTimeoutMs: 20_000,
  vadThreshold: 0.01,
  llmModelPath: null,
  sttModelPath: null,
  llmProvider: 'local',
  cloudModel: '',
  calendarId: null,
  calendarMode: 'app',
  sendCrawlerEnabled: false,
  appearance: 'dark',
  onboardingComplete: false,
  locale: 'en',
  ttsVoiceId: null,
  ttsRate: 1,
  ttsPitch: 1,
};

const STORAGE_KEY = 'assistant.settings.v1';

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache;

  let loaded: Settings;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    // Spread over defaults so a settings key added in a later version is populated.
    loaded = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    loaded = { ...DEFAULT_SETTINGS };
  }

  cache = loaded;
  return loaded;
}

/** Synchronous peek for hot paths (voice loop); falls back to defaults before load. */
export function peekSettings(): Settings {
  return cache ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  cache = next;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn(next));
  return next;
}

export function subscribeSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  fn(peekSettings());
  return () => listeners.delete(fn);
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => Promise<void>, boolean] {
  const [settings, setSettings] = useState<Settings>(() => peekSettings());
  const [ready, setReady] = useState(cache !== null);

  useEffect(() => {
    let active = true;
    loadSettings().then((s) => {
      if (!active) return;
      setSettings(s);
      setReady(true);
    });

    listeners.add(setSettings);
    return () => {
      active = false;
      listeners.delete(setSettings);
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    await saveSettings(patch);
  }, []);

  return [settings, update, ready];
}
