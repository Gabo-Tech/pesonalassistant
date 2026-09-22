import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePcm, looksLikeMisreadInt16, peakNormalize } from './pcm.ts';

describe('decodePcm', () => {
  it('keeps native float32 samples', () => {
    const src = new Float32Array([0.1, -0.2, 0.3]);
    const out = decodePcm(src.buffer, 'float32');
    assert.equal(out.length, 3);
    assert.ok(Math.abs(out[0] - 0.1) < 1e-6);
    assert.ok(Math.abs(out[1] + 0.2) < 1e-6);
  });

  it('scales int16 to float32', () => {
    const src = new Int16Array([0, 16384, -32768]);
    const out = decodePcm(src.buffer, 'int16');
    assert.equal(out.length, 3);
    assert.equal(out[0], 0);
    assert.ok(Math.abs(out[1] - 0.5) < 0.01);
    assert.equal(out[2], -1);
  });

  it('detects int16 bytes mislabeled as float32', () => {
    const src = new Int16Array(64);
    for (let i = 0; i < src.length; i += 1) src[i] = i % 2 === 0 ? 12000 : -8000;
    const asFloat = new Float32Array(src.buffer);
    assert.equal(looksLikeMisreadInt16(asFloat), true);
    const out = decodePcm(src.buffer, 'float32');
    assert.equal(out.length, src.length);
    assert.ok(Math.abs(out[0] - 12000 / 32768) < 0.01);
  });
});

describe('peakNormalize', () => {
  it('boosts a quiet clip', () => {
    const src = new Float32Array([0.01, -0.02, 0.015]);
    const out = peakNormalize(src);
    let peak = 0;
    for (const sample of out) peak = Math.max(peak, Math.abs(sample));
    assert.ok(peak > 0.39);
    assert.ok(peak <= 0.91);
  });

  it('leaves already-loud speech alone', () => {
    const src = new Float32Array([0.8, -0.7]);
    assert.equal(peakNormalize(src), src);
  });
});
