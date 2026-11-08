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
interface Entry { task: DownloadTask; input: DownloadInput; controller?: AbortController }
export class DownloadManager {
  private entries: Entry[] = [];
  private listeners = new Set<() => void>();
  private running = 0;
  private closing = false;
  constructor(private fetcher: typeof fetch = fetch, private validateUrl = schoolVideoUrl, private concurrency = 2) {
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
    if (entry.task.state === 'queued') {entry.task.state='cancelled';this.emit();}
    else if (entry.task.state === 'running') entry.controller?.abort();
  }
  retry(id: string): void {
    if(this.closing)throw new Error('下载队列正在退出');
    const entry=this.find(id);
    if (!['failed','cancelled'].includes(entry.task.state)) throw new Error('仅失败或取消的任务可重试');
    if (this.entries.some(other=>other!==entry && other.input.key===entry.input.key && ['queued','running'].includes(other.task.state))) throw new Error('同一录像已有下载任务');
    entry.task.state='queued';entry.task.received=0;delete entry.task.total;delete entry.task.error;delete entry.task.bytesPerSecond;
    this.emit();void this.pump();
  }
  private find(id: string) { const entry=this.entries.find(e=>e.task.id===id);if(!entry)throw new Error('下载任务不存在');return entry; }
  async shutdown(): Promise<void> {
    this.closing=true;
    for(const entry of this.entries) this.cancel(entry.task.id);
    while(this.running) await new Promise(resolve=>setTimeout(resolve,10));
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
    const {task,input}=entry;
    const controller = new AbortController();entry.controller=controller;
    task.state='running';this.emit();
    const part=`${input.filePath}.${task.id}.part`;
    let file:Awaited<ReturnType<typeof open>>|undefined;
    let idleTimer:ReturnType<typeof setTimeout>|undefined;
    const armTimeout=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>controller.abort(new Error('下载连接超时')),30000);};
    try {
      armTimeout();
      // Avoid fetching a whole lecture only to discover a target-name conflict.
      try {await stat(input.filePath);throw Object.assign(new Error('exists'),{code:'EEXIST'});}
      catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const source=await new Promise<Awaited<ReturnType<DownloadInput['resolve']>>>((resolve,reject)=>{
        const abort=()=>reject(controller.signal.reason);
        if(controller.signal.aborted){abort();return;}
        controller.signal.addEventListener('abort',abort,{once:true});
        Promise.resolve().then(()=>input.resolve()).then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',abort));
      });
      if(controller.signal.aborted)throw controller.signal.reason;
      this.validateUrl(source.url);
      const response=await this.fetcher(source.url,{headers:source.headers,redirect:'error',signal:controller.signal});
      if(![200,206].includes(response.status)) throw new Error(`视频下载失败（HTTP ${response.status}）`);
      const contentType=response.headers.get('content-type')||'';
      if(/html|json|mpegurl/i.test(contentType))throw new Error('服务器未返回可直接下载的视频');
      const length=response.headers.get('content-length');
      if(length!==null && /^\d+$/.test(length)) task.total=Number(length);
      if(response.status===206) {
        const range=response.headers.get('content-range')?.match(/^bytes 0-(\d+)\/(\d+)$/);
        if(!range || Number(range[1])+1!==Number(range[2])) throw new Error('服务器只返回部分视频，拒绝保存为完整文件');
        if(task.total!==undefined && task.total!==Number(range[2]))throw new Error('视频长度与 Range 不一致');
        task.total=Number(range[2]);
      }
      if(!response.body)throw new Error('视频响应没有数据流');
      await mkdir(path.dirname(input.filePath),{recursive:true});
      file=await open(part,'wx');
      const reader=response.body.getReader();
      let lastNotice=0;
      let speedStart=Date.now(),speedBytes=0;
      while(true) {
        armTimeout();
        const {done,value}=await reader.read();
        if(done)break;
        if(controller.signal.aborted)throw controller.signal.reason;
        if(!task.received && /^\s*(?:<!doctype|<html|#EXTM3U|\{)/i.test(new TextDecoder().decode(value.subarray(0,128))))throw new Error('视频内容实际为登录页或播放清单');
        let offset=0;
        while(offset<value.length) {const result=await file.write(value,offset,value.length-offset);if(!result.bytesWritten)throw new Error('写入视频失败');offset+=result.bytesWritten;}
        task.received+=value.length;
        const now=Date.now();
        if(now-speedStart>=500){
          task.bytesPerSecond=(task.received-speedBytes)*1000/(now-speedStart);
          speedStart=now;speedBytes=task.received;
        }
        if(Date.now()-lastNotice>=200){this.emit();lastNotice=Date.now();}
      }
      if(controller.signal.aborted)throw controller.signal.reason;
      if(!task.received)throw new Error('视频为空');
      if(task.total!==undefined && task.received!==task.total)throw new Error('视频下载不完整，实际长度与声明不符');
      await file.sync();await file.close();file=undefined;
      // Atomic no-clobber publication. Existing target always stays intact.
      await link(part,input.filePath);
      await unlink(part);
      task.state='completed';
    } catch(error) {
      task.state=controller.signal.aborted && !controller.signal.reason?.message?.includes('超时')?'cancelled':'failed';
      task.error=task.state==='cancelled'?undefined:(error as NodeJS.ErrnoException)?.code==='EEXIST'?'目标文件已存在，请选择其他文件名':error instanceof Error && /^(?:视频|服务器|录像|下载)/.test(error.message)?error.message:'视频下载失败，请检查网络、权限和保存目录';
    } finally {
      clearTimeout(idleTimer);await file?.close().catch(()=>{});await unlink(part).catch(()=>{});delete entry.controller;task.bytesPerSecond=0;this.emit();
    }
  }
}
