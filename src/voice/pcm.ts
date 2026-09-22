/**
 * Microphone PCM from expo-audio. We request float32, but Android HALs often
 * still deliver int16. Viewing those bytes as float32 looks like silence, so VAD
 * never fires.
 */

export type PcmEncoding = 'float32' | 'int16';

export function decodePcm(data: ArrayBuffer, encoding?: string | null): Float32Array {
  if (data.byteLength === 0) return new Float32Array(0);
  if (encoding === 'int16' || shouldReadAsInt16(data, encoding)) {
    return int16ToFloat(data);
  }
  return new Float32Array(data);
}

function shouldReadAsInt16(data: ArrayBuffer, encoding?: string | null): boolean {
  if (encoding === 'float32') {
    if (data.byteLength % 4 !== 0) return data.byteLength % 2 === 0;
    return looksLikeMisreadInt16(new Float32Array(data));
  }
  if (encoding === 'int16') return true;
  if (data.byteLength % 4 !== 0) return data.byteLength % 2 === 0;
  return looksLikeMisreadInt16(new Float32Array(data));
}

/** Int16-as-float32 produces many samples far outside [-1, 1]. */
export function looksLikeMisreadInt16(samples: Float32Array): boolean {
  if (samples.length === 0) return false;
  const n = Math.min(samples.length, 256);
  let wild = 0;
  for (let i = 0; i < n; i += 1) {
    const value = samples[i];
    if (!Number.isFinite(value) || Math.abs(value) > 1.5) wild += 1;
  }
  return wild / n > 0.25;
}

export function int16ToFloat(data: ArrayBuffer): Float32Array {
  const src = new Int16Array(data);
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) out[i] = src[i] / 32768;
  return out;
}

/** Boost quiet clips toward full scale so Whisper sees speech, not a whisper of noise. */
export function peakNormalize(samples: Float32Array, maxGain = 20): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const mag = Math.abs(samples[i]);
    if (mag > peak) peak = mag;
  }
  if (peak < 1e-5 || peak >= 0.45) return samples;
  const gain = Math.min(maxGain, 0.9 / peak);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] * gain;
  return out;
}
