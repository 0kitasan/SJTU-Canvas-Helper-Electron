// Run with Electron after run.ps1 build. Only uses this rebuild's saved credentials.
require('../electron/stdio.cjs').install();
const {app,safeStorage,net}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {open}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const runId=Date.now();
const sourceProfile=path.join(app.getPath('appData'),'SJTU-Canvas-Rebuild-Electron-schema1');
const output=path.join(root,'logs','stability');
const profile=path.join(root,'.test-profiles',`stability-${runId}`);
const seconds=Number(process.env.STABILITY_SECONDS||300);
if(!Number.isFinite(seconds)||seconds<30||seconds>900)throw new Error('STABILITY_SECONDS must be 30..900');
app.setPath('userData',profile);app.setPath('sessionData',profile);
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(output,{recursive:true});
try{
 const state=JSON.parse(fs.readFileSync(path.join(sourceProfile,'Local State'),'utf8'));
 if(state.os_crypt)fs.writeFileSync(path.join(profile,'Local State'),JSON.stringify({os_crypt:state.os_crypt}));
}catch{/* Credential loading below reports failure without leaking data. */}
const report={timestamp:new Date().toISOString(),budgetSeconds:seconds,injectedDisconnect:false,concurrency:1,requests:[],samples:[]};
const reportPath=path.join(output,`connection-${runId}.json`);
let manager,interval,budgetTimer,finishing=false;
const start=performance.now();
const elapsed=()=>Math.round(performance.now()-start);
const safeError=e=>({name:e?.name,code:e?.code,causeCode:e?.cause?.code});
const save=()=>fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
function filenames(dir){
 const names=[];
 try{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;
  if(entry.isDirectory())names.push(...filenames(path.join(dir,entry.name)));
  else names.push(entry.name);
 }}catch(error){if(error.code!=='ENOENT')throw error;}
 return names;
}
function snapshot(){
 const task=manager?.list()[0];
 if(task)report.samples.push({elapsedMs:elapsed(),state:task.state,received:task.received,total:task.total,retries:task.retryCount||0,stage:task.stage,speed:task.bytesPerSecond,
  networkBytes:report.requests.reduce((sum,r)=>sum+r.bytes,0),networkSilentMs:report.requests.length?elapsed()-(report.requests.at(-1).lastDataMs??report.requests.at(-1).headersMs??report.requests.at(-1).startedMs):undefined});
 save();return task;
}
async function containerSummary(file){
 const handle=await open(file,'r');
 try{
  const size=(await handle.stat()).size,boxes=[];let position=0;
  while(position<size&&boxes.length<100){
   const header=Buffer.alloc(16),{bytesRead}=await handle.read(header,0,Math.min(16,size-position),position);
   if(bytesRead<8)break;
   let length=header.readUInt32BE(0),headerSize=8;
   if(length===1){if(bytesRead<16)break;length=Number(header.readBigUInt64BE(8));headerSize=16;}
   else if(length===0)length=size-position;
   if(!Number.isSafeInteger(length)||length<headerSize||position+length>size)break;
   boxes.push(header.toString('ascii',4,8));position+=length;
  }
  return {bytes:size,boxes,complete:position===size&&boxes.includes('ftyp')&&boxes.includes('mdat')&&boxes.includes('moov')};
 }finally{await handle.close();}
}
async function finish(reason,error){
 if(finishing)return;finishing=true;clearInterval(interval);clearTimeout(budgetTimer);clearTimeout(setupTimer);
 report.stopReason=reason;if(error)report.error=safeError(error);
 const task=snapshot();report.beforeStop=task&&{state:task.state,received:task.received,total:task.total,retries:task.retryCount||0,error:task.error,partialRetained:task.partialRetained};
 if(task?.state==='completed')try{report.container=await containerSummary(task.filePath);}catch(e){report.containerError=safeError(e);}
 await manager?.shutdown();report.elapsedMs=elapsed();
 report.remainingParts=fs.readdirSync(output).filter(name=>name.endsWith('.part')).length;
 save();console.log(JSON.stringify({report:path.relative(root,reportPath),stopReason:reason,elapsedMs:report.elapsedMs,task:report.beforeStop,container:report.container,error:report.error}));
 app.exit(error||['failed','setup-timeout'].includes(reason)?1:0);
}
const setupTimer=setTimeout(()=>void finish('setup-timeout'),45000);
app.whenReady().then(async()=>{
 try{
  const load=relative=>import(pathToFileURL(path.join(root,'dist-electron',relative)));
  const {CredentialStore}=await load('electron/credential-store.js');
  const {VideoService}=await load('core/service.js');
  const {DownloadManager}=await load('core/downloads.js');
  report.stage='credentials';save();
  const saved=new CredentialStore(path.join(sourceProfile,'video-session.enc'),safeStorage).load();
  if(!saved?.token)throw new Error('No saved rebuild video credentials');
  const service=new VideoService((url,init)=>net.fetch(url instanceof URL?url.href:url,init));service.connect(saved.token);
  report.stage='select-target';save();
  const course=(await service.courses()).find(c=>c.title.includes(process.env.STABILITY_COURSE||'汽车数字化制造'));
  if(!course)throw new Error('Diagnostic course unavailable');
  const existing=[...filenames(path.join(app.getPath('videos'),'SJTU_Canvas_Helper-electron')),...filenames(path.join(root,'logs','car-download-test')),...filenames(output),
   ...(process.env.STABILITY_EXISTING_ROOT?filenames(process.env.STABILITY_EXISTING_ROOT):[])];
  let target;
  for(const row of (await service.recordings(course.id)).sort((a,b)=>b.time.localeCompare(a.time)||Number(b.id)-Number(a.id))){
   for(const track of await service.tracks(row.id)){
    const camera=track.index+1;
    if(existing.some(n=>n.includes(`录像${row.id}_机位${camera}.mp4`)||n===`${row.id}_${camera}.mp4`||n.startsWith(`${row.id}_${camera}.mp4.`)))continue;
    target={recording:row.id,index:track.index};break;
   }
   if(target)break;
  }
  if(!target){await finish('no-unfinished-track');return;}
  clearTimeout(setupTimer);
  report.target={recording:target.recording,camera:target.index+1};report.stage='download';save();
  manager=new DownloadManager(async(url,init)=>{
   const event={startedMs:elapsed(),range:new Headers(init.headers).get('range'),ifRangePresent:new Headers(init.headers).has('if-range'),bytes:0,gaps:[],maxReadWaitMs:0};report.requests.push(event);
   init.signal.addEventListener('abort',()=>{event.abortedMs=elapsed();event.abort=safeError(init.signal.reason);},{once:true});
   try{
    const response=await fetch(url,init);Object.assign(event,{headersMs:elapsed(),status:response.status,contentRange:response.headers.get('content-range'),length:response.headers.get('content-length'),validatorPresent:!!(response.headers.get('etag')||response.headers.get('last-modified'))});save();
    if(!response.body)return response;
    const reader=response.body.getReader();
    return new Response(new ReadableStream({async pull(controller){
     const readStart=elapsed();
     try{
      const chunk=await reader.read(),now=elapsed();event.maxReadWaitMs=Math.max(event.maxReadWaitMs,now-readStart);
      if(chunk.done){event.endMs=now;controller.close();return;}
      const gap=now-(event.lastDataMs??event.headersMs);
      if(gap>=1000)event.gaps.push({atMs:now,gapMs:gap,readWaitMs:now-readStart,offset:event.bytes});
      event.bytes+=chunk.value.length;event.lastDataMs=now;controller.enqueue(chunk.value);
     }catch(error){event.streamError=safeError(error);event.errorMs=elapsed();controller.error(error);save();}
    },cancel(){return reader.cancel();}}),{status:response.status,headers:response.headers});
   }catch(error){event.connectionError=safeError(error);event.errorMs=elapsed();save();throw error;}
  },undefined,1);
  manager.enqueue({key:`stability-${target.recording}-${target.index}`,title:'连接稳定性诊断',filePath:path.join(output,`${target.recording}_${target.index+1}.mp4`),
   resolve:async()=>{
    const track=(await service.tracks(target.recording)).find(t=>t.index===target.index);
    if(!track)throw new Error('Track unavailable');
    return {url:track.url,headers:{Referer:'https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/'}};
   }});
  interval=setInterval(()=>{const task=snapshot();if(task&&['failed','completed','cancelled'].includes(task.state))void finish(task.state);},2000);
  budgetTimer=setTimeout(()=>void finish('time-budget'),seconds*1000);
 }catch(error){await finish('setup-error',error);}
});
