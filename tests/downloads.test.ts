import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DownloadManager,schoolVideoUrl} from '../core/downloads.js';
import {VideoService} from '../core/service.js';
async function fixture(run:(directory:string)=>Promise<void>) {const directory=await mkdtemp(path.join(tmpdir(),'video-download-'));try{await run(directory);}finally{await rm(directory,{recursive:true,force:true});}}
async function done(manager:DownloadManager,id:string) {for(let n=0;n<200;n++){const task=manager.list().find(t=>t.id===id)!;if(!['queued','running'].includes(task.state))return task;await new Promise(r=>setTimeout(r,10));}throw new Error('download timed out');}
const source=async()=>({url:'https://mss2.sjtu.edu.cn/video.mp4'});
test('video download streams unknown size, deduplicates and publishes without part files',async()=>fixture(async dir=>{
  let calls=0;const manager=new DownloadManager(async()=>{calls++;return new Response(new Uint8Array([0,0,0,24,102,116,121,112]));});
  const input={key:'recording:1:0',title:'test',filePath:path.join(dir,'video.mp4'),resolve:source};
  const first=manager.enqueue(input);assert.equal(manager.enqueue(input).id,first.id);
  const task=await done(manager,first.id);assert.equal(task.state,'completed');assert.equal(task.total,undefined);assert.equal(task.received,8);assert.equal(calls,1);assert.equal((await readdir(dir)).length,1);
}));
test('existing target is never overwritten and failed task can retry with refreshed source',async()=>fixture(async dir=>{
  const output=path.join(dir,'video.mp4');await writeFile(output,'original');
  const manager=new DownloadManager(async()=>new Response('video bytes'));
  const task=manager.enqueue({key:'1',title:'test',filePath:output,resolve:source});
  assert.equal((await done(manager,task.id)).state,'failed');assert.equal(await readFile(output,'utf8'),'original');
  await rm(output);manager.retry(task.id);assert.equal((await done(manager,task.id)).state,'completed');
}));
test('HTML and incomplete range fail and clear partial files',async()=>fixture(async dir=>{
  for(const response of [new Response('<html>login</html>'),new Response('abcd',{status:206,headers:{'Content-Range':'bytes 0-3/100'}}),new Response('abcd',{headers:{'Content-Length':'100'}})]) {
    const manager=new DownloadManager(async()=>response);const task=manager.enqueue({key:'1',title:'test',filePath:path.join(dir,'video.mp4'),resolve:source});
    assert.equal((await done(manager,task.id)).state,'failed');assert.deepEqual(await readdir(dir),[]);
  }
}));
test('cancellation clears file and starts next queued task',async()=>fixture(async dir=>{
 let calls=0;const manager=new DownloadManager(async(_url,init)=>{
   if(++calls===1)return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([0,1,2]));init?.signal?.addEventListener('abort',()=>controller.error(new Error('aborted')));}}));
   return new Response('video');
 });
 const a=manager.enqueue({key:'a',title:'a',filePath:path.join(dir,'a.mp4'),resolve:source});
 const b=manager.enqueue({key:'b',title:'b',filePath:path.join(dir,'b.mp4'),resolve:source});
 await new Promise(r=>setTimeout(r,20));manager.cancel(a.id);
 assert.equal((await done(manager,a.id)).state,'cancelled');assert.equal((await done(manager,b.id)).state,'completed');assert.deepEqual(await readdir(dir),['b.mp4']);
}));
test('school URLs and API tracks validated without sending secrets to task snapshots',async()=>{
 assert.throws(()=>schoolVideoUrl('https://evil.example/video.mp4'),/学校/);assert.throws(()=>schoolVideoUrl('http://mss2.sjtu.edu.cn/video.mp4'),/HTTPS/);assert.throws(()=>schoolVideoUrl('https://mss2.sjtu.edu.cn/a.m3u8'),/HLS/);
 const service=new VideoService(async(url)=>{assert.ok(String(url).includes('courseId=100'));return Response.json({status:200,data:{id:100,courName:'真实接口样例',courseVodViewList:[{viewNum:2,playUrl:'https://mss2.sjtu.edu.cn/video.mp4?signature=secret'}]}});});service.connect('header.payload.signature');
 const tracks=await service.tracks('100');assert.equal(tracks[0].view,2);assert.equal(tracks[0].index,0);
});

test('real HTTP streaming handles unknown length, complete 206, dropped connection, and shutdown',async()=>fixture(async dir=>{
 const {createServer}=await import('node:http');
 const server=createServer((request,response)=>{
   if(request.url==='/partial'){response.writeHead(206,{'Content-Type':'video/mp4','Content-Range':'bytes 0-7/8','Content-Length':'8'});response.end('12345678');}
   else if(request.url==='/drop'){response.writeHead(200,{'Content-Type':'video/mp4','Content-Length':'100'});response.write('1234');setTimeout(()=>response.destroy(),10);}
   else if(request.url==='/slow'){response.writeHead(200,{'Content-Type':'video/mp4'});response.write('1234');const timer=setInterval(()=>response.write('5678'),20);response.on('close',()=>clearInterval(timer));}
   else{response.writeHead(200,{'Content-Type':'video/mp4'});response.write('1234');setTimeout(()=>response.end('5678'),5);}
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address || typeof address==='string')throw new Error('no server');
 const base=`http://127.0.0.1:${address.port}`;
 const manager=new DownloadManager(fetch,()=>{});
 try {
  for(const endpoint of ['/unknown','/partial','/drop']) {
    const task=manager.enqueue({key:endpoint,title:endpoint,filePath:path.join(dir,endpoint.slice(1)+'.mp4'),resolve:async()=>({url:base+endpoint})});
    assert.equal((await done(manager,task.id)).state,endpoint==='/drop'?'failed':'completed');
  }
  const slow=manager.enqueue({key:'slow',title:'slow',filePath:path.join(dir,'slow.mp4'),resolve:async()=>({url:base+'/slow'})});
  await new Promise(resolve=>setTimeout(resolve,40));await manager.shutdown();assert.equal((await done(manager,slow.id)).state,'cancelled');
  assert.deepEqual((await readdir(dir)).sort(),['partial.mp4','unknown.mp4']);
 } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
test('shutdown interrupts pending resolver without hanging queue cleanup',async()=>fixture(async dir=>{
 const manager=new DownloadManager();
 const task=manager.enqueue({key:'pending',title:'pending',filePath:path.join(dir,'pending.mp4'),resolve:()=>new Promise(()=>{})});
 await new Promise(resolve=>setTimeout(resolve,10));await manager.shutdown();assert.equal((await done(manager,task.id)).state,'cancelled');
}));
