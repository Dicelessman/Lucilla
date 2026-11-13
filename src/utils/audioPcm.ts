/**
 * Pure PCM 16-bit little-endian conversion helpers for Gemini Live API
 * (16kHz input capture, 24kHz model output playback).
 */

export function float32ToInt16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export function downsampleFloat32(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (inputSampleRate === targetSampleRate || input.length === 0) {
    return input;
  }
  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[Math.min(idx, input.length - 1)];
    const s1 = input[Math.min(idx + 1, input.length - 1)];
    result[i] = s0 + (s1 - s0) * frac;
  }
  return result;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export interface EncodedWavTurn {
  base64: string;
  durationSec: number;
  peak: number;
}

export function encodeWavFromFloat32Chunks(
  chunks: Float32Array[],
  inputSampleRate: number,
  targetSampleRate = 16000
): EncodedWavTurn {
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const resampled = downsampleFloat32(merged, inputSampleRate, targetSampleRate);
  let peak = 0;
  for (let i = 0; i < resampled.length; i++) {
    const abs = Math.abs(resampled[i]);
    if (abs > peak) peak = abs;
  }

  // Gentle automatic gain boost if mic level was quiet (avoiding amplifying pure noise)
  const gain = peak >= 0.003 && peak < 0.25 ? Math.min(6, 0.55 / peak) : 1;

  const numSamples = resampled.length;
  const dataBytes = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(pos + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // AudioFormat = PCM
  view.setUint16(22, 1, true); // NumChannels = Mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let sampleOffset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, resampled[i] * gain));
    view.setInt16(sampleOffset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    sampleOffset += 2;
  }

  return {
    base64: uint8ToBase64(new Uint8Array(buffer)),
    durationSec: numSamples / targetSampleRate,
    peak,
  };
}
