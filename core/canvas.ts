import type { CanvasCourse, CanvasProvider, CanvasResource, CanvasResourceKind, CanvasStatus } from "../shared/canvas-contracts.js";
import { normalizeCourse, sortCourses } from "./courses.js";

export class CanvasAuthenticationError extends Error {}
export async function canvasStatus(provider: CanvasProvider, api: Pick<CanvasApi, "user">): Promise<CanvasStatus> {
  try { return { authenticated: true, provider, user: await api.user() }; }
  catch (error) {
    if (error instanceof CanvasAuthenticationError) return { authenticated: false, provider };
    throw error;
  }
}

export const canvasOrigins: Record<CanvasProvider, string> = {
  sjtu: "https://oc.sjtu.edu.cn",
  ji: "https://jicanvas.com",
};
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class CanvasApi {
  constructor(private origin: string, private request: Fetcher, private token = "") {}

  private async get(url: string): Promise<{ data: unknown; next?: string }> {
    const target = new URL(url, this.origin);
    if (target.origin !== this.origin || !target.pathname.startsWith("/api/v1/"))
      throw new Error("拒绝非 Canvas API 地址");
    let response: Response;
    try {
      response = await this.request(target.href, {
        headers: { Accept: "application/json", ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, credentials: this.token ? "omit" : "include",
        redirect: "error", signal: AbortSignal.timeout(20000),
      });
    } catch { throw new Error("Canvas 请求失败，请检查网络或重新登录"); }
    if (response.status === 401) throw new CanvasAuthenticationError(this.token
      ? "Canvas Token 认证失败：请检查 Token 是否有效、未过期，以及所选 SJTU/JI 站点是否匹配"
      : "Canvas 会话已过期，请重新登录");
    if (response.status === 403) throw new Error("Canvas 当前账号无此资源权限");
    if (!response.ok) throw new Error(`Canvas 请求失败（HTTP ${response.status}）`);
    let data: unknown;
    try { data = await response.json(); } catch { throw new Error("Canvas 返回非 JSON 数据，请重新登录"); }
    const next = response.headers.get("link")?.split(",").map(part => part.match(/<([^>]+)>;\s*rel="next"/)).find(Boolean)?.[1];
    return { data, next };
  }

  private async list(path: string): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    const visited = new Set<string>();
    const seenIds = new Map<string, Record<string, unknown>>();
    let next: string | undefined = path + (path.includes("?") ? "&" : "?") + "per_page=100";
    while (next) {
      const absolute = new URL(next, this.origin).href;
      if (visited.has(absolute)) throw new Error("Canvas 分页没有推进");
      if (visited.size >= 1000) throw new Error("Canvas 分页超过安全上限，结果未完整读取");
      visited.add(absolute);
      const result = await this.get(absolute);
      if (!Array.isArray(result.data)) throw new Error("Canvas 列表响应结构变化");
      let added = 0;
      for (const item of result.data) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Canvas 列表项结构变化");
        const row = item as Record<string, unknown>;
        const id = String(row.id ?? "");
        if (!id || !seenIds.has(id)) { all.push(row); added++; if (id) seenIds.set(id, row); }
        else {
          const existing = seenIds.get(id)!;
          // Canvas can repeat a restricted or partial course on another page.
          // Keep prior nonempty fields while filling gaps from richer duplicates.
          for (const [key, value] of Object.entries(row)) {
            const blank = (candidate: unknown) => candidate === null || candidate === undefined || (typeof candidate === "string" && !candidate.trim());
            if (!blank(value) && blank(existing[key])) existing[key] = value;
            else if (key === "term" && value && typeof value === "object" && !Array.isArray(value) && existing.term && typeof existing.term === "object" && !Array.isArray(existing.term)) {
              const term = existing.term as Record<string, unknown>;
              for (const [field, content] of Object.entries(value)) if (blank(term[field]) && !blank(content)) term[field] = content;
            }
          }
        }
      }
      if (result.next && !added) throw new Error("Canvas 分页数据没有推进");
      next = result.next;
    }
    return all;
  }

  async user(): Promise<{ id: string; name: string }> {
    const { data } = await this.get("/api/v1/users/self");
    const row = data as Record<string, unknown> | null;
    if (!row || !row.id || typeof row.name !== "string") throw new Error("Canvas 未返回有效登录身份");
    return { id: String(row.id), name: row.name };
  }
  async courses(): Promise<CanvasCourse[]> {
    return sortCourses((await this.list("/api/v1/courses?include[]=term")).map(normalizeCourse));
  }
  async resources(courseId: string, kind: CanvasResourceKind): Promise<CanvasResource[]> {
    if (!/^\d+$/.test(courseId)) throw new Error("Canvas 课程编号无效");
    const endpoints: Record<CanvasResourceKind, string> = {
      files: "files", assignments: "assignments", discussions: "discussion_topics",
      users: "users", grades: "enrollments",
      syllabus: "",
    };
    if (!Object.hasOwn(endpoints, kind)) throw new Error("未知 Canvas 资源");
    if (kind === "syllabus") {
      const { data } = await this.get(`/api/v1/courses/${courseId}?include[]=syllabus_body`);
      const row = data as Record<string, unknown>;
      return [{ id: String(row.id), name: String(row.name ?? "教学大纲"), body: String(row.syllabus_body ?? "") }];
    }
    // Explicit projections prevent accidentally forwarding API tokens or signed download URLs.
    const allowed = ["id", "name", "display_name", "title", "filename", "size", "content-type", "due_at", "points_possible", "submission_types", "type", "role", "enrollment_state"];
    return (await this.list(`/api/v1/courses/${courseId}/${endpoints[kind]}`)).map(row => {
      const resource: CanvasResource = {};
      for (const key of allowed) if (row[key] !== undefined) resource[key] = row[key];
      if (kind === "grades" && row.grades && typeof row.grades === "object") {
        const grades = row.grades as Record<string, unknown>;
        resource.current_score = grades.current_score;
        resource.final_score = grades.final_score;
      }
      return resource;
    });
  }
}
