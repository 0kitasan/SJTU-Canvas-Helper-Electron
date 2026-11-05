import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  Bridge,
  Course,
  Recording,
  Transcript,
} from "../shared/contracts";
import { versionLabel } from "../shared/contracts";
import type { CanvasCourse } from "../shared/canvas-contracts";
import "./style.css";
import { Icon, type IconName } from "./icons";
import type { DownloadTask } from "../shared/downloads";
declare global {
  interface Window {
    canvas: Bridge;
  }
}
const navigation = [
  ["files", "files", "文件管理"],
  ["assignments", "assignments", "作业列表"],
  ["discussions", "discussions", "讨论管理"],
  ["calendar", "calendar", "日程管理"],
  ["users", "users", "成员导出"],
  ["grades", "grades", "成绩管理"],
  ["submissions", "submissions", "提交批改"],
  ["syllabus", "syllabus", "教学大纲"],
  ["library", "library", "视频管理"],
  ["qrcode", "qrcode", "二维码管理"],
  ["annual", "annual", "年度总结"],
  ["relationship", "relationship", "关系图谱"],
  ["connection", "connection", "系统设置"],
] as const;
type Page = string;
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/, "").replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
}
type ResourceKind =
  "files" | "assignments" | "discussions" | "users" | "syllabus" | "grades";
