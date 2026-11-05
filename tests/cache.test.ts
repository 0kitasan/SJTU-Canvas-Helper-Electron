import test from "node:test";
import assert from "node:assert/strict";
import { RequestCache } from "../core/cache.js";
import { VideoService } from "../core/service.js";

test("cache combines concurrent requests and starts TTL after resolution", async () => {
  let now = 0, calls = 0;
  const cache = new RequestCache(() => now);
  let resolve!: (value: number) => void;
  const load = () => { calls++; return new Promise<number>(done => { resolve = done; }); };
  const first = cache.get("courses", 100, load);
  assert.equal(first, cache.get("courses", 100, load));
  await Promise.resolve(); now = 500; resolve(7);
  assert.equal(await first, 7);
  now = 599; assert.equal(await cache.get("courses", 100, load), 7);
  assert.equal(calls, 1);
  now = 600;
  assert.equal(await cache.get("courses", 100, async () => ++calls), 2);
});

test("force replaces settled data but combines simultaneous refreshes", async () => {
  const cache = new RequestCache();
  assert.equal(await cache.get("courses", 10000, async () => 1), 1);
  const refresh = cache.get("courses", 10000, async () => 2, true);
  assert.equal(refresh, cache.get("courses", 10000, async () => 3, true));
  assert.equal(await refresh, 2);
});

test("failure is not retained and different course/resource keys stay independent", async () => {
  const cache = new RequestCache();
  await assert.rejects(cache.get("a", 10000, async () => { throw new Error("offline"); }), /offline/);
  assert.equal(await cache.get("a", 10000, async () => 1), 1);
  assert.equal(await cache.get("b", 10000, async () => 2), 2);
});

test("clear prevents an old in-flight account request from repopulating cache", async () => {
  const cache = new RequestCache();
  let resolve!: (value: string) => void;
  const old = cache.get("courses", 10000, () => new Promise<string>(done => { resolve = done; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.get("courses", 10000, async () => "new account"), "new account");
  resolve("old account"); await old;
  assert.equal(await cache.get("courses", 10000, async () => "must not load"), "new account");
});

test("video reads combine requests, force refresh and clear when credentials change", async () => {
  let calls = 0;
  const service = new VideoService(async () => {
    calls++;
    return Response.json({status:200,data:{records:[{teclId:1,subjName:'Fixture'}],rowCount:1}});
  });
  service.connect('header.payload.signature');
  await Promise.all([service.courses(),service.courses()]);
  assert.equal(calls,1);
  await service.courses(); assert.equal(calls,1);
  await service.courses(true); assert.equal(calls,2);
  service.connect('other.payload.signature');
  await service.courses(); assert.equal(calls,3);
  service.demo(); assert.equal((await service.courses())[0].id,'101');
});

test("video does not return an old in-flight response after switching session", async () => {
  let resolve!: (response: Response) => void;
  const service = new VideoService(() => new Promise<Response>(done => { resolve=done; }));
  service.connect('header.payload.signature');
  const old = service.courses();
  const rejected = assert.rejects(old,/会话已变化/);
  await Promise.resolve();
  service.demo();
  resolve(Response.json({status:200,data:{records:[],rowCount:0}}));
  await rejected;
  assert.equal((await service.courses())[0].id,'101');
});
