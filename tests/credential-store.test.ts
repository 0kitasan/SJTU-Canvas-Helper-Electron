import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Cookie } from "electron";
import { CredentialStore, restorableCookies, cookieUrl } from "../electron/credential-store.js";

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "canvas-session-test-"));
  const file = path.join(directory, "session.enc");
  const key = randomBytes(32);
  const codec = {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    },
    decryptString(value: Buffer) {
      const cipher = createDecipheriv("aes-256-gcm", key, value.subarray(0,12));
      cipher.setAuthTag(value.subarray(12,28));
      return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString();
    },
  };
  return {directory, file, codec, store:new CredentialStore(file,codec)};
}

test("encrypted credentials survive a new store instance and clear on logout", () => {
  const f = fixture();
  try {
    const saved = { schemaVersion:1 as const, provider:"ji" as const, token:"private-token", cookies:[] };
    f.store.save(saved);
    assert.equal(readFileSync(f.file).includes(Buffer.from("private-token")), false);
    assert.deepEqual(new CredentialStore(f.file,f.codec).load(), saved);
    f.store.clear();
    assert.equal(f.store.load(), undefined);
  } finally { rmSync(f.directory,{recursive:true,force:true}); }
});
test("corrupt encrypted credentials and unavailable system encryption fail explicitly", () => {
  const f = fixture();
  try {
    writeFileSync(f.file, "corrupt");
    assert.throws(() => f.store.load(), /无法解密/);
    const unavailable = new CredentialStore(f.file,{...f.codec,isEncryptionAvailable:()=>false});
    assert.throws(() => unavailable.save({schemaVersion:1,provider:"sjtu",token:"secret",cookies:[]}), /加密不可用/);
    assert.equal(readFileSync(f.file,"utf8"), "corrupt");
  } finally { rmSync(f.directory,{recursive:true,force:true}); }
});
test("failed atomic replacement preserves existing credentials", () => {
  const f = fixture();
  try {
    f.store.save({schemaVersion:1,provider:"sjtu",token:"first",cookies:[]});
    mkdirSync(`${f.file}.${process.pid}.tmp`);
    assert.throws(() => f.store.save({schemaVersion:1,provider:"ji",token:"second",cookies:[]}), /未替换/);
    assert.equal(f.store.load()?.token,"first");
  } finally { rmSync(f.directory,{recursive:true,force:true}); }
});
test("cookie restoration preserves session cookies but does not revive expired cookies", () => {
  const cookie = {domain:".oc.sjtu.edu.cn",name:"session",value:"secret",path:"/",secure:true} as Cookie;
  const cookies = restorableCookies([cookie,{...cookie,expirationDate:99},{...cookie,expirationDate:101}],100);
  assert.equal(cookies.length,2);
  assert.equal(cookies[0].expirationDate,undefined);
  assert.equal(cookies[1].expirationDate,101);
  assert.equal(cookieUrl(cookie),"https://oc.sjtu.edu.cn/");
});