function CanvasAccount() {
  const [canvasToken, setCanvasToken] = useState("");
  const [account, setAccount] = useState("尚未检查 Canvas 会话");
  const [provider, setProvider] = useState<"sjtu" | "ji">("sjtu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function action(kind: "status" | "login" | "logout" | "token") {
    const current = ++request.current;
    setBusy(true);
    setError("");
    try {
      if (kind === "token") {
        const value = canvasToken;
        setCanvasToken("");
        await window.canvas.canvasConnectToken(provider, value);
      }
      if (kind === "login") await window.canvas.canvasLogin(provider);
      if (kind === "logout") await window.canvas.canvasLogout();
      const result = await window.canvas.canvasStatus();
      if (current !== request.current) return;
      setProvider(result.provider);
      setAccount(
        result.authenticated
          ? `已登录 · ${result.user?.name || result.provider}`
          : "未登录 Canvas",
      );
    } catch (e) {
      if (current === request.current) setError(errorText(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (window.canvas) void action("status");
  }, []);
  return (
    <div className="canvas-account">
      <h2>Canvas / jAccount 登录</h2>
      <p className="muted">Canvas 个人访问 Token 用于课程、文件和作业；它不是录像空间 JWT。登录信息由系统加密保存，重启自动恢复；退出 Canvas 会清除保存的信息。</p>
      <label htmlFor="canvas-token">Canvas 个人访问 Token</label>
      <div className="actions">
        <input id="canvas-token" type="password" autoComplete="off" value={canvasToken} disabled={busy} onChange={e => setCanvasToken(e.target.value)} placeholder="Canvas → 账户 → 设置 → 个人访问令牌" />
        <button disabled={busy || !canvasToken.trim()} onClick={() => void action("token")}>验证并连接 Canvas Token</button>
      </div>
      <p className="muted">
        登录在独立的学校登录窗口中完成；应用不读取账号密码。
      </p>
      <div className="actions">
        <select
          aria-label="Canvas 登录站点"
          value={provider}
          onChange={(e) => setProvider(e.target.value as "sjtu" | "ji")}
        >
          <option value="sjtu">上海交通大学 Canvas</option>
          <option value="ji">密西根学院 Canvas</option>
        </select>
        <button disabled={busy} onClick={() => void action("login")}>
          登录 Canvas
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void action("status")}
        >
          检查会话
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void action("logout")}
        >
          退出 Canvas
        </button>
      </div>
      <p role="status" className="muted">
        {busy ? "正在处理会话…" : account}
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <hr />
    </div>
  );
}
function CanvasWorkspace({ kind }: { kind: ResourceKind }) {
  const [courses, setCourses] = useState<CanvasCourse[]>([]);
  const [term, setTerm] = useState("");
  const [courseId, setCourseId] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function loadCourses(force = false) {
    const current = ++request.current;
    setBusy(true);
    setError("");
    setLoaded(false);
    setRows([]);
    try {
      const results = await window.canvas.canvasCourses(force);
      if (current !== request.current) return;
      setCourses(results);
      setTerm(results[0]?.term || "未提供学期");
      setCourseId(results[0] ? String(results[0].id) : "");
    } catch (e) {
      if (current === request.current) setError(errorText(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  async function loadResources() {
    const current = ++request.current;
    setBusy(true);
    setError("");
    setRows([]);
    setLoaded(false);
    try {
      const results = await window.canvas.canvasResources(courseId, kind, true);
      if (current !== request.current) return;
      setRows(results);
      setLoaded(true);
    } catch (e) {
      if (current === request.current) setError(errorText(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (window.canvas) void loadCourses();
  }, [kind]);
  useEffect(() => {
    if (!courseId || selectedRestricted(courseId)) return;
    const current = ++request.current;
    setBusy(true); setError("");
    void window.canvas.canvasResources(courseId, kind).then(results => {
      if (current === request.current) { setRows(results); setLoaded(true); }
    }).catch(e => { if (current === request.current) setError(errorText(e)); })
      .finally(() => { if (current === request.current) setBusy(false); });
    return () => { request.current++; };
  }, [courseId, kind]);
  function selectedRestricted(id: string) { return courses.find(c => c.id === id)?.accessRestricted; }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const termName = (course: CanvasCourse) => course.term || "未提供学期";
  const terms = [...new Set(courses.map(termName))];
  const visibleCourses = term ? courses.filter(c => termName(c) === term) : courses;
  const selectedCourse = courses.find(c => c.id === courseId);
  function valueText(value: unknown) {
    if (value === null || value === undefined) return "—";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
  }
  return (
    <section>
      <div className="toolbar">
        <label htmlFor="canvas-term">学期</label>
        <select id="canvas-term" aria-label="Canvas 学期" disabled={busy || !courses.length} value={term} onChange={e => {
          setTerm(e.target.value);
          setCourseId(courses.find(c => !e.target.value || termName(c) === e.target.value)?.id || "");
          setRows([]); setLoaded(false);
        }}>
          <option value="">全部学期</option>
          {terms.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
        <label htmlFor="canvas-course">Canvas 课程</label>
        <select
          id="canvas-course"
          value={courseId}
          disabled={busy || !courses.length}
          onChange={(e) => {
            setCourseId(e.target.value);
            setRows([]);
            setLoaded(false);
          }}
        >
          {!courses.length && <option value="">暂无 Canvas 课程</option>}
          {visibleCourses.map((c) => (
            <option key={String(c.id)} value={String(c.id)}>
              {c.title}{c.accessRestricted ? " · 访问受限" : ""}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !courseId || selectedCourse?.accessRestricted}
          onClick={() => void loadResources()}
        >
          读取数据
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void loadCourses(true)}
        >
          刷新课程
        </button>
      </div>
      {selectedCourse?.nameMissing && <p role="status" className="muted">课程 {selectedCourse.id} 的接口未返回名称{selectedCourse.accessRestricted ? "，学校按日期限制了访问" : "，已显示课程编号以便核对"}。</p>}
      <p className="muted">
        Canvas 真实只读接口 · 请先在系统设置登录。此处课程 ID 与录像空间教学班
        ID 独立。下载、附件提交及教师写入操作尚未迁移。
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((key) => (
                <th key={key}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((key) => (
                  <td key={key} className="resource-cell">
                    {valueText(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          {busy
            ? "正在读取 Canvas…"
            : loaded
              ? "接口返回空列表"
              : "选择 Canvas 课程后读取数据"}
        </div>
      )}
      <p className="muted">{loaded ? `已读取 ${rows.length} 条。HTML 内容以文本显示。` : "尚未成功读取课程资料。"}</p>
    </section>
  );
}
function App() {
  const [page, setPage] = useState<Page>(() => {
    const requested = new URLSearchParams(location.search).get("page");
    return requested &&
      (navigation.some((n) => n[0] === requested) || requested === "debug")
      ? requested
      : "library";
  });
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark");
  const [debug, setDebug] = useState(localStorage.getItem("debug") === "true");
  const [zoom, setZoom] = useState(localStorage.getItem("zoom") || "100");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [checkedRecordings, setCheckedRecordings] = useState<Set<string>>(new Set());
  const allRecordingCheckbox = useRef<HTMLInputElement>(null);
  const checkedCount = recordings.filter(r => checkedRecordings.has(r.id)).length;
  useEffect(() => {
    if (allRecordingCheckbox.current) allRecordingCheckbox.current.indeterminate = checkedCount > 0 && checkedCount < recordings.length;
  }, [checkedCount, recordings.length, page]);
  useEffect(() => {
    if (!window.canvas) return;
    const off = window.canvas.onDownloads(setTasks);
    void window.canvas.downloadTasks().then(setTasks).catch(e => setError(errorText(e)));
    return off;
  }, []);
  const [selected, setSelected] = useState<Recording | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [token, setToken] = useState("");
  const [mode, setMode] = useState("连接状态读取中");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [exports, setExports] = useState<{ name: string; path: string }[]>([]);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    page: string;
  } | null>(null);
  const generation = useRef(0),
    revision = useRef(-1);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.style.fontSize = `${(Number(zoom) / 100) * 14}px`;
    localStorage.setItem("zoom", zoom);
  }, [zoom]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setCheckedRecordings(new Set());
    const connection = await window.canvas.connection();
    setMode(connection.demo ? "演示数据" : "真实服务（未验收）");
    revision.current = connection.revision;
    const current = ++generation.current;
    setRecordings([]);
    setTranscript(null);
    setSelected(null);
    setCourses([]);
    setCourseId("");
    const nextCourses = await window.canvas.courses(true);
    if (connection.revision !== (await window.canvas.connection()).revision)
      return refresh();
    if (current === generation.current) {
      setCourses(nextCourses);
      setCourseId(nextCourses[0]?.id || "");
    }
  }
  useEffect(() => {
    if (window.canvas) void run(refresh);
    else setError("浏览器仅供界面预览；请通过 Electron 启动以连接后台。");
    const onFocus = () => {
      if (window.canvas)
        void window.canvas
          .connection()
          .then((c) => {
            if (c.revision !== revision.current) void run(refresh);
          })
          .catch((e) => setError(errorText(e)));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  async function chooseCourse(id: string) {
    setCheckedRecordings(new Set());
    const current = ++generation.current;
    setCourseId(id);
    setTranscript(null);
    setSelected(null);
    setRecordings([]);
    if (!id) return;
    await run(async () => {
      const rows = await window.canvas.recordings(id);
      if (current === generation.current) setRecordings(rows);
    });
  }
  async function downloadRecordings(rows: Recording[]) {
    if (!rows.length) return;
    await run(async () => {
      const result = await window.canvas.downloadVideos(rows.map(r => ({id:r.id, title:`${r.time} ${r.title}`, startTime:r.time, courseId, courseTitle:courses.find(c => c.id === courseId)?.title || "未分类课程"})));
      if (result.cancelled) { setStatus("已取消选择保存目录，未添加下载任务。"); return; }
      setTasks(await window.canvas.downloadTasks());
      setStatus(`已添加 ${result.tasks.length} 个机位下载任务（所选 ${rows.length} 个课节，默认全部机位）。`);
      if (result.errors.length) setError(`部分课节未能添加：${result.errors.map(item => `录像 ${item.id}：${item.message}`).join("；")}`);
    });
  }
  async function chooseRecording(r: Recording) {
    const current = ++generation.current;
    setSelected(r);
    setTranscript(null);
    await run(async () => {
      const t = await window.canvas.transcript(r.id);
      if (current === generation.current) setTranscript(t);
    });
  }
  async function saveTranscript() {
    if (!selected) return;
    await run(async () => {
      const out = await window.canvas.save(
        selected.id,
        `${selected.time} ${selected.id}`,
      );
      if (out) {
        const name = `${selected.title} · ${versionLabel(out.version)} SRT`;
        setExports((rows) => [...rows, { name, path: out.path }]);
        setStatus(`已保存${versionLabel(out.version)}：${out.path}`);
      }
    });
  }
  const title = navigation.find((n) => n[0] === page)?.[2] || "Debug 控制台";
  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""}`}
      onClick={() => setMenu(null)}
    >
      <aside>
        <div className="brand">
          <span className="brand-icon"><Icon name="brand" /></span>
          <strong>Canvas Helper</strong>
          <button
            className="icon-button"
            aria-label={collapsed ? "展开导航" : "收起导航"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? "right" : "left"} />
          </button>
        </div>
        <nav aria-label="主要导航">
          {navigation.map(([key, icon, label]) => (
            <button
              key={key}
              title={label}
              className={`nav ${page === key ? "selected" : ""}`}
              onClick={() => setPage(key)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, page: key });
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name={icon as IconName} />
              </span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
          {debug && (
            <button
              className={`nav ${page === "debug" ? "selected" : ""}`}
              onClick={() => setPage("debug")}
              title="Debug 控制台"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, page: "debug" });
              }}
            >
              <span className="nav-icon"><Icon name="debug" /></span>
              <span className="nav-label">Debug 控制台</span>
            </button>
          )}
        </nav>
        <div className="aside-bottom">
          <span>v0.1 · Electron 重构中</span>
          <small>右键导航可打开独立窗口</small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="breadcrumb">Canvas Helper / {title}</span>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <span className="badge">{page === "library" || page === "connection" ? mode : ["files","assignments","discussions","users","grades","syllabus"].includes(page) ? "Canvas 只读接口" : "迁移中"}</span>
            <button
              className="secondary"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="切换主题"
            >
              {theme === "dark" ? "☀ 浅色" : "☾ 深色"}
            </button>
            <button
              className="secondary"
              onClick={() =>
                document
                  .getElementById("download-results")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              下载记录 {exports.length}
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {status && (
          <p role="status" className="status">
            {status}
          </p>
        )}
        {page === "connection" ? (
          <section className="connection">
            <CanvasAccount />
            <h2>录像空间连接</h2>
            <p className="muted">
              优先使用已登录的 Canvas 会话连接录像空间；成功后由系统加密保存录像凭据。学校要求重新认证时会明确提示。
            </p>
            <button disabled={busy} onClick={() => void run(async () => {
              await window.canvas.loginVideo(); await refresh(); setPage("library");
            })}>通过 Canvas 会话连接录像空间</button>
            <label htmlFor="token">录像平台 jwt-token</label>
            <input
              id="token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="也可手动输入录像 JWT；验证后加密保存"
            />
            <div className="actions">
              <button
                disabled={busy || !token.trim()}
                onClick={() =>
                  void run(async () => {
                    await window.canvas.connect(token);
                    setToken("");
                    await refresh();
                    setPage("library");
                  })
                }
              >
                连接并读取课程
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await window.canvas.demo();
                    setToken("");
                    await refresh();
                    setPage("library");
                  })
                }
              >
                使用演示数据
              </button>
            </div>
            <hr />
            <h2>外观与诊断</h2>
            <div className="settings-row">
              <label htmlFor="zoom">界面缩放</label>
              <select
                id="zoom"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
              >
                {[80, 90, 100, 110, 125, 150].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={debug}
                onChange={(e) => {
                  setDebug(e.target.checked);
                  localStorage.setItem("debug", String(e.target.checked));
                }}
              />
              显示 Debug 控制台
            </label>
            <p className="muted">
              仅外观设置保存在本地。原版账号配置保持只读，尚未导入。
            </p>
          </section>
        ) : page === "library" ? (
          <>
            <section className="video-workspace">
              <div className="section-title">
                <h2>课堂录像与资料</h2>
                <span className="muted">录像空间 · 课程资料</span>
              </div>
              <div className="toolbar">
                <label htmlFor="source">来源</label>
                <select id="source" aria-label="录像来源">
                  <option>录像空间</option>
                </select>
                <label htmlFor="course">课程</label>
                <select
                  id="course"
                  disabled={busy || !courses.length}
                  value={courseId}
                  onChange={(e) => void chooseCourse(e.target.value)}
                >
                  {!courses.length && <option value="">暂无课程</option>}
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button
                  className="course"
                  disabled={busy || !courseId}
                  onClick={() => void chooseCourse(courseId)}
                >
                  读取课程资料
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(refresh)}
                >
                  刷新
                </button>
              </div>
              <p className="muted">
                当前接口未提供学期元数据；Canvas /
                旧录像来源与学期筛选尚未迁移。
              </p>
              <div className="video-grid">
                <div className="recordings">
                  <div className="toolbar recording-selection">
                    <span>已选 {checkedCount} / {recordings.length} 个课节</span>
                    <button className="secondary" disabled={busy || !checkedCount} onClick={() => setCheckedRecordings(new Set())}>清空选择</button>
                    <button disabled={busy || !checkedCount || mode === "演示数据"} onClick={() => void downloadRecordings(recordings.filter(r => checkedRecordings.has(r.id)))}>下载所选（全部机位）</button>
                  </div>
                  <p className="muted download-location-hint">确认保存目录后才开始下载；Windows 路径选择器初始位置为“视频 / SJTU_Canvas_Helper-electron”，可自行更改。</p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th className="selection-cell"><input ref={allRecordingCheckbox} type="checkbox" aria-label="全选当前课程课节" disabled={busy || !recordings.length} checked={recordings.length > 0 && checkedCount === recordings.length} onChange={e => setCheckedRecordings(e.target.checked ? new Set(recordings.map(r => r.id)) : new Set())}/></th>
                          <th>课节 / 时间</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recordings.map((r) => (
                          <tr
                            key={r.id}
                            className={selected?.id === r.id ? "active" : ""}
                          >
                            <td className="selection-cell"><input type="checkbox" aria-label={`选择课节 ${r.title}`} disabled={busy} checked={checkedRecordings.has(r.id)} onChange={e => setCheckedRecordings(current => {
                              const next = new Set(current);
                              if (e.target.checked) next.add(r.id); else next.delete(r.id);
                              return next;
                            })}/></td>
                            <td>
                              {r.title}
                              <small>
                                {r.time} · 录像 {r.id}
                              </small>
                            </td>
                            <td>
                              <button className="secondary" disabled={busy || mode === "演示数据"} onClick={() => void downloadRecordings([r])}>下载全部机位</button>
                              <button
                                disabled={busy}
                                className="recording secondary"
                                onClick={() => void chooseRecording(r)}
                              >
                                查看资料
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!recordings.length && (
                    <div className="empty">
                      {busy ? "正在读取课节…" : "选择课程并读取课堂录像和资料"}
                    </div>
                  )}
                </div>
                <section className="preview">
                  <div className="section-title">
                    <h2>字幕预览</h2>
                    {transcript && (
                      <span className="badge">
                        {versionLabel(transcript.version)}
                      </span>
                    )}
                  </div>
                  {transcript && selected ? (
                    <>
                      <p className="muted">
                        {selected.title} · {transcript.lines.length} 条
                      </p>
                      <button
                        disabled={busy}
                        onClick={() => void saveTranscript()}
                      >
                        下载 SRT
                      </button>
                      <div className="lines">
                        {transcript.lines.map((line, i) => (
                          <div className="line" key={i}>
                            <time>{Math.floor(line.bg / 1000)}s</time>
                            <p>{line.res}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty">
                      {busy ? "正在读取资料…" : "选择课节查看字幕及版本"}
                    </div>
                  )}
                </section>
              </div>
              <div className="player-empty">
                视频播放、直播及 PPT 下载尚未迁移；视频下载支持接口返回的独立 MP4 机位。
              </div>
            </section>
            <section id="download-results">
              <div className="section-title">
                <h2>下载记录</h2>
                <span className="muted">
                  视频任务由后台统一排队，所有窗口共享；字幕导出记录仅本窗口。
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>任务</th>
                      <th>进度</th>
                      <th>保存位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map(task => <tr key={task.id}><td>{task.title}<small>{task.state}{task.error ? ` · ${task.error}` : ""}</small></td><td>
                      {task.total ? <progress value={task.received} max={task.total}/> : task.state === "running" ? <progress/> : null}
                      <small>{(task.received / 1048576).toFixed(1)} MB{task.total ? ` / ${(task.total / 1048576).toFixed(1)} MB` : ""}</small>
                      {["running","queued"].includes(task.state) && <button onClick={()=>void run(()=>window.canvas.cancelDownload(task.id))}>取消</button>}
                      {["failed","cancelled"].includes(task.state) && <button onClick={()=>void run(()=>window.canvas.retryDownload(task.id))}>重试</button>}
                    </td><td className="path">{task.filePath}</td></tr>)}
                    {exports.map((out, i) => (
                      <tr key={i}>
                        <td>{out.name}</td>
                        <td>
                          <progress value="100" max="100" />
                          <small>已完成 · 100%</small>
                        </td>
                        <td className="path">{out.path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!exports.length && !tasks.length && (
                <div className="empty compact">
                  暂无下载记录。选择课节预览字幕后导出 SRT。
                </div>
              )}
            </section>
          </>
        ) : [
            "files",
            "assignments",
            "discussions",
            "users",
            "syllabus",
            "grades",
          ].includes(page) ? (
          <CanvasWorkspace key={page} kind={page as ResourceKind} />
        ) : (
          <section className="unmigrated">
            <h2>{title}尚未迁移</h2>
            <p className="muted">
              已保留原版导航位置。此页面当前不提供学校业务操作，完整功能迁移进度见
              FEATURE-PARITY.md。
            </p>
            <button className="secondary" onClick={() => setPage("library")}>
              返回视频管理
            </button>
          </section>
        )}
      </main>
      {menu && (
        <div
          className="context"
          style={{
            left: Math.min(menu.x, innerWidth - 220),
            top: Math.min(menu.y, innerHeight - 60),
          }}
        >
          <button
            onClick={() => {
              void run(() => window.canvas.openWindow(menu.page));
              setMenu(null);
            }}
          >
            在新窗口中打开
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
