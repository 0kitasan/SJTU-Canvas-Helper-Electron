export type CanvasProvider = "sjtu" | "ji";
export type CanvasResourceKind = "files" | "assignments" | "discussions" | "users" | "syllabus" | "grades";
export interface CanvasStatus {
  authenticated: boolean;
  provider: CanvasProvider;
  user?: { id: string; name: string };
}
export interface CanvasCourse {
  id: string; title: string; term?: string;
  termId?: number; termStartAt?: string; termEndAt?: string;
  courseCode?: string; nameMissing?: boolean; accessRestricted?: boolean;
}
export type CanvasResource = Record<string, unknown>;
