import test from "node:test";
import assert from "node:assert/strict";
import { CanvasApi, canvasStatus } from "../core/canvas.js";

const origin = "https://oc.sjtu.edu.cn";
test("Canvas personal token is sent only as Bearer header with cookie credentials omitted", async () => {
  const api = new CanvasApi(origin, async (url, init) => {
    assert.equal(url, origin + '/api/v1/users/self');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-personal-token');
    assert.equal(init?.credentials, 'omit');
    return Response.json({id: 123, name: 'Test'});
  }, 'test-personal-token');
  assert.deepEqual(await api.user(), {id:'123', name:'Test'});
});
test("Canvas status only treats an explicit authentication failure as logged out", async () => {
  const expired = new CanvasApi(origin, async () => new Response("", { status: 401 }));
  assert.deepEqual(await canvasStatus("sjtu", expired), { authenticated: false, provider: "sjtu" });
  for (const status of [403, 500]) {
    const api = new CanvasApi(origin, async () => new Response("", { status }));
    await assert.rejects(canvasStatus("sjtu", api));
  }
  const offline = new CanvasApi(origin, async () => { throw new Error("offline"); });
  await assert.rejects(canvasStatus("sjtu", offline), /请求失败/);
  const invalid = new CanvasApi(origin, async () => new Response('{"unexpected":true}'));
  await assert.rejects(canvasStatus("sjtu", invalid), /有效登录身份/);
  const html = new CanvasApi(origin, async () => new Response("<html>login</html>"));
  await assert.rejects(canvasStatus("sjtu", html), /非 JSON/);
});
test("Canvas pagination deduplicates courses and preserves terms", async () => {
  let calls = 0;
  const api = new CanvasApi(origin, async () => {
    calls++;
    return new Response(JSON.stringify(calls === 1 ? [{ id: 1, name: "A", term: { name: "秋" } }] : [{ id: 1 }, { id: 2, name: "B" }]), {
      headers: calls === 1 ? { link: `<${origin}/api/v1/courses?page=2>; rel="next"` } : {},
    });
  });
  assert.deepEqual(await api.courses(), [{ id: "1", title: "A", term: "秋" }, { id: "2", title: "B", term: "" }]);
  assert.equal(calls, 2);
});
test("Canvas refuses cross-origin pagination before making request", async () => {
  let calls = 0;
  const api = new CanvasApi(origin, async () => {
    calls++;
    return new Response('[{"id":1}]', { headers: { link: '<https://example.org/api/v1/courses>; rel="next"' } });
  });
  await assert.rejects(api.courses(), /非 Canvas/);
  assert.equal(calls, 1);
});
test("Canvas reports non-progressing pages and expired sessions", async () => {
  const api = new CanvasApi(origin, async () => new Response('[{"id":1}]', { headers: { link: `<${origin}/api/v1/courses?page=2>; rel="next"` } }));
  await assert.rejects(api.courses(), /没有推进/);
  const expired = new CanvasApi(origin, async () => new Response("", { status: 401 }));
  await assert.rejects(expired.user(), /会话已过期/);
});
test("Canvas resources reject arbitrary routes and redact signed URLs", async () => {
  let calls = 0;
  const api = new CanvasApi(origin, async () => {
    calls++;
    return new Response('[{"id":1,"display_name":"notes.pdf","url":"https://secret/?token=x","token":"secret"}]');
  });
  await assert.rejects(api.resources("../../users", "files"), /课程编号/);
  assert.equal(calls, 0);
  assert.deepEqual(await api.resources("1", "files"), [{ id: 1, display_name: "notes.pdf" }]);
});
