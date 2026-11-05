import { app, BrowserWindow, safeStorage, session, type Session } from "electron";
import path from "node:path";
import { RequestCache } from "../core/cache.js";
import { CredentialStore, cookieUrl, restorableCookies } from "./credential-store.js";
import { CanvasApi, canvasOrigins, canvasStatus } from "../core/canvas.js";
import type { CanvasProvider, CanvasStatus, CanvasResourceKind } from "../shared/canvas-contracts.js";

export class CanvasSession {
  private provider: CanvasProvider = "sjtu";
  private loginWindow?: BrowserWindow;
  private loginProvider?: CanvasProvider;
  private loggingOut = false;
  private revision = 0;
  private token = "";
  private authenticating = false;
  private store?: CredentialStore;
  private restoreError = "";
  private cache = new RequestCache();
  private invalidate(): void { this.revision++; this.cache.clear(); }
  async initialize(): Promise<void> {
    this.invalidate();
    this.store = new CredentialStore(path.join(app.getPath("userData"), "canvas-session.enc"), safeStorage);
    try {
      const saved = this.store.load();
      if (!saved) return;
      this.provider = saved.provider;
      this.token = saved.token;
      for (const cookie of restorableCookies(saved.cookies)) {
        const { session: _session, hostOnly, ...details } = cookie;
        await this.partition().cookies.set({ ...details, domain: hostOnly ? undefined : cookie.domain, url: cookieUrl(cookie) });
      }
      await this.partition().cookies.flushStore();
    } catch (error) {
      this.token = "";
      this.restoreError = error instanceof Error ? error.message : "会话恢复失败，请重新登录";
    }
  }
  private async persist(provider = this.provider, token = this.token, revision = this.revision): Promise<void> {
    if (!this.store) throw new Error("会话存储尚未初始化");
    const active = this.partition(provider);
    const cookies = token ? [] : restorableCookies(await active.cookies.get({}));
    await active.cookies.flushStore();
    active.flushStorageData();
    if (revision !== this.revision) throw new Error("Canvas 会话已变化，请重试");
    this.store.save({ schemaVersion: 1, provider, token, cookies });
  }
  async flush(): Promise<void> {
    if (this.restoreError || this.loggingOut || this.authenticating || this.loginWindow || !this.store) return;
    // Do not create credentials for a fresh, logged-out profile.
    if (this.token || (await this.partition().cookies.get({})).length) await this.persist();
  }
  private partition(provider = this.provider): Session {
    return session.fromPartition(`persist:canvas-rebuild-schema1-${provider}`);
  }
  private api(provider = this.provider, token = this.token): CanvasApi {
    const active = this.partition(provider);
    return new CanvasApi(canvasOrigins[provider], (url, init) => active.fetch(url, init), token);
  }
  private async read<T>(operation: (api: CanvasApi) => Promise<T>): Promise<T> {
    if (this.loginWindow || this.loggingOut || this.authenticating) throw new Error("Canvas 正在切换会话，请稍后重试");
    const revision = this.revision;
    const result = await operation(this.api());
    if (revision !== this.revision) throw new Error("Canvas 会话已变化，请重新读取");
    return result;
  }
  async status(): Promise<CanvasStatus> {
    if (this.restoreError) throw new Error(this.restoreError);
    const provider = this.provider;
    const revision = this.revision;
    if (!this.token && !this.loginWindow && !this.authenticating && !this.loggingOut) {
      const cookies = await this.partition().cookies.get({ url: canvasOrigins[provider] });
      if (revision !== this.revision) throw new Error("Canvas 会话已变化，请重新检查");
      if (!cookies.length) return { authenticated: false, provider };
    }
    return this.read(api => canvasStatus(provider, api));
  }
  async connectToken(provider: CanvasProvider, value: string): Promise<CanvasStatus> {
    if (provider !== "sjtu" && provider !== "ji") throw new Error("未知 Canvas 平台");
    if (typeof value !== "string" || !value.trim() || value.length > 16000 || /\s/.test(value.trim()))
      throw new Error("请输入 Canvas 个人访问 Token 原文，不要包含 Bearer 前缀或空格");
    if (this.loginWindow || this.loggingOut || this.authenticating) throw new Error("Canvas 会话操作进行中");
    this.authenticating = true;
    this.invalidate();
    const revision = this.revision;
    try {
      const token = value.trim();
      const user = await this.api(provider, token).user();
      if (revision !== this.revision) throw new Error("Canvas 会话已变化，请重试");
      await this.persist(provider, token, revision);
      if (revision !== this.revision) { this.store?.clear(); throw new Error("Canvas 会话已变化，请重试"); }
      this.provider = provider;
      this.token = token;
      this.restoreError = "";
      return { authenticated: true, provider, user };
    } finally { this.authenticating = false; }
  }
  async login(provider: CanvasProvider): Promise<CanvasStatus> {
    if (provider !== "sjtu" && provider !== "ji") throw new Error("未知 Canvas 平台");
    if (this.loginWindow || this.loggingOut || this.authenticating) throw new Error("Canvas 会话操作进行中");
    const win = new BrowserWindow({ width: 980, height: 760, title: "Canvas 登录",
      webPreferences: { session: this.partition(provider), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    this.loginWindow = win;
    this.loginProvider = provider;
    this.invalidate();
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      try { if (new URL(url).protocol !== "https:") event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    return new Promise((resolve, reject) => {
      let finished = false;
      let checking = false;
      const timer = setTimeout(() => finish(undefined, new Error("登录超时，请重试")), 300000);
      const finish = (result?: CanvasStatus, error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.loginWindow = undefined;
        this.loginProvider = undefined;
        this.invalidate();
        if (result) { this.provider = provider; this.token = ""; }
        if (!win.isDestroyed()) win.close();
        if (result) resolve(result); else reject(error ?? new Error("登录已取消"));
      };
      const check = async () => {
        if (checking || finished || win.isDestroyed()) return;
        if (!win.webContents.getURL().startsWith(canvasOrigins[provider] + "/")) return;
        checking = true;
        try {
          const result = await canvasStatus(provider, this.api(provider, ""));
          if (result.authenticated) {
            if (finished) return;
            const revision = this.revision;
            await this.persist(provider, "", revision);
            if (!finished) { this.restoreError = ""; finish(result); }
          }
        } catch (error) {
          finish(undefined, error instanceof Error ? error : new Error("Canvas 登录验证失败"));
        } finally { checking = false; }
      };
      win.webContents.on("did-finish-load", () => void check());
      win.webContents.on("did-navigate-in-page", () => void check());
      win.once("closed", () => finish());
      const loginPath = provider === "sjtu" ? "/login/openid_connect" : "/login";
      void win.loadURL(canvasOrigins[provider] + loginPath).catch(() => finish(undefined, new Error("无法打开 Canvas 登录页")));
    });
  }
  async logout(): Promise<void> {
    if (this.loggingOut) throw new Error("Canvas 正在注销");
    this.loggingOut = true;
    this.token = "";
    this.invalidate();
    const providers = new Set([this.provider, this.loginProvider].filter((value): value is CanvasProvider => Boolean(value)));
    if (this.loginWindow) this.loginWindow.close();
    try {
      this.store?.clear();
      this.restoreError = "";
      for (const provider of providers) {
        const active = this.partition(provider);
        await active.closeAllConnections();
        await active.clearStorageData();
        await active.clearAuthCache();
      }
    } finally { this.loggingOut = false; this.invalidate(); }
  }
  courses(force = false) {
    return this.read(api => this.cache.get("courses", 5 * 60_000, () => api.courses(), force));
  }
  resources(courseId: string, kind: CanvasResourceKind, force = false) {
    return this.read(api => this.cache.get(`resources:${courseId}:${kind}`, 60_000, () => api.resources(courseId, kind), force));
  }
  withVideoCredentials<T>(operation: (active: Session, token: string) => Promise<T>): Promise<T> {
    return this.read(() => {
      if (this.provider !== "sjtu") throw new Error("录像空间需要 SJTU Canvas 会话，不能使用 JI Token；请切换 SJTU 或手动输入录像 JWT");
      return operation(this.partition(), this.token);
    });
  }
}
