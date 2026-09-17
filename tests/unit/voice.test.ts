import { describe, expect, it } from 'vitest';
import { encodeWav, findSilenceBoundary } from '../../src/shared/audio';
import { recommendedWhisperVariant } from '../../src/main/system/hardware';
import type { HardwareInfo } from '../../src/shared/types/system';

const SAMPLE_RATE = 16_000;

/** Speech-ish noise for `seconds`, then silence, then noise again. */
function clip(parts: Array<{ seconds: number; loud: boolean }>): Float32Array {
  const total = parts.reduce((n, p) => n + Math.round(p.seconds * SAMPLE_RATE), 0);
  const samples = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    const length = Math.round(part.seconds * SAMPLE_RATE);
    for (let i = 0; i < length; i++) samples[at + i] = part.loud ? Math.sin((i / SAMPLE_RATE) * 2 * Math.PI * 220) * 0.4 : 0;
    at += length;
  }
  return samples;
}

const hardware = (gpu?: { computeCapability: string; driverVersion: string }): HardwareInfo => ({
  gpus: gpu ? [{ index: 0, vendor: 'nvidia', name: 'Test GPU', vramTotalBytes: 8 * 1024 ** 3, ...gpu }] : [],
  cpu: { brand: 'Test', physicalCores: 8, threads: 16 },
  ramTotalBytes: 32 * 1024 ** 3,
  ramFreeBytes: 16 * 1024 ** 3,
  os: 'Windows 11',
  detectedAt: Date.now(),
});

describe('streaming dictation', () => {
  it('finds the pause between two stretches of speech', () => {
    const boundary = findSilenceBoundary(clip([{ seconds: 4, loud: true }, { seconds: 1, loud: false }, { seconds: 4, loud: true }]));
    expect(boundary).not.toBeNull();
    expect(boundary! / SAMPLE_RATE).toBeGreaterThan(4);
    expect(boundary! / SAMPLE_RATE).toBeLessThan(5);
  });

  it('will not cut while someone is still talking', () => {
    expect(findSilenceBoundary(clip([{ seconds: 9, loud: true }]))).toBeNull();
  });

  it('keeps away from the very start and the very end, where a cut would split a word', () => {
    // A pause inside the opening guard is ignored: there is no settled text to commit yet.
    expect(findSilenceBoundary(clip([{ seconds: 0.4, loud: true }, { seconds: 0.8, loud: false }, { seconds: 6, loud: true }]))).toBeNull();
    // A trailing pause is ignored too: the speaker is probably mid-sentence.
    expect(findSilenceBoundary(clip([{ seconds: 6, loud: true }, { seconds: 0.5, loud: false }]))).toBeNull();
  });

  it('writes a 16 kHz mono WAV header whisper.cpp reads', () => {
    const wav = encodeWav(new Float32Array(SAMPLE_RATE));
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(22, true)).toBe(1);
    expect(wav.byteLength).toBe(44 + SAMPLE_RATE * 2);
  });
});

describe('whisper.cpp build choice', () => {
  it('sends Blackwell to CUDA 13, and to the CPU build when there is no CUDA 13 to send it to', () => {
    const blackwell = hardware({ computeCapability: '12.0', driverVersion: '581.29' });
    expect(recommendedWhisperVariant(blackwell, ['cpu', 'blas', 'cuda-12', 'cuda-13'])).toBe('cuda-13');
    expect(recommendedWhisperVariant(blackwell, ['cpu', 'blas', 'cuda-12'])).toBe('cpu');
  });

  it('keeps older NVIDIA cards on CUDA 12 and everything else on the CPU build', () => {
    expect(recommendedWhisperVariant(hardware({ computeCapability: '8.9', driverVersion: '566.36' }), ['cpu', 'blas', 'cuda-12'])).toBe('cuda-12');
    expect(recommendedWhisperVariant(hardware())).toBe('cpu');
  });

  it('will not pick CUDA 13 on a driver too old for it', () => {
    expect(recommendedWhisperVariant(hardware({ computeCapability: '12.0', driverVersion: '566.36' }), ['cpu', 'cuda-12', 'cuda-13'])).toBe('cpu');
  });
});
