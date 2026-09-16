import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from './ipc';

const SAMPLE_RATE = 16_000;

/** Mono 16-bit PCM WAV, which whisper.cpp reads directly. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Uint8Array {
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

/** Decode a recording and resample it to 16 kHz mono. */
async function toSpeechWav(blob: Blob): Promise<Uint8Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, length, SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0));
  } finally {
    void context.close();
  }
}

export type DictationState = 'idle' | 'recording' | 'transcribing';

/** How often to re-transcribe the recording so far for a live preview while the mic is still open. */
const PARTIAL_INTERVAL_MS = 2500;

/**
 * Record from the microphone, then transcribe with whisper.cpp in the main process. While
 * recording, the clip-so-far is also re-transcribed every couple of seconds with greedy decoding
 * (fast but rougher) for a live "partial" preview; the final stop always re-transcribes the whole
 * clip with full quality, so the preview never determines the actual inserted text.
 */
export function useDictation(onText: (text: string) => void, onError: (message: string) => void) {
  const [state, setState] = useState<DictationState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [partial, setPartial] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => cleanup.current?.(), []);

  const start = useCallback(async () => {
    if (state !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
      const audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 512;
      audio.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const started = Date.now();
      const meter = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        setElapsed(Math.floor((Date.now() - started) / 1000));
      }, 100);
      let previewing = false;
      const preview = setInterval(async () => {
        if (previewing || chunks.length === 0) return;
        previewing = true;
        try {
          const wav = await toSpeechWav(new Blob(chunks.slice(), { type: media.mimeType }));
          const { text } = await invoke('voice:transcribe', wav, undefined, true);
          if (recorder.current === media && !cancelled.current) setPartial(text);
        } catch {
          // A failed preview just skips this tick; the final transcription on stop still runs full quality.
        } finally {
          previewing = false;
        }
      }, PARTIAL_INTERVAL_MS);
      cleanup.current = () => {
        clearInterval(meter);
        clearInterval(preview);
        stream.getTracks().forEach((t) => t.stop());
        void audio.close();
        cleanup.current = null;
      };
      cancelled.current = false;
      media.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      media.onstop = async () => {
        cleanup.current?.();
        setLevel(0);
        setPartial('');
        if (cancelled.current || chunks.length === 0) {
          setState('idle');
          return;
        }
        setState('transcribing');
        try {
          const wav = await toSpeechWav(new Blob(chunks, { type: media.mimeType }));
          const { text } = await invoke('voice:transcribe', wav);
          if (text) onText(text);
          else onError('No speech was recognized.');
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        } finally {
          setState('idle');
        }
      };
      recorder.current = media;
      media.start(250);
      setElapsed(0);
      setPartial('');
      setState('recording');
    } catch (err) {
      cleanup.current?.();
      onError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Cellar is not allowed to use the microphone. Check Windows Settings → Privacy → Microphone.' : err instanceof Error ? err.message : String(err));
      setState('idle');
    }
  }, [state, onText, onError]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  return { state, level, elapsed, partial, start, stop, cancel };
}
