import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Cookie } from "electron";
import type { CanvasProvider } from "../shared/canvas-contracts.js";

export interface StoredSession {
  schemaVersion: 1;
  provider: CanvasProvider;
  token: string;
  cookies: Cookie[];
}
export interface SecretCodec {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export class CredentialStore {
  constructor(private file: string, private codec: SecretCodec) {}
  load(): StoredSession | undefined {
    let encrypted: Buffer;
    try { encrypted = readFileSync(this.file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw new Error("无法读取加密会话文件"); }
    try {
      if (!this.codec.isEncryptionAvailable()) throw new Error();
      const value = JSON.parse(this.codec.decryptString(encrypted)) as StoredSession;
      if (value.schemaVersion !== 1 || !["sjtu", "ji"].includes(value.provider) || typeof value.token !== "string" || !Array.isArray(value.cookies)) throw new Error();
      return value;
    } catch { throw new Error("无法解密或识别已保存的登录信息，请重新登录或退出以清除"); }
  }
  save(value: StoredSession): void {
    if (!this.codec.isEncryptionAvailable()) throw new Error("系统加密不可用，无法安全保存登录信息");
    const temporary = `${this.file}.${process.pid}.tmp`;
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      const encrypted = this.codec.encryptString(JSON.stringify(value));
      writeFileSync(temporary, encrypted, { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch {
      try { unlinkSync(temporary); } catch { /* Best effort; this file only contains ciphertext. */ }
      throw new Error("无法安全保存登录信息，原有登录信息未替换");
    }
  }
  clear(): void {
    try { unlinkSync(this.file); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("无法删除已保存的登录信息"); }
  }
}

export function cookieUrl(cookie: Cookie): string {
  return `${cookie.secure ? "https" : "http"}://${(cookie.domain || "").replace(/^\./, "")}${cookie.path || "/"}`;
}
export function restorableCookies(cookies: Cookie[], now = Date.now() / 1000): Cookie[] {
  return cookies.filter(cookie => typeof cookie.domain === "string" && typeof cookie.name === "string" && typeof cookie.value === "string" &&
    (cookie.expirationDate === undefined || cookie.expirationDate > now));
}
