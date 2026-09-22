import type { Locale } from '../i18n/wake';

export type VoiceInfo = {
  identifier: string;
  name: string;
  language: string;
  quality: string;
};

export type RankedVoice = VoiceInfo & {
  neural: boolean;
};

export function languageMatches(voiceLang: string, locale: Locale): boolean {
  const normalized = voiceLang.toLowerCase().replaceAll('_', '-');
  if (locale === 'es') return normalized.startsWith('es') || normalized.startsWith('spa');
  return normalized.startsWith('en') || normalized.startsWith('eng');
}

/** Prefer Enhanced (on-device neural) voices, then alphabetical. */
export function rankVoices(voices: VoiceInfo[], locale: Locale): RankedVoice[] {
  return voices
    .filter((voice) => languageMatches(voice.language, locale))
    .map((voice) => ({
      ...voice,
      neural: voice.quality.toLowerCase() === 'enhanced',
    }))
    .sort((a, b) => Number(b.neural) - Number(a.neural) || a.name.localeCompare(b.name));
}

export function formatVoiceLabel(voice: RankedVoice, neuralWord: string): string {
  return voice.neural ? `${voice.name} (${neuralWord})` : voice.name;
}
