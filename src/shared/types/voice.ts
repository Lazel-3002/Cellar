/** Voice dictation with whisper.cpp, and spoken replies through the system voices or piper. */

export type WhisperVariant = 'cpu' | 'blas' | 'cuda-12' | 'cuda-13';

export interface WhisperRuntime {
  variant: WhisperVariant;
  /** Release tag, e.g. b5130. */
  tag: string;
  dir: string;
  cliPath: string;
  /** Set when a newer release ships this build; reinstalling picks it up. */
  updateAvailable?: string;
}

export interface WhisperModelInfo {
  /** File name, e.g. ggml-base.bin. */
  id: string;
  label: string;
  sizeBytes: number;
  multilingual: boolean;
  description: string;
  installed: boolean;
}

export interface VoiceStatus {
  runtime: WhisperRuntime | null;
  models: WhisperModelInfo[];
  /** The model dictation uses (installed or not). */
  model: string;
  language: string;
  /** A runtime and the chosen model are both installed. */
  ready: boolean;
  /** Best build for the detected GPU, among the ones the project currently ships. */
  recommendedVariant: WhisperVariant;
  /** Builds with a Windows asset in a recent whisper.cpp release; all of them until the list has been fetched. */
  availableVariants: WhisperVariant[];
  /** Newest whisper.cpp release tag seen on GitHub. */
  latestTag?: string;
}

export interface VoiceProgress {
  kind: 'runtime' | 'model' | 'tts';
  id: string;
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  receivedBytes: number;
  totalBytes: number;
  message?: string;
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

/** Spoken replies: Chromium's own voices, or piper for better ones. */
export type TtsEngine = 'system' | 'piper';

export interface PiperVoiceInfo {
  id: string;
  label: string;
  language: string;
  quality: 'medium' | 'high';
  sizeBytes: number;
  /** Path inside the rhasspy/piper-voices repository. */
  path: string;
  installed: boolean;
}

export interface TtsStatus {
  engine: TtsEngine;
  speakReplies: boolean;
  /** SpeechSynthesisVoice.name for the system engine. */
  systemVoice: string;
  piperInstalled: boolean;
  piperVoice: string;
  voices: PiperVoiceInfo[];
  /** The chosen engine can speak right now. */
  ready: boolean;
}
