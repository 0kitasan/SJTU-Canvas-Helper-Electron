import type { CanvasCourse } from "../shared/canvas-contracts.js";

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const finiteDate = (value?: string): number | undefined => {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : undefined;
};

export function normalizeCourse(row: Record<string, unknown>): CanvasCourse {
  if (!/^\d+$/.test(String(row.id ?? ""))) throw new Error("Canvas 课程缺少有效编号");
  const id = String(row.id);
  const term = row.term && typeof row.term === "object" && !Array.isArray(row.term)
    ? row.term as Record<string, unknown> : {};
  const courseCode = text(row.course_code);
  const name = text(row.name) || text(row.original_name) || courseCode;
  const accessRestricted = row.access_restricted_by_date === true;
  const result: CanvasCourse = {
    id,
    title: name || `课程 ${id}（${accessRestricted ? "访问受限，" : ""}名称未返回）`,
    term: text(term.name),
  };
  if (courseCode) result.courseCode = courseCode;
  if (!name) result.nameMissing = true;
  if (accessRestricted) result.accessRestricted = true;
  if (typeof term.id === "number" && Number.isFinite(term.id)) result.termId = term.id;
  if (text(term.start_at)) result.termStartAt = text(term.start_at);
  if (text(term.end_at)) result.termEndAt = text(term.end_at);
  return result;
}

// Named academic years use their second year for spring/summer, e.g. 2025-2026 Spring.
function inferredStart(name: string): number | undefined {
  const match = name.match(/(20\d{2})(?:\s*[-–—/]\s*(20\d{2}))?/);
  if (!match) return undefined;
  const season = /秋|fall|autumn|第一学期/i.test(name) ? 9
    : /春|spring|第二学期/i.test(name) ? 2
      : /夏|summer|第三学期/i.test(name) ? 7
        : /冬|winter/i.test(name) ? 1
          : /20\d{2}\s*[-/]\s*20\d{2}\s*[-/]\s*1$/.test(name) ? 9
            : /20\d{2}\s*[-/]\s*20\d{2}\s*[-/]\s*2$/.test(name) ? 2
              : /20\d{2}\s*[-/]\s*20\d{2}\s*[-/]\s*3$/.test(name) ? 7 : undefined;
  if (!season) return undefined;
  const year = Number(season < 9 && match[2] ? match[2] : match[1]);
  return Date.UTC(year, season - 1, 1);
}

export function sortCourses(courses: CanvasCourse[], now = Date.now()): CanvasCourse[] {
  function key(course: CanvasCourse) {
    const explicitStart = finiteDate(course.termStartAt);
    const start = explicitStart ?? inferredStart(course.term || "");
    const end = finiteDate(course.termEndAt);
    // Infer the next semester boundary only for term names, not incomplete API dates.
    const inferredEnd = explicitStart === undefined && start !== undefined
      ? Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() === 8 ? 13 : new Date(start).getUTCMonth() === 1 ? 6 : new Date(start).getUTCMonth() === 0 ? 1 : 8, 1)
      : undefined;
    const current = start !== undefined && start <= now && (end ?? inferredEnd) !== undefined && now < (end ?? inferredEnd)!;
    return { start, current, future: start !== undefined && start > now };
  }
  return [...courses].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka.current !== kb.current) return ka.current ? -1 : 1;
    if ((ka.start !== undefined) !== (kb.start !== undefined)) return ka.start !== undefined ? -1 : 1;
    if (ka.start !== undefined && kb.start !== undefined) {
      if (ka.future !== kb.future) return ka.future ? 1 : -1;
      if (ka.start !== kb.start) return ka.future ? ka.start - kb.start : kb.start - ka.start;
    }
    if (a.termId !== b.termId) return (b.termId ?? -1) - (a.termId ?? -1);
    if (Boolean(a.term) !== Boolean(b.term)) return a.term ? -1 : 1;
    return (a.term || "").localeCompare(b.term || "", "zh-CN") || a.title.localeCompare(b.title, "zh-CN", { numeric: true }) || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}
