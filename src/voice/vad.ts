/**
 * A small energy-based voice activity detector.
 *
 * Whisper needs whole utterances, not a raw microphone firehose: transcribing every
 * 20ms buffer would melt the battery. So we watch the loudness (RMS) of each buffer,
 * start collecting when the user speaks, and emit the clip once they stop.
 *
 * This is deliberately a few lines of arithmetic rather than a neural VAD model -
 * it costs no extra download, no extra RAM, and is easy to reason about.
 */

import { peakNormalize } from './pcm';

export type VadConfig = {
  /** RMS above this counts as speech. Raise it in noisy rooms. */
  threshold: number;
  /** Silence needed before we call the utterance finished. */
  hangoverMs: number;
  /** Ignore blips shorter than this (door clicks, lip smacks). */
  minSpeechMs: number;
  /** Hard stop so a noisy room cannot buffer forever. */
  maxUtteranceMs: number;
  /** Audio kept from just before the trigger, so the first word is not clipped. */
  preRollMs: number;
};

export const DEFAULT_VAD: VadConfig = {
  threshold: 0.01,
  hangoverMs: 400,
  minSpeechMs: 250,
  maxUtteranceMs: 12_000,
  preRollMs: 300,
};

export type VadEvents = {
  onSpeechStart?: () => void;
  /** Fired once per utterance with 16 kHz mono float32 samples. */
  onUtterance: (samples: Float32Array, sampleRate: number) => void;
};

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export class EnergyVad {
  private collecting = false;
  private collected: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private speechMs = 0;
  private silenceMs = 0;
  private sampleRate = 16_000;

  constructor(
    private readonly events: VadEvents,
    private config: VadConfig = DEFAULT_VAD,
  ) {}

  configure(patch: Partial<VadConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  reset(): void {
    this.collecting = false;
    this.collected = [];
    this.preRoll = [];
    this.speechMs = 0;
    this.silenceMs = 0;
  }

  /** Feed one microphone buffer. */
  push(samples: Float32Array, sampleRate: number): void {
    this.sampleRate = sampleRate;
    const durationMs = (samples.length / sampleRate) * 1000;
    const loud = rms(samples) >= this.config.threshold;

    if (!this.collecting) {
      // Keep a short rolling tail so the utterance includes the word's attack.
      this.preRoll.push(samples);
      let preRollMs = this.preRoll.reduce(
        (total, chunk) => total + (chunk.length / sampleRate) * 1000,
        0,
      );
      while (preRollMs > this.config.preRollMs && this.preRoll.length > 1) {
        const dropped = this.preRoll.shift();
        if (dropped) preRollMs -= (dropped.length / sampleRate) * 1000;
      }

      if (loud) {
        this.collecting = true;
        this.collected = [...this.preRoll];
        this.preRoll = [];
        this.speechMs = durationMs;
        this.silenceMs = 0;
        this.events.onSpeechStart?.();
      }
      return;
    }

    this.collected.push(samples);

    if (loud) {
      this.speechMs += durationMs;
      this.silenceMs = 0;
    } else {
      this.silenceMs += durationMs;
    }

    const totalMs = this.speechMs + this.silenceMs;
    const doneTalking = this.silenceMs >= this.config.hangoverMs;
    const tooLong = totalMs >= this.config.maxUtteranceMs;

    if (doneTalking || tooLong) this.flush();
  }

  /** Emits whatever has been collected, if it is long enough to be speech. */
  flush(): void {
    const chunks = this.collected;
    const hadEnoughSpeech = this.speechMs >= this.config.minSpeechMs;
    const rate = this.sampleRate;
    this.reset();

    if (!hadEnoughSpeech || chunks.length === 0) return;
    this.events.onUtterance(peakNormalize(concat(chunks)), rate);
  }

  get isCollecting(): boolean {
    return this.collecting;
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
