export interface VideoTrack {
  index: number;
  view: number;
  title: string;
  /** Main process only: never expose signed media URLs to renderer. */
  url: string;
}
export type DownloadState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface DownloadTask {
  id: string;
  key: string;
  title: string;
  filePath: string;
  state: DownloadState;
  received: number;
  bytesPerSecond?: number;
  retryCount?: number;
  stage?: string;
  partialRetained?: boolean;
  total?: number;
  error?: string;
}
export interface VideoSelection { id: string; title: string; startTime?: string; courseId?: string; courseTitle?: string }
export interface DownloadBatchResult {
  tasks: DownloadTask[];
  errors: { id: string; message: string }[];
  cancelled: boolean;
}
