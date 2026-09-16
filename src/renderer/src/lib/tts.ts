import { useEffect, useState } from 'react';

/**
 * Spoken replies use the browser's built-in speech synthesis (window.speechSynthesis) instead of
 * whisper.cpp — whisper.cpp is speech-to-text only, and Chromium already ships offline TTS voices
 * for free with no extra download or process.
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

/** Speaks a finished assistant reply once per message id; cancels anything still speaking first. */
export function speakReply(messageId: string, text: string, voiceName: string): void {
  if (typeof speechSynthesis === 'undefined' || lastSpokenMessageId === messageId) return;
  const spoken = stripForSpeech(text);
  if (!spoken) return;
  lastSpokenMessageId = messageId;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(spoken);
  const voice = voiceName ? speechSynthesis.getVoices().find((v) => v.name === voiceName) : undefined;
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
