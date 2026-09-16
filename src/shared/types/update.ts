export type UpdateStage = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateState {
  stage: UpdateStage;
  /** Version found on the update server, once known. */
  version?: string;
  releaseNotes?: string;
  releaseDate?: string;
  /** Download progress, only meaningful while stage is 'downloading'. */
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  error?: string;
  checkedAt?: number;
}
