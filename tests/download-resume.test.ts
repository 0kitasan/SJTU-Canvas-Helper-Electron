import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DownloadManager} from '../core/downloads.js';
const data=Buffer.alloc(65536,7);
test('speed ticker drops to zero during a silent stream without waiting for another chunk',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'resume-speed-'));
 const manager=new DownloadManager(async(_url,init)=>new Response(new ReadableStream({start(controller){
  controller.enqueue(data);init?.signal?.addEventListener('abort',()=>controller.error(new Error('aborted')),{once:true});
 }})),()=>{},1,{idleTimeoutMs:5000,maxRetries:0});
 try {
  const task=manager.enqueue({key:'speed',title:'speed',filePath:path.join(dir,'video.mp4'),resolve:async()=>({url:'https://live.sjtu.edu.cn/fixture.mp4'})});
  await new Promise(r=>setTimeout(r,1200));
  assert.ok((manager.list()[0].bytesPerSecond||0)>0);
  await new Promise(r=>setTimeout(r,1100));
  assert.equal(manager.list()[0].bytesPerSecond,0);assert.equal(manager.list()[0].state,'running');
  manager.cancel(task.id);await manager.shutdown();
 }finally{await manager.shutdown();await rm(dir,{recursive:true,force:true});}
});
async function fixture(handler:(req:IncomingMessage,res:ServerResponse)=>void,run:(manager:DownloadManager,file:string)=>Promise<void>,maxRetries=3){
 const dir=await mkdtemp(path.join(tmpdir(),'resume-test-'));
 const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const address=server.address() as {port:number};
 const manager=new DownloadManager(fetch,()=>{},1,{idleTimeoutMs:1200,maxRetries,retryDelayMs:10});
 const file=path.join(dir,'video.mp4');
 (manager as DownloadManager & {testUrl:string}).testUrl=`http://127.0.0.1:${address.port}/video`;
 try{await run(manager,file);}finally{await manager.shutdown();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
}
function add(m:DownloadManager,file:string){return m.enqueue({key:'test',title:'test',filePath:file,resolve:async()=>({url:(m as DownloadManager & {testUrl:string}).testUrl})});}
async function done(m:DownloadManager,id:string){for(let n=0;n<600;n++){const t=m.list().find(t=>t.id===id)!;if(!['queued','running'].includes(t.state))return t;await new Promise(r=>setTimeout(r,10));}throw new Error('wait timed out');}
test('real dropped HTTP stream resumes from byte offset with If-Range and exact file content',async()=>{
 let calls=0;
 await fixture((req,res)=>{
  calls++;const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0);
  res.writeHead(start?206:200,{'Content-Length':data.length-start,ETag:'"version-1"',...(start?{'Content-Range':`bytes ${start}-${data.length-1}/${data.length}`}:{})});
  if(calls===1){res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);}
  else{assert.equal(start,8192);assert.equal(req.headers['if-range'],'"version-1"');res.end(data.subarray(start));}
 },async(m,file)=>{const t=add(m,file);assert.equal((await done(m,t.id)).state,'completed');assert.deepEqual(await readFile(file),data);assert.equal(calls,2);});
});
test('server ignoring Range returns 200 and safely replaces partial content',async()=>{
 let calls=0;const newer=Buffer.alloc(data.length,9);
 await fixture((_req,res)=>{calls++;res.writeHead(200,{'Content-Length':data.length,ETag:calls===1?'"old"':'"new"'});if(calls===1){res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);}else res.end(newer);},async(m,file)=>{assert.equal((await done(m,add(m,file).id)).state,'completed');assert.deepEqual(await readFile(file),newer);});
});
test('unverifiable stream is restarted without Range, not spliced',async()=>{
 let calls=0;
 await fixture((req,res)=>{calls++;assert.equal(req.headers.range,undefined);res.writeHead(200,{'Content-Length':data.length});if(calls===1){res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);}else res.end(data);},async(m,file)=>{assert.equal((await done(m,add(m,file).id)).state,'completed');assert.deepEqual(await readFile(file),data);});
});
test('failed resumable task retains part for manual retry; shutdown cleans retained files',async()=>{
 let fail=true;
 await fixture((req,res)=>{const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0);res.writeHead(start?206:200,{'Content-Length':data.length-start,ETag:'"same"',...(start?{'Content-Range':`bytes ${start}-${data.length-1}/${data.length}`}:{})});if(fail){res.write(data.subarray(start,start+8192));setTimeout(()=>res.destroy(),30);}else res.end(data.subarray(start));},async(m,file)=>{const t=add(m,file);const failed=await done(m,t.id);assert.equal(failed.partialRetained,true);assert.equal(failed.received,8192);fail=false;m.retry(t.id);assert.equal((await done(m,t.id)).state,'completed');assert.deepEqual(await readFile(file),data);},0);
});
test('wrong resume range is rejected and never published',async()=>{
 let calls=0;
 await fixture((_req,res)=>{calls++;if(calls===1){res.writeHead(200,{'Content-Length':data.length,ETag:'"same"'});res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);}else{res.writeHead(206,{'Content-Length':data.length,ETag:'"same"','Content-Range':`bytes 0-${data.length-1}/${data.length}`});res.end(data);}},async(m,file)=>{const t=await done(m,add(m,file).id);assert.equal(t.state,'failed');assert.deepEqual(await readdir(path.dirname(file)),[]);});
});
test('changed ETag in 206 restarts from zero instead of mixing versions',async()=>{
 let calls=0;const newer=Buffer.alloc(data.length,8);
 await fixture((req,res)=>{
  calls++;const start=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0);
  if(calls===1){res.writeHead(200,{'Content-Length':data.length,ETag:'"old"'});res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);}
  else if(calls===2){assert.equal(start,8192);res.writeHead(206,{'Content-Length':data.length-start,ETag:'"new"','Content-Range':`bytes ${start}-${data.length-1}/${data.length}`});res.end(newer.subarray(start));}
  else{assert.equal(start,0);res.writeHead(200,{'Content-Length':data.length,ETag:'"new"'});res.end(newer);}
 },async(m,file)=>{assert.equal((await done(m,add(m,file).id)).state,'completed');assert.deepEqual(await readFile(file),newer);assert.equal(calls,3);});
});
test('cancellation during reconnect backoff cleans part and makes no extra request',async()=>{
 let calls=0;
 await fixture((_req,res)=>{calls++;res.writeHead(200,{'Content-Length':data.length,ETag:'"same"'});res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);},async(m,file)=>{
  const t=add(m,file);
  await new Promise<void>(resolve=>{const off=m.onChange(()=>{if(m.list()[0]?.retryCount){off();m.cancel(t.id);resolve();}});});
  assert.equal((await done(m,t.id)).state,'cancelled');assert.equal(calls,1);assert.deepEqual(await readdir(path.dirname(file)),[]);
 });
});
test('shutdown clears a failed retained partial file',async()=>{
 await fixture((_req,res)=>{res.writeHead(200,{'Content-Length':data.length,ETag:'"same"'});res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);},async(m,file)=>{
  const t=await done(m,add(m,file).id);assert.equal(t.partialRetained,true);
  await m.shutdown();assert.deepEqual(await readdir(path.dirname(file)),[]);
 },0);
});
test('cancelling a retained retry while queued removes its part and clears old error',async()=>{
 await fixture((req,res)=>{
  if(req.url==='/block')return;
  res.writeHead(200,{'Content-Length':data.length,ETag:'"same"'});res.write(data.subarray(0,8192));setTimeout(()=>res.destroy(),30);
 },async(m,file)=>{
  const t=await done(m,add(m,file).id);assert.equal(t.partialRetained,true);
  const base=(m as DownloadManager & {testUrl:string}).testUrl;
  m.enqueue({key:'block',title:'block',filePath:file+'.block',resolve:async()=>({url:base.replace('/video','/block')})});
  m.retry(t.id);assert.equal(m.list().find(task=>task.id===t.id)?.state,'queued');m.cancel(t.id);
  await m.shutdown();const cancelled=m.list().find(task=>task.id===t.id)!;
  assert.equal(cancelled.stage,'已取消');assert.equal(cancelled.error,undefined);assert.deepEqual(await readdir(path.dirname(file)),[]);
 },0);
});
