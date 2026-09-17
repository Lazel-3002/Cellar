import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWav, findSilenceBoundary, SPEECH_SAMPLE_RATE as SAMPLE_RATE } from '@shared/audio';
import { invoke } from './ipc';

export { encodeWav, findSilenceBoundary } from '@shared/audio';

/** Decode a recording and resample it to 16 kHz mono. */
async function toSpeechSamples(blob: Blob): Promise<Float32Array> {
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
    return rendered.getChannelData(0);
  } finally {
    void context.close();
  }
}

export type DictationState = 'idle' | 'recording' | 'transcribing';

/** How often the tail of the recording is re-transcribed for the live preview. */
const PARTIAL_INTERVAL_MS = 1200;
/** Once the uncommitted tail is longer than this, look for a pause to commit at. */
const COMMIT_AFTER_MS = 8000;
/** Below this there is nothing to transcribe yet. */
const MIN_TAIL_MS = 400;

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

/**
 * Record from the microphone and transcribe with whisper.cpp in the main process.
 *
 * Transcription is streaming: every ~1.2s the part of the clip that has not been committed yet is
 * re-transcribed with greedy decoding for a live preview, and once that tail grows past ~8s the text
 * up to the last natural pause is transcribed at full quality and *committed* — frozen, never
 * decoded again. So the work per tick stays bounded no matter how long someone talks, instead of
 * re-decoding the whole recording each time.
 *
 * Stopping transcribes only what is still uncommitted, at full quality, and appends it. A short
 * recording never commits anything, so it is transcribed whole in one pass, exactly as before.
 */
export function useDictation(onText: (text: string) => void, onError: (message: string) => void, options: { streaming?: boolean } = {}) {
  const [state, setState] = useState<DictationState>('idle');
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [partial, setPartial] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);
  /** Text already transcribed at full quality, and how much audio it covers. */
  const committed = useRef({ text: '', samples: 0 });
  const streaming = options.streaming !== false;

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
      committed.current = { text: '', samples: 0 };
      const meter = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        setElapsed(Math.floor((Date.now() - started) / 1000));
      }, 100);

      let working = false;
      const tick = async () => {
        if (working || chunks.length === 0 || !streaming) return;
        working = true;
        try {
          const samples = await toSpeechSamples(new Blob(chunks.slice(), { type: media.mimeType }));
          if (recorder.current !== media || cancelled.current) return;
          const tail = samples.subarray(committed.current.samples);
          if (tail.length < (SAMPLE_RATE * MIN_TAIL_MS) / 1000) return;

          // Long enough to have a settled part: freeze everything up to the last pause.
          if (tail.length > (SAMPLE_RATE * COMMIT_AFTER_MS) / 1000) {
            const boundary = findSilenceBoundary(tail);
            if (boundary) {
              const settled = await invoke('voice:transcribe', encodeWav(tail.slice(0, boundary)));
              if (recorder.current !== media || cancelled.current) return;
              committed.current = { text: join(committed.current.text, settled.text), samples: committed.current.samples + boundary };
              setPartial(committed.current.text);
              return;
            }
          }
          const { text } = await invoke('voice:transcribe', encodeWav(tail.slice()), undefined, true);
          if (recorder.current === media && !cancelled.current) setPartial(join(committed.current.text, text));
        } catch {
          // A failed tick just skips; stopping still transcribes what is left at full quality.
        } finally {
          working = false;
        }
      };
      const preview = setInterval(() => void tick(), PARTIAL_INTERVAL_MS);

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
          const samples = await toSpeechSamples(new Blob(chunks, { type: media.mimeType }));
          const tail = samples.subarray(committed.current.samples);
          const { text } = tail.length ? await invoke('voice:transcribe', encodeWav(tail.slice())) : { text: '' };
          const full = join(committed.current.text, text);
          if (full) onText(full);
          else onError('No speech was recognized.');
        } catch (err) {
          onError(err instanceof Error ? err.message : String(err));
        } finally {
          committed.current = { text: '', samples: 0 };
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
  }, [state, onText, onError, streaming]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  return { state, level, elapsed, partial, start, stop, cancel };
}
