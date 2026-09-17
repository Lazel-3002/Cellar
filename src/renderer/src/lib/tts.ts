import { useEffect, useState } from 'react';
import { invoke } from './ipc';

/**
 * Spoken replies. Audio plays here either way, because the main process has no audio output:
 *
 * - the **system** engine uses Chromium's own `speechSynthesis`, which ships with the app;
 * - the **piper** engine asks main to render a WAV (`tts:synthesize`) and plays it as a Blob.
 *
 * `tts:synthesize` returns null when the system engine is selected, which is also the fallback when
 * piper is not installed yet — so speech never silently stops working after a settings change.
 */

/** Voice list loads asynchronously in Chromium; re-reads once `voiceschanged` fires. */
export function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => (typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices()));
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}

/** Strips markdown so speech doesn't read out asterisks, backticks, link syntax, etc. */
function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let lastSpokenMessageId: string | null = null;
let current: HTMLAudioElement | null = null;
/** Bumped on every stop/speak so a slow piper render cannot play over a newer reply. */
let generation = 0;

function speakWithSystemVoice(text: string, voiceName: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : undefined;
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

/** Reads text aloud now, cancelling anything still speaking. */
export function speak(text: string, voiceName: string): void {
  const spoken = stripForSpeech(text);
  if (!spoken) return;
  stopSpeaking();
  const mine = ++generation;
  void invoke('tts:synthesize', spoken.slice(0, 8000))
    .then((wav) => {
      if (mine !== generation) return;
      if (!wav) return speakWithSystemVoice(spoken, voiceName);
      const url = URL.createObjectURL(new Blob([wav.slice().buffer as ArrayBuffer], { type: 'audio/wav' }));
      const audio = new Audio(url);
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
      current = audio;
      void audio.play().catch(() => URL.revokeObjectURL(url));
    })
    .catch(() => {
      // Piper missing or broken: the system voices still work, and Settings → Voice says what is wrong.
      if (mine === generation) speakWithSystemVoice(spoken, voiceName);
    });
}

/** Speaks a finished assistant reply once per message id. */
export function speakReply(messageId: string, text: string, voiceName: string): void {
  if (lastSpokenMessageId === messageId) return;
  lastSpokenMessageId = messageId;
  speak(text, voiceName);
}

export function stopSpeaking(): void {
  generation++;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  if (current) {
    current.pause();
    current = null;
  }
}
