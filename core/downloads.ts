import { randomUUID } from 'node:crypto';
import { open, link, unlink, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { DownloadTask } from '../shared/downloads.js';

export function schoolVideoUrl(value: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password ||
      !(url.hostname === 'sjtu.edu.cn' || url.hostname.endsWith('.sjtu.edu.cn')))
    throw new Error('录像下载地址不是学校 HTTPS 地址');
  if (/\.m3u8$/i.test(url.pathname)) throw new Error('此机位仅提供 HLS，当前直接下载不支持分段合并');
}
export interface DownloadInput {
  key: string; title: string; filePath: string;
  resolve(): Promise<{url: string; headers?: Record<string,string>}>;
}
interface Entry { task: DownloadTask; input: DownloadInput; controller?: AbortController; validator?: string; total?: number; cleanup?: Promise<void> }
export interface DownloadOptions { idleTimeoutMs?:number; maxRetries?:number; retryDelayMs?:number }
class Retryable extends Error {}
export class DownloadManager {
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private running = 0;
  private closing = false;
  constructor(private fetcher: typeof fetch = fetch, private validateUrl = schoolVideoUrl, private concurrency = 2, private options:DownloadOptions = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) throw new Error('下载并发数必须为1或2');
  }
  list(): DownloadTask[] { return this.entries.map(({task}) => ({...task})); }
  onChange(listener: () => void): () => void { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; }
  private emit() { for (const listener of this.listeners) { try {listener();} catch { /* Subscriber cannot stop downloads. */ } } }
  enqueue(input: DownloadInput): DownloadTask {
    if(this.closing)throw new Error('下载队列正在退出');
    const existing = this.entries.find(entry => entry.input.key === input.key && ['queued','running'].includes(entry.task.state));
    if (existing) return {...existing.task};
    const entry: Entry = {input,task:{id:randomUUID(),key:input.key,title:input.title,filePath:input.filePath,state:'queued',received:0}};
    this.entries.push(entry); this.emit(); void this.pump(); return {...entry.task};
  }
  cancel(id: string): void {
    const entry = this.find(id);
    if (entry.task.state === 'running') entry.controller?.abort();
    else if (entry.task.state === 'queued' || entry.task.partialRetained) {
      const hadPartial=entry.task.partialRetained;
      entry.task.state='cancelled';entry.task.stage='已取消';entry.task.partialRetained=false;entry.task.received=0;entry.task.bytesPerSecond=0;delete entry.task.error;delete entry.task.total;
      delete entry.validator;delete entry.total;
      if(hadPartial)entry.cleanup=unlink(`${entry.input.filePath}.${entry.task.id}.part`).catch(()=>{});
      this.emit();
    }
  }
  retry(id: string): void {
    if(this.closing)throw new Error('下载队列正在退出');
    const entry=this.find(id);
    if (!['failed','cancelled'].includes(entry.task.state)) throw new Error('仅失败或取消的任务可重试');
    if (this.entries.some(other=>other!==entry && other.input.key===entry.input.key && ['queued','running'].includes(other.task.state))) throw new Error('同一录像已有下载任务');
    entry.task.state='queued';if(!entry.task.partialRetained){entry.task.received=0;delete entry.task.total;}delete entry.task.error;entry.task.retryCount=0;
    this.emit();void this.pump();
  }
  private find(id: string) { const entry=this.entries.find(e=>e.task.id===id);if(!entry)throw new Error('下载任务不存在');return entry; }
  async shutdown(): Promise<void> {
    this.closing=true;
    for(const entry of this.entries) this.cancel(entry.task.id);
    while(this.running) await new Promise(resolve=>setTimeout(resolve,10));
    await Promise.all(this.entries.map(entry=>entry.cleanup));
  }
  private pump() {
    if(this.closing)return;
    while(this.running<this.concurrency) {
      const entry=this.entries.find(e=>e.task.state==='queued');
      if(!entry)break;
      this.running++;
      void this.download(entry).finally(()=>{this.running--;this.pump();});
    }
  }
  private async download(entry:Entry) {
    const {task,input}=entry, root=new AbortController();entry.controller=root;
    const part=`${input.filePath}.${task.id}.part`;
    let file:Awaited<ReturnType<typeof open>>|undefined, retain=false;
    let previous=task.received, previousTime=Date.now();
    const ticker=setInterval(()=>{const now=Date.now();task.bytesPerSecond=Math.max(0,task.received-previous)*1000/(now-previousTime);previous=task.received;previousTime=now;this.emit();},1000);
    const reset=async()=>{await file!.truncate(0);task.received=0;delete task.total;delete entry.validator;delete entry.total;previous=0;previousTime=Date.now();};
    task.state='running';task.stage='正在连接';task.partialRetained=false;this.emit();
    try {
      await entry.cleanup;
      try{await stat(input.filePath);throw Object.assign(new Error('exists'),{code:'EEXIST'});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      await mkdir(path.dirname(part),{recursive:true});
      file=await open(part,task.received&&entry.validator?'r+':'wx');
      if((await file.stat()).size!==task.received)throw new Error('下载断点文件长度变化');
      for(let attempt=0;;attempt++){
        const controller=new AbortController();const abort=()=>controller.abort(root.signal.reason);
        root.signal.addEventListener('abort',abort,{once:true});
        let timer:ReturnType<typeof setTimeout>|undefined, reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
        const arm=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new Retryable('下载连接超时')),this.options.idleTimeoutMs??30000);};
        const wait=<T>(promise:Promise<T>)=>new Promise<T>((resolve,reject)=>{
          const cancel=()=>reject(controller.signal.reason);if(controller.signal.aborted){cancel();return;}
          controller.signal.addEventListener('abort',cancel,{once:true});promise.then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',cancel));
        });
        try{
          if(root.signal.aborted)throw root.signal.reason;arm();
          const source=await wait(Promise.resolve().then(()=>input.resolve()));this.validateUrl(source.url);
          const headers=new Headers(source.headers), offset=task.received;
          if(offset&&entry.validator){headers.set('Range',`bytes=${offset}-`);headers.set('If-Range',entry.validator);}
          let response:Response;
          try{response=await wait(this.fetcher(source.url,{headers,redirect:'error',signal:controller.signal}));}catch{throw new Retryable('视频网络连接中断');}
          const discard=async()=>{await response.body?.cancel().catch(()=>{});};
          if(response.status===416 && offset){await discard();await reset();throw new Retryable('视频Range失效，重新下载');}
          if(![200,206].includes(response.status)){
            await discard();if([401,403,408,429,500,502,503,504].includes(response.status))throw new Retryable(`视频服务暂不可用（HTTP ${response.status}）`);
            throw new Error(`视频下载失败（HTTP ${response.status}）`);
          }
          if(/html|json|mpegurl/i.test(response.headers.get('content-type')||'')){await discard();throw new Error('服务器未返回可直接下载的视频');}
          const etag=response.headers.get('etag'),modified=response.headers.get('last-modified');
          const validator=etag&&!/^W\//i.test(etag)?etag:modified&&Number.isFinite(Date.parse(modified))?modified:undefined;
          const length=response.headers.get('content-length');let total=length!==null&&/^\d+$/.test(length)?Number(length):undefined;
          if(response.status===206){
            const range=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
            if(!range||!range.slice(1).every(n=>Number.isSafeInteger(Number(n)))||Number(range[1])!==offset||Number(range[2])+1!==Number(range[3])||Number(range[2])<Number(range[1])||(total!==undefined&&total!==Number(range[2])-Number(range[1])+1)){
              await discard();throw new Error('服务器返回错误或不完整Range，拒绝拼接');
            }
            total=Number(range[3]);
            if(offset&&(validator!==entry.validator||total!==entry.total)){await discard();await reset();throw new Retryable('视频资源已变化，重新下载');}
          }else if(offset){await reset();}
          if(!response.body)throw new Error('视频响应没有数据流');
          task.total=total;entry.total=total;entry.validator=validator;task.stage=task.received?'正在续传':'正在下载';this.emit();reader=response.body.getReader();
          while(true){
            arm();let chunk:ReadableStreamReadResult<Uint8Array>;
            try{chunk=await wait(reader.read());}catch{throw new Retryable('视频数据流中断或超时');}
            clearTimeout(timer);if(chunk.done)break;if(root.signal.aborted)throw root.signal.reason;
            const value=chunk.value;
            if(!task.received&&/^\s*(?:<!doctype|<html|#EXTM3U|\{)/i.test(new TextDecoder().decode(value.subarray(0,128))))throw new Error('视频内容实际为登录页或播放清单');
            if(total!==undefined&&task.received+value.length>total)throw new Error('视频长度超出声明');
            let pos=0;while(pos<value.length){const written=await file!.write(value,pos,value.length-pos,task.received+pos);if(!written.bytesWritten)throw new Error('写入视频失败');pos+=written.bytesWritten;}task.received+=value.length;
          }
          if(root.signal.aborted)throw root.signal.reason;
          if(!task.received)throw new Error('视频为空');
          if(total!==undefined&&task.received!==total)throw new Retryable('视频流提前结束');
          await file!.sync();if(root.signal.aborted)throw root.signal.reason;await file!.close();file=undefined;await link(part,input.filePath);await unlink(part);task.state='completed';task.stage='已完成';retain=false;break;
        }catch(error){
          if(root.signal.aborted)throw error;
          if(!(error instanceof Retryable)&&!(controller.signal.reason instanceof Retryable))throw error;
          retain=Boolean(task.received&&entry.validator&&entry.total);
          if(attempt>=(this.options.maxRetries??3))throw error;
          if(!retain)await reset();task.retryCount=attempt+1;task.stage=`连接中断，等待第${attempt+1}次重连`;task.bytesPerSecond=0;this.emit();
          clearTimeout(timer);controller.abort();await reader?.cancel().catch(()=>{});reader=undefined;
          await new Promise<void>((resolve,reject)=>{const cancel=()=>{clearTimeout(delay);reject(root.signal.reason);};const delay=setTimeout(()=>{root.signal.removeEventListener('abort',cancel);resolve();},Math.min((this.options.retryDelayMs??1000)*2**attempt,8000));root.signal.addEventListener('abort',cancel,{once:true});if(root.signal.aborted)cancel();});
        }finally{clearTimeout(timer);root.signal.removeEventListener('abort',abort);controller.abort();await reader?.cancel().catch(()=>{});}
      }
    }catch(error){
      const nextState=root.signal.aborted?'cancelled':'failed';retain=retain&&error instanceof Retryable&&nextState==='failed'&&Boolean(task.received&&entry.validator&&entry.total);
      task.partialRetained=retain;task.stage=nextState==='cancelled'?'已取消':retain?'中断，已保留断点':'下载失败';
      task.error=nextState==='cancelled'?undefined:(error as NodeJS.ErrnoException)?.code==='EEXIST'?'目标文件已存在，请选择其他文件名':error instanceof Error&&/^(?:视频|服务器|录像|下载|写入)/.test(error.message)?error.message:'视频下载失败，请检查网络、权限和保存目录';
    }finally{
      clearInterval(ticker);await file?.close().catch(()=>{});
      if(!retain||root.signal.aborted){await unlink(part).catch(()=>{});task.partialRetained=false;if(task.state!=='completed'){task.received=0;delete entry.validator;delete entry.total;}}
      if(task.state==='running')task.state=root.signal.aborted?'cancelled':'failed';
      delete entry.controller;task.bytesPerSecond=0;this.emit();
    }
  }
}
