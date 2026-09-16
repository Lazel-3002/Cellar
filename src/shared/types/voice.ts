/** Voice dictation with whisper.cpp. */

export type WhisperVariant = 'cpu' | 'blas' | 'cuda-12';

export interface WhisperRuntime {
  variant: WhisperVariant;
  /** Release tag, e.g. b5130. */
  tag: string;
  dir: string;
  cliPath: string;
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
  /** Best build for the detected GPU (falls back to CPU on hardware whisper.cpp's CUDA build doesn't cover, e.g. RTX 50 series). */
  recommendedVariant: WhisperVariant;
}

export interface VoiceProgress {
  kind: 'runtime' | 'model';
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
