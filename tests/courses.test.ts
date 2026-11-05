import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCourse, sortCourses } from "../core/courses.js";
import { CanvasApi } from "../core/canvas.js";

test("course normalization uses trimmed real names or a clear identifiable missing-name state", () => {
  assert.equal(normalizeCourse({id:1, name:" ", course_code:" CS101 "}).title,"CS101");
  assert.equal(normalizeCourse({id:2, original_name:" 结构力学 "}).title,"结构力学");
  const restricted = normalizeCourse({id:3,access_restricted_by_date:true});
  assert.equal(restricted.title,"课程 3（访问受限，名称未返回）");
  assert.equal(restricted.nameMissing,true);
  assert.equal(restricted.accessRestricted,true);
  assert.equal(normalizeCourse({id:4}).title,"课程 4（名称未返回）");
  assert.throws(() => normalizeCourse({name:"no ID"}), /有效编号/);
});

test("current academic term comes first, then past terms newest first, future and unknown last", () => {
  const rows = [
    {id:"1",title:"Old",term:"2025-2026 Spring"},
    {id:"2",title:"Current",term:"2026-2027 秋季学期"},
    {id:"3",title:"Unknown",term:""},
    {id:"4",title:"Summer",term:"2025-2026 夏"},
    {id:"5",title:"Future",term:"2026-2027 Spring"},
    {id:"6",title:"Older",term:"2025-2026 秋"},
  ];
  assert.deepEqual(sortCourses(rows,Date.parse("2026-10-29T00:00:00Z")).map(c => c.id),["2","4","1","6","5","3"]);
});

test("explicit API term dates take priority over term name inference; term IDs are fallback", () => {
  const rows = [
    {id:"1",title:"Current",term:"Other",termId:5,termStartAt:"2026-09-01",termEndAt:"2027-02-01"},
    {id:"2",title:"Old",term:"2027秋",termId:10,termStartAt:"2025-09-01",termEndAt:"2026-02-01"},
    {id:"3",title:"By ID",term:"Other",termId:15},
    {id:"4",title:"By ID",term:"Other",termId:2},
  ];
  assert.deepEqual(sortCourses(rows,Date.parse("2026-10-29")).map(c => c.id),["1","2","3","4"]);
});

test("numeric academic term names follow Chinese university semester order", () => {
  const courses = ["2025-2026-1", "2026-2027-2", "2026-2027-1", "2025-2026-2"].map((term, n) => ({id:String(n),title:term,term}));
  assert.deepEqual(sortCourses(courses,Date.parse("2026-10-29")).map(c=>c.term),["2026-2027-1","2025-2026-2","2025-2026-1","2026-2027-2"]);
});

test("repeated partial courses receive missing names from later pages without losing metadata", async () => {
  let page=0;
  const api = new CanvasApi("https://oc.sjtu.edu.cn", async () => {
    page++;
    return Response.json(page === 1 ? [{id:1,term:{name:"2026秋",id:5}}] : [{id:1,name:"Recovered"},{id:2,name:"Another"}], {
      headers: page === 1 ? {link:'<https://oc.sjtu.edu.cn/api/v1/courses?page=2>; rel="next"'} : {},
    });
  });
  const courses = await api.courses();
  assert.equal(courses[0].title,"Recovered");
  assert.equal(courses[0].termId,5);
  assert.equal(courses.length,2);
});
