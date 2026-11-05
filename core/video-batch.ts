import path from 'node:path';
import type { VideoSelection, DownloadBatchResult, VideoTrack, DownloadTask } from '../shared/downloads.js';
import type { DownloadInput } from './downloads.js';

interface BatchDependencies {
  chooseDirectory(): Promise<string | undefined>;
  tracks(id: string): Promise<VideoTrack[]>;
  revision(): number;
  enqueue(input: DownloadInput): DownloadTask;
}
function folderName(value: string, fallback: string): string {
  const clean = value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,70).replace(/[. ]+$/g,'');
  const name = clean && clean !== '.' && clean !== '..' ? clean : fallback;
  return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
}
export function videoOutputPath(directory: string, row: VideoSelection, index: number): string {
  const course = folderName(row.courseTitle || '未分类课程','未分类课程') + (row.courseId ? `_${row.courseId}` : '');
  const started = recordingDayTime(row.startTime ?? row.title);
  const name = started ? `${started.time}_录像${row.id}` : `${folderName(row.title,'课堂录像')}_录像${row.id}`;
  return path.join(directory, course, started?.day || '日期未知', `${name}_机位${index + 1}.mp4`);
}
// School wall-clock timestamps use Asia/Shanghai even on machines in other zones.
export function recordingDayTime(value: string): {day:string;time:string} | undefined {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return;
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(milliseconds);
    const get = (key:string) => parts.find(part=>part.type===key)!.value;
    return {day:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}_${get('minute')}_${get('second')}`};
  }
  const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return;
  const [year,month,day,hour,minute,second] = match.slice(1).map(part=>Number(part || 0));
  const check = new Date(Date.UTC(year,month-1,day));
  if (year<1970 || check.getUTCFullYear()!==year || check.getUTCMonth()!==month-1 || check.getUTCDate()!==day || hour>23 || minute>59 || second>59) return;
  const pad=(n:number)=>String(n).padStart(2,'0');
  return {day:`${year}-${pad(month)}-${pad(day)}`,time:`${pad(hour)}_${pad(minute)}_${pad(second)}`};
}
export async function enqueueVideoBatch(selections: VideoSelection[], deps: BatchDependencies): Promise<DownloadBatchResult> {
  if (!Array.isArray(selections) || !selections.length || selections.length > 1000)
    throw new Error('请选择1至1000个课节');
  const unique = new Map<string, VideoSelection>();
  for (const row of selections) {
    if (!row || typeof row.id !== 'string' || !/^\d+$/.test(row.id) || typeof row.title !== 'string') throw new Error('课节参数无效');
    if ((row.courseId !== undefined && (typeof row.courseId !== 'string' || !/^\d+$/.test(row.courseId))) ||
        (row.courseTitle !== undefined && typeof row.courseTitle !== 'string') ||
        (row.startTime !== undefined && typeof row.startTime !== 'string')) throw new Error('课程参数无效');
    unique.set(row.id,row);
  }
  const revision = deps.revision();
  const directory = await deps.chooseDirectory();
  const result: DownloadBatchResult = { tasks: [], errors: [], cancelled: !directory };
  if (!directory) return result;
  if (revision !== deps.revision()) throw new Error('录像账号已变化，请重新选择下载');
  for (const row of unique.values()) {
    try {
      const tracks = await deps.tracks(row.id);
      if (revision !== deps.revision()) throw new Error('录像账号已变化，请重新选择下载');
      if (!tracks.length) throw new Error('录像接口没有返回可下载机位');
      const name = row.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,100) || '课堂录像';
      for (const track of tracks) {
        result.tasks.push(deps.enqueue({ key:`${revision}:${row.id}:${track.index}`, title:`${name} · ${track.title}`,
          filePath: videoOutputPath(directory,row,track.index),
          resolve: async () => {
            if (revision !== deps.revision()) throw new Error('录像账号已变化，请重新添加下载');
            const current = (await deps.tracks(row.id)).find(t => t.index === track.index);
            if (revision !== deps.revision()) throw new Error('录像账号已变化，请重新添加下载');
            if (!current) throw new Error('机位已不可用');
            return {url:current.url,headers:{Referer:'https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/'}};
          }
        }));
      }
    } catch (error) {
      result.errors.push({id:row.id,message:error instanceof Error && /^(?:录像|机位|演示)/.test(error.message) ? error.message : '读取该课节机位失败，请检查连接后重试'});
    }
  }
  return result;
}
