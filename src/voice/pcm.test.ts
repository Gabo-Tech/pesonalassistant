import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decodePcm, floatToPcm16, peakNormalize } from './pcm.ts';

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

  it('keeps aligned float32 even when samples look loud', () => {
    const src = new Float32Array([4, -3, 2, 1]);
    const out = decodePcm(src.buffer, 'float32');
    assert.equal(out.length, 4);
    assert.equal(out[0], 4);
  });
});

describe('floatToPcm16', () => {
  it('writes one little-endian int16 sample per float', () => {
    const buffer = floatToPcm16(new Float32Array([0.5, -1]));
    const view = new Int16Array(buffer);
    assert.equal(buffer.byteLength, 4);
    assert.ok(Math.abs(view[0] - 16383) <= 1);
    assert.equal(view[1], -32768);
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
