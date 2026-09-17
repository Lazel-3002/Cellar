/** Audio helpers for dictation: the WAV whisper.cpp reads, and where a recording can be cut. */

export const SPEECH_SAMPLE_RATE = 16_000;

/** Mono 16-bit PCM WAV, which whisper.cpp reads directly. */
export function encodeWav(samples: Float32Array, sampleRate = SPEECH_SAMPLE_RATE): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export interface SilenceOptions {
  sampleRate?: number;
  /** Peak amplitude below which a frame counts as silence. */
  threshold?: number;
  /** A pause has to last this long to be a sentence boundary. */
  minSilenceMs?: number;
  /** Never cut in the first or last stretch: the start has no settled text yet, the end is mid-word. */
  guardStartMs?: number;
  guardEndMs?: number;
}

/**
 * The sample index of a pause that text can safely be committed at, or null when the speaker has not
 * drawn breath. Streaming transcription commits at these boundaries so the finished part never has
 * to be decoded again, which is what keeps a long dictation from getting slower and slower.
 */
export function findSilenceBoundary(samples: Float32Array, options: SilenceOptions = {}): number | null {
  const { sampleRate = SPEECH_SAMPLE_RATE, threshold = 0.015, minSilenceMs = 350, guardStartMs = 2000, guardEndMs = 900 } = options;
  const frame = Math.max(1, Math.round((sampleRate * 20) / 1000));
  const minFrames = Math.ceil(minSilenceMs / 20);
  const first = Math.floor((guardStartMs / 1000) * sampleRate);
  const last = samples.length - Math.floor((guardEndMs / 1000) * sampleRate);
  if (last - first < frame * minFrames) return null;
  let runStart = -1;
  let best: { start: number; end: number } | null = null;
  for (let i = first; i + frame <= last; i += frame) {
    let peak = 0;
    for (let j = i; j < i + frame; j++) peak = Math.max(peak, Math.abs(samples[j]));
    if (peak < threshold) {
      if (runStart === -1) runStart = i;
      const length = i + frame - runStart;
      if (length >= frame * minFrames && (!best || length > best.end - best.start)) best = { start: runStart, end: i + frame };
    } else {
      runStart = -1;
    }
  }
  return best ? Math.floor((best.start + best.end) / 2) : null;
}
