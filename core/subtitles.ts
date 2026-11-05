import type { Line, Transcript } from "../shared/contracts.js";
export class EmptyTranscript extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("接口响应格式异常");
  return value as Record<string, unknown>;
}
export function apiData(input: unknown): Record<string, unknown> | null {
  const value = object(input);
  if (Number(value.status) === 10013)
    throw new Error("录像平台拒绝 JWT（10013）：请使用录像空间凭据，Canvas Token 不能用于此接口。");
  if (!value || typeof value !== "object") throw new Error("接口响应不是对象");
  if (value.status !== undefined && Number(value.status) !== 200)
    throw new Error(
      `服务错误 ${value.status}: ${String(value.message || value.msg || "请求失败")}`,
    );
  const data = value.data ?? value.result;
  return data == null ? null : object(data);
}
export function parseLines(value: unknown): Line[] {
  const data = apiData(value);
  if (!data) throw new EmptyTranscript("无字幕数据");
  for (const name of ["beforeAssemblyList", "afterAssemblyList"]) {
    if (data[name] != null && !Array.isArray(data[name]))
      throw new Error("字幕格式变化：列表格式异常");
    const rows = ((data[name] ?? []) as unknown[])
      .map(object)
      .filter((r) => typeof r.res === "string" && r.res.trim());
    if (rows.length)
      return rows
        .map((r) => {
          if (
            typeof r.bg !== "number" ||
            typeof r.ed !== "number" ||
            !Number.isFinite(r.bg) ||
            !Number.isFinite(r.ed) ||
            r.bg < 0 ||
            r.ed < r.bg
          )
            throw new Error("字幕时间格式异常");
          return { bg: r.bg, ed: r.ed, res: String(r.res).trim() };
        })
        .sort((a: Line, b: Line) => a.bg - b.bg);
  }
  throw new EmptyTranscript("无字幕文本");
}
function stamp(ms: number): string {
  const n = Math.floor(ms);
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
}
export function toSrt(lines: Line[]): string {
  return lines
    .map((r, i) => `${i + 1}\n${stamp(r.bg)} --> ${stamp(r.ed)}\n${r.res}\n`)
    .join("\n");
}
export async function fetchTranscript(
  id: string,
  request: (original: boolean) => Promise<unknown>,
): Promise<Transcript> {
  for (const original of [true, false]) {
    try {
      const lines = parseLines(await request(original));
      return {
        courseId: id,
        version: original ? "original" : "optimized",
        lines,
        srt: toSrt(lines),
      };
    } catch (e) {
      if (!(e instanceof EmptyTranscript)) throw e;
    }
  }
  throw new EmptyTranscript(
    `课程 ${id} 原始和优化字幕均为空，请在官网确认是否已生成或有访问权限`,
  );
}
