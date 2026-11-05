import { app, BrowserWindow, ipcMain, dialog, safeStorage, net } from "electron";
import { CredentialStore } from "./credential-store.js";
import { tryVideoLogin } from "./video-session.js";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { VideoService } from "../core/service.js";
import { enqueueVideoBatch } from "../core/video-batch.js";
import type { VideoSelection } from "../shared/downloads.js";
import { DownloadManager } from "../core/downloads.js";
import { CanvasSession } from "./canvas-session.js";
import type { CanvasProvider, CanvasResourceKind } from "../shared/canvas-contracts.js";
import { versionLabel } from "../shared/contracts.js";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
createRequire(import.meta.url)(path.join(root, "electron/stdio.cjs")).install();
function startupLog(phase: string) {
  try {
    const folder = path.join(app.getPath("userData"), "logs");
    mkdirSync(folder, { recursive: true });
    appendFileSync(path.join(folder, "startup.jsonl"), JSON.stringify({time: new Date().toISOString(), pid: process.pid, phase}) + "\n");
  } catch { /* Diagnostic logging must not prevent launching a window. */ }
}
const service = new VideoService((url, init) => net.fetch(url instanceof URL ? url.href : url, init));
const profile = process.env.CANVAS_HELPER_SMOKE_PROFILE || path.join(app.getPath("appData"), "SJTU-Canvas-Rebuild-Electron-schema1");
app.setPath("userData", profile);
app.setPath("sessionData", profile);
startupLog("main-loaded");
const canvasSession = new CanvasSession();
const videoStore = new CredentialStore(path.join(profile, "video-session.enc"), safeStorage);
async function connectVideo(token: string) {
  const probe = new VideoService((url, init) => net.fetch(url instanceof URL ? url.href : url, init));
  probe.connect(token);
  await probe.courses();
  videoStore.save({schemaVersion: 1, provider: "sjtu", token, cookies: []});
  service.connect(token);
}
const windows = new Set<BrowserWindow>();
// Signed media URLs do not need Chromium cookies. Node transport also avoids
// Chromium ERR_BLOCKED_BY_CLIENT observed on the school's media host.
const downloads = new DownloadManager();
downloads.onChange(() => {
  for (const win of windows) if (!win.isDestroyed()) win.webContents.send("downloads:changed", downloads.list());
});
function showWindow(win: BrowserWindow) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
function createWindow(page = "library") {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 560,
    minHeight: 600,
    title: "SJTU Canvas Helper · Electron 重构",
    show: false,
    webPreferences: {
      preload: path.join(root, "electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  windows.add(win);
  startupLog("window-created");
  win.once("closed", () => windows.delete(win));
  win.once("ready-to-show", () => { showWindow(win); startupLog(`window-visible:${win.isVisible()}`); });
  win.webContents.once("did-finish-load", () => startupLog("renderer-loaded"));
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadFile(path.join(root, "dist/index.html"), { query: { page } });
  return win;
}
const hasInstanceLock = app.requestSingleInstanceLock();
startupLog(`instance-lock:${hasInstanceLock}`);
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => {
  const win = [...windows][0];
  if (win) showWindow(win);
});
app.whenReady().then(async () => {
  startupLog("app-ready");
  if (!hasInstanceLock) return;
  await canvasSession.initialize();
  try {
    const saved = videoStore.load();
    if (saved?.token) service.connect(saved.token);
  } catch { startupLog("video-session-restore-failed"); }
  const handle = (name: string, fn: (...args: any[]) => unknown) =>
    ipcMain.handle(name, (event, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (
        !win ||
        !event.senderFrame ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error("无效窗口请求");
      return fn(...args);
    });
  handle("connection:connect", (token: string) => connectVideo(token));
  handle("connection:login", () => canvasSession.withVideoCredentials(async (active, canvasToken) => {
    const token = await tryVideoLogin(active, canvasToken || undefined);
    await connectVideo(token);
  }));
  handle("canvas:status", () => canvasSession.status());
  handle("canvas:login", (provider: CanvasProvider) => canvasSession.login(provider));
  handle("canvas:token", (provider: CanvasProvider, token: string) => canvasSession.connectToken(provider, token));
  handle("canvas:logout", () => canvasSession.logout());
  handle("canvas:courses", (force: boolean) => canvasSession.courses(force === true));
  handle("canvas:resources", (id: string, kind: CanvasResourceKind, force: boolean) => canvasSession.resources(id, kind, force === true));
  handle("video:tracks", async (id: string) => (await service.tracks(id)).map(({index,view,title}) => ({index,view,title})));
  const batchDownload = (selections: VideoSelection[]) => enqueueVideoBatch(selections, {
    chooseDirectory: async () => {
      const defaultDirectory = path.join(process.env.CANVAS_HELPER_SMOKE_PROFILE ? path.join(root,"logs") : app.getPath("videos"), "SJTU_Canvas_Helper-electron");
      await mkdir(defaultDirectory, {recursive:true});
      const result = await dialog.showOpenDialog({
        defaultPath: defaultDirectory,
        properties: ["openDirectory", "createDirectory"], title: "选择视频保存目录（所选课节全部机位）"
      });
      if (result.canceled || !result.filePaths[0]) return;
      await mkdir(result.filePaths[0], {recursive:true});
      return result.filePaths[0];
    },
    tracks: id => service.tracks(id), revision: () => service.connection().revision,
    enqueue: input => downloads.enqueue(input)
  });
  handle("video:download-batch", batchDownload);
  handle("video:download", async (id:string, _index:number, title:string) => {
    const result = await batchDownload([{id,title}]);
    if (result.errors.length) throw new Error(result.errors[0].message);
    return result.tasks[0] || null;
  });
  handle("downloads:list", () => downloads.list());
  handle("downloads:cancel", (id:string) => { downloads.cancel(id); });
  handle("downloads:retry", (id:string) => { downloads.retry(id); });
  handle("connection:status", () => service.connection());
  handle("connection:demo", () => { videoStore.clear(); service.demo(); });
  handle("library:courses", (force:boolean) => service.courses(force === true));
  handle("library:recordings", (id: string, force:boolean) => service.recordings(id,force === true));
  handle("library:transcript", (id: string, force:boolean) => service.transcript(id,force === true));
  handle("library:save", async (id: string, title: string) => {
    const transcript = await service.transcript(id);
    const name =
      String(title)
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .slice(0, 100) || "课堂";
    const result = await dialog.showSaveDialog({
      defaultPath: `课堂_${name}（${versionLabel(transcript.version)}）.srt`,
      filters: [{ name: "字幕 SRT", extensions: ["srt"] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, transcript.srt, "utf8");
    return { path: result.filePath, version: transcript.version };
  });
  handle("workspace:open", (page: string) => {
    if (!["library", "connection", "files", "assignments", "discussions", "calendar", "users", "grades", "submissions", "syllabus", "qrcode", "annual", "relationship", "debug"].includes(page)) throw new Error("未知页面");
    createWindow(page);
  });
  createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
let flushed = false;
app.on("before-quit", event => {
  if (!hasInstanceLock || flushed) return;
  event.preventDefault();
  void Promise.all([downloads.shutdown(), canvasSession.flush()]).catch(() => {
    startupLog("session-flush-failed");
  }).finally(() => { flushed = true; app.quit(); });
});
