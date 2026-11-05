import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchTranscript,
  parseLines,
  toSrt,
  EmptyTranscript,
} from "../core/subtitles.js";
const valid = {
  status: 200,
  data: { beforeAssemblyList: [{ bg: 1250, ed: 62000, res: "测试字幕" }] },
};
test("preserves original provenance and exact millisecond timestamps", async () => {
  const calls: boolean[] = [];
  const t = await fetchTranscript("1", async (o) => {
    calls.push(o);
    return valid;
  });
  assert.equal(t.version, "original");
  assert.deepEqual(calls, [true]);
  assert.equal(t.srt, "1\n00:00:01,250 --> 00:01:02,000\n测试字幕\n");
});
test("optimized-only subtitle is identified after empty original", async () => {
  const calls: boolean[] = [];
  const t = await fetchTranscript("1", async (o) => {
    calls.push(o);
    return o ? { status: 200, data: null } : valid;
  });
  assert.equal(t.version, "optimized");
  assert.deepEqual(calls, [true, false]);
});
test("permission errors are never treated as missing subtitles", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      fetchTranscript("1", async () => {
        calls++;
        return { status: 403, message: "access denied" };
      }),
    /403/,
  );
  assert.equal(calls, 1);
});
test("both missing versions provide an actionable message", async () => {
  await assert.rejects(
    () => fetchTranscript("1", async () => ({ status: 200, data: {} })),
    /官网确认/,
  );
});
test("blank before lines fall back to after, invalid times are rejected", () => {
  assert.equal(
    parseLines({
      data: {
        beforeAssemblyList: [{ res: " " }],
        afterAssemblyList: [{ bg: 0, ed: 3, res: "有内容" }],
      },
    })[0].res,
    "有内容",
  );
  assert.throws(
    () =>
      parseLines({
        data: { beforeAssemblyList: [{ bg: -1, ed: 3, res: "坏时间" }] },
      }),
    /时间/,
  );
  assert.throws(() => parseLines({ data: null }), EmptyTranscript);
  assert.equal(toSrt([]), "");
});
