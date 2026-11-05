import type { CanvasStatus, CanvasProvider, CanvasCourse, CanvasResource, CanvasResourceKind } from "./canvas-contracts.js";
import type { DownloadTask } from "./downloads.js";
import type { VideoSelection, DownloadBatchResult } from "./downloads.js";
export type Version = "original" | "optimized";
export interface Course {
  id: string;
  title: string;
}
export interface Recording {
  id: string;
  title: string;
  time: string;
}
export interface Line {
  bg: number;
  ed: number;
  res: string;
}
export interface Transcript {
  courseId: string;
  version: Version;
  lines: Line[];
  srt: string;
}
export const versionLabel = (v: Version) =>
  v === "original" ? "原始字幕" : "优化字幕";
export interface Bridge {
  canvasStatus(): Promise<CanvasStatus>;
  canvasLogin(provider: CanvasProvider): Promise<CanvasStatus>;
  canvasConnectToken(provider: CanvasProvider, token: string): Promise<CanvasStatus>;
  canvasLogout(): Promise<void>;
  canvasCourses(force?: boolean): Promise<CanvasCourse[]>;
  canvasResources(courseId: string, kind: CanvasResourceKind, force?: boolean): Promise<CanvasResource[]>;
  videoTracks(id: string): Promise<{index:number;view:number;title:string}[]>;
  downloadVideo(id: string, index: number, title: string): Promise<DownloadTask | null>;
  downloadVideos(selections: VideoSelection[]): Promise<DownloadBatchResult>;
  downloadTasks(): Promise<DownloadTask[]>;
  cancelDownload(id: string): Promise<void>;
  retryDownload(id: string): Promise<void>;
  onDownloads(callback: (tasks: DownloadTask[]) => void): () => void;
  connection(): Promise<{ demo: boolean; revision: number }>;
  connect(token: string): Promise<void>;
  loginVideo(): Promise<void>;
  demo(): Promise<void>;
  courses(force?: boolean): Promise<Course[]>;
  recordings(id: string, force?: boolean): Promise<Recording[]>;
  transcript(id: string, force?: boolean): Promise<Transcript>;
  save(
    id: string,
    title: string,
  ): Promise<{ path: string; version: Version } | null>;
  openWindow(page: string): Promise<void>;
}
