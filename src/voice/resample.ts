/** Linear resample to Whisper's 16 kHz. Hardware often delivers 48 kHz instead. */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16_000 || samples.length === 0) return samples;
  if (fromRate <= 0) return samples;

  const ratio = fromRate / 16_000;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.min(Math.floor(src), samples.length - 1);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const t = src - i0;
    out[i] = samples[i0] * (1 - t) + samples[i1] * t;
  }

  return out;
}
