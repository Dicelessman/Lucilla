import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { downsampleFloat32, encodeWavFromFloat32Chunks } from './audioPcm.ts';

describe('audioPcm WAV encoding', () => {
  it('downsamples 48kHz buffers to 16kHz and writes a valid RIFF PCM WAV header', () => {
    const sampleRate = 48000;
    const len = sampleRate; // 1 second
    const chunk = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      chunk[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }

    const downsampled = downsampleFloat32(chunk, sampleRate, 16000);
    assert.equal(downsampled.length, 16000);

    const wav = encodeWavFromFloat32Chunks([chunk], sampleRate, 16000);
    assert.ok(wav.durationSec > 0.99 && wav.durationSec < 1.01);
    assert.ok(wav.peak > 0.2);

    const raw = Buffer.from(wav.base64, 'base64');
    assert.equal(raw.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(raw.subarray(8, 12).toString('ascii'), 'WAVE');
    assert.equal(raw.subarray(12, 16).toString('ascii'), 'fmt ');
    assert.equal(raw.readUInt32LE(24), 16000);
    assert.equal(raw.subarray(36, 40).toString('ascii'), 'data');
    assert.equal(raw.readUInt32LE(40), 16000 * 2);
  });
});
