require('../electron/stdio.cjs').install();
const {app,safeStorage,net}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {mkdirSync,writeFileSync}=require('node:fs');
const root=path.resolve(__dirname,'..');
const profile=path.join(app.getPath('appData'),'SJTU-Canvas-Rebuild-Electron-schema1');
app.setPath('userData',profile);app.setPath('sessionData',profile);
const report={timestamp:new Date().toISOString(),passed:false,stage:'credentials'};
const timeout=setTimeout(()=>app.exit(1),240000);
app.whenReady().then(async()=>{
 try {
  const {CredentialStore}=await import(pathToFileURL(path.join(root,'dist-electron/electron/credential-store.js')));
  const {VideoService}=await import(pathToFileURL(path.join(root,'dist-electron/core/service.js')));
  const saved=new CredentialStore(path.join(profile,'video-session.enc'),safeStorage).load();
  if(!saved?.token)throw new Error('本重构尚无已保存录像凭据');
  const service=new VideoService((url,init)=>net.fetch(url instanceof URL?url.href:url,init));service.connect(saved.token);
  report.stage='courses';const courses=await service.courses();report.courses=courses.length;
  report.stage='recordings';let recording;
  for(const course of courses.slice(0,5)){const rows=await service.recordings(course.id);if(rows.length){recording=rows[0];break;}}
  if(!recording)throw new Error('没有可测试的录像');
  report.stage='tracks';const tracks=await service.tracks(recording.id);report.tracks=tracks.length;
  report.stage='media';const media=new URL(tracks[0].url);report.mediaHost=media.hostname;report.mediaPort=media.port;report.mediaProtocol=media.protocol;const {schoolRequest}=await import(pathToFileURL(path.join(root,'dist-electron/electron/video-session.js')));const response=await fetch(tracks[0].url,{headers:{Referer:'https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/',Range:'bytes=0-65535'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  report.status=response.status;if(response.headers.get('location'))report.redirectHost=new URL(response.headers.get('location'),tracks[0].url).hostname;report.contentType=response.headers.get('content-type');
  const reader=response.body?.getReader();const first=await reader?.read();report.received=first?.value?.length||0;await reader?.cancel();
  if(!response.ok||!report.received)throw new Error('媒体探测失败');
  report.stage='download';
  const {DownloadManager}=await import(pathToFileURL(path.join(root,'dist-electron/core/downloads.js')));
  const manager=new DownloadManager();
  const filePath=path.join(root,'logs',`live-download-${Date.now()}.mp4`);
  const task=manager.enqueue({key:'live',title:'真实下载验证',filePath,resolve:async()=>({url:(await service.tracks(recording.id))[0].url,headers:{Referer:'https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/'}})});
  const start=Date.now();
  while(Date.now()-start<210000){
    const current=manager.list().find(t=>t.id===task.id);
    if(current.state==='completed'){report.downloaded=current.received;report.filePath=filePath;report.passed=true;report.stage='download-complete';break;}
    if(current.state==='failed'||current.state==='cancelled')throw new Error(current.error||current.state);
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  await manager.shutdown();
  if(!report.passed)throw new Error('完整下载验证超时，已清理未完成文件');
 } catch(error){report.error=error.message;}
 finally{mkdirSync(path.join(root,'logs'),{recursive:true});writeFileSync(path.join(root,'logs/download-live-result.json'),JSON.stringify(report,null,2));clearTimeout(timeout);app.exit(report.passed?0:1);}
});
