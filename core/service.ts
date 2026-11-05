import { apiData, fetchTranscript, object } from "./subtitles.js";
import type { Course, Recording, Transcript } from "../shared/contracts.js";
import type { VideoTrack } from "../shared/downloads.js";
import { schoolVideoUrl } from "./downloads.js";
import { RequestCache } from "./cache.js";
const BASE = "https://v.sjtu.edu.cn/jy-application-resourcemanage";
const ID = /^\d+$/;
export class VideoService {
  constructor(private request: typeof fetch = fetch) {}
  private token = "";
  private isDemo = true;
  private revision = 0;
  private cache = new RequestCache();
  private async cached<T>(key: string, ttl: number, load: () => Promise<T>, force: boolean): Promise<T> {
    const revision = this.revision;
    const result = await this.cache.get(key, ttl, load, force);
    if (revision !== this.revision) throw new Error("录像会话已变化，请重新读取");
    return result;
  }
  connection() {
    return { demo: this.isDemo, revision: this.revision };
  }
  connect(token: string) {
    if (typeof token !== "string" || !token.trim() || token.length > 16000)
      throw new Error("请输入有效录像平台 jwt-token");
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token.trim()))
      throw new Error("此处需要录像空间 JWT（三段式凭据），不是 Canvas Token。Canvas Token 请填写到上方 Canvas 登录区。");
    this.token = token.trim();
    this.isDemo = false;
    this.revision++;
    this.cache.clear();
  }
  demo() {
    this.token = "";
    this.isDemo = true;
    this.revision++;
    this.cache.clear();
  }
  private async get(
    path: string,
    params: Record<string, string> = {},
    token = this.token,
  ): Promise<unknown> {
    const url = new URL(BASE + path);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    let response: Response;
    try {
      response = await this.request(url, {
        headers: {
          "jwt-token": token,
          Referer: "https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/",
        },
        signal: AbortSignal.timeout(20000),
        redirect: "error",
      });
    } catch {
      throw new Error("录像服务连接失败或超时，请检查网络和登录状态");
    }
    if (!response.ok)
      throw new Error(`HTTP ${response.status}，请检查登录状态或服务权限`);
    try {
      return await response.json();
    } catch {
      throw new Error("录像服务未返回 JSON，可能登录已过期");
    }
  }
  courses(force = false): Promise<Course[]> {
    return this.cached("courses", 5 * 60_000, () => this.loadCourses(), force);
  }
  recordings(id: string, force = false): Promise<Recording[]> {
    return this.cached(`recordings:${id}`, 60_000, () => this.loadRecordings(id), force);
  }
  transcript(id: string, force = false): Promise<Transcript> {
    return this.cached(`transcript:${id}`, 60_000, () => this.loadTranscript(id), force);
  }
  private async loadCourses(): Promise<Course[]> {
    if (this.isDemo)
      return [
        { id: "101", title: "机械与动力仿真实践 · 演示课程" },
        { id: "102", title: "程序设计 · 演示课程" },
      ];
    const token = this.token;
    const courses: Course[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= 100; page++) {
      const data = apiData(
        await this.get(
          "/v1/group_subject_vod_list/t-1",
          {
            "page.pageIndex": String(page),
            "page.pageSize": "100",
            "page.orders[0].asc": "false",
            "page.orders[0].field": "updateTime",
          },
          token,
        ),
      );
      if (!Array.isArray(data?.records)) throw new Error("课程接口格式变化");
      if (!data.records.length) return courses;
      const before = courses.length;
      for (const value of data.records) {
        const row = object(value);
        const id = String(row.teclId ?? "");
        if (!ID.test(id) || Number(id) <= 0)
          throw new Error("课程缺少教学班 teclId");
        if (!seen.has(id)) {
          seen.add(id);
          courses.push({
            id,
            title: String(row.subjName ?? row.courName ?? "未命名课程"),
          });
        }
      }
      if (Number(data.rowCount) > 0 && courses.length >= Number(data.rowCount))
        return courses;
      if (before === courses.length) throw new Error("课程分页没有推进");
    }
    throw new Error("课程列表超过分页上限");
  }
  private async loadRecordings(id: string): Promise<Recording[]> {
    if (!ID.test(id)) throw new Error("课程编号无效");
    if (this.isDemo)
      return [
        {
          id: "206265",
          title: "机构设计与仿真（原始字幕示例）",
          time: "2026-10-28 07:55",
        },
        {
          id: "207075",
          title: "机构运动学（优化字幕回退示例）",
          time: "2026-10-28 08:50",
        },
        { id: "404", title: "尚无字幕（错误示例）", time: "2026-10-28 10:00" },
        { id: "403", title: "无权限（错误示例）", time: "2026-10-28 11:00" },
      ];
    const data = apiData(
      await this.get("/v1/subject_vod_list_new", {
        "page.pageIndex": "1",
        "page.pageSize": "1000",
        teclIds: id,
        "page.orders[0].asc": "false",
        "page.orders[0].field": "courBeginTime",
        schoolOpenStatusFlag: "false",
      }),
    );
    if (!Array.isArray(data?.records)) throw new Error("录像接口格式变化");
    if (Number(data.rowCount) > 1000)
      throw new Error("本原型暂不支持超过 1000 节的课程");
    return data.records.map((value) => {
      const r = object(value);
      if (!ID.test(String(r.id))) throw new Error("录像编号格式变化");
      return {
        id: String(r.id),
        title: String(r.subjName ?? r.courName ?? "课堂录像"),
        time: String(r.courBeginTime ?? "时间未知"),
      };
    });
  }
  private async loadTranscript(id: string): Promise<Transcript> {
    if (!ID.test(id)) throw new Error("录像编号无效");
    const token = this.token;
    if (this.isDemo)
      return fetchTranscript(id, async (original) => {
        if (id === "403")
          return { status: 403, message: "演示：当前账号无权限" };
        if (id === "404" || (id === "207075" && original))
          return { status: 200, data: null };
        return {
          status: 200,
          data: {
            beforeAssemblyList: [
              { bg: 1000, ed: 4800, res: "欢迎来到 Canvas Helper 重构原型。" },
              {
                bg: 5000,
                ed: 9400,
                res: "字幕版本、接口适配与窗口功能分别维护。",
              },
            ],
          },
        };
      });
    return fetchTranscript(id, (original) =>
      this.get(
        `/v1/course/ai/translate/${id}`,
        { useOriginal: String(original) },
        token,
      ),
    );
  }
  async tracks(id: string): Promise<VideoTrack[]> {
    if (!ID.test(id)) throw new Error("录像编号无效");
    if (this.isDemo) throw new Error("演示录像没有真实视频文件，请先连接录像空间");
    const data = apiData(await this.get("/v1/course_vod_urls_new", {courseId:id}));
    if (!data || !Array.isArray(data.courseVodViewList)) throw new Error("录像机位接口格式变化");
    const title = [data.courName,data.subjName,data.courseName].find(value=>typeof value==='string' && value.trim()) as string|undefined;
    const tracks:VideoTrack[]=[];
    for (const [index,value] of data.courseVodViewList.entries()) {
      const row=object(value);
      const url=[row.url,row.playUrl,row.rtmpUrlHdv].find(value=>typeof value==='string' && value.trim()) as string|undefined;
      if(!url)continue;
      schoolVideoUrl(url);
      const view=Number(row.viewNum)||index+1;
      tracks.push({index,view,title:`${title || `录像 ${id}`} · 机位 ${view}`,url});
    }
    if(!tracks.length)throw new Error("录像接口未返回可下载机位");
    return tracks;
  }
}
