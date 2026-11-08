require('../electron/stdio.cjs').install();
const {app,safeStorage,net}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {mkdirSync,writeFileSync,readFileSync}=require('node:fs');
const root=path.resolve(__dirname,'..');
const credentials=path.join(app.getPath('appData'),'SJTU-Canvas-Rebuild-Electron-schema1','video-session.enc');
app.setPath('userData',path.join(root,'.test-profiles','speed'));
app.setPath('sessionData',app.getPath('userData'));
// Reuse only this rebuild's encrypted OS key in an ignored isolated profile.
// Do not share Chromium's live profile or copy cookies / plaintext credentials.
try {
  const state=JSON.parse(readFileSync(path.join(path.dirname(credentials),'Local State'),'utf8'));
  if(state.os_crypt){mkdirSync(app.getPath('userData'),{recursive:true});writeFileSync(path.join(app.getPath('userData'),'Local State'),JSON.stringify({os_crypt:state.os_crypt}));}
}catch { /* Credential load below reports unavailable encryption safely. */ }
const report={timestamp:new Date().toISOString(),samples:[]};
const timer=setTimeout(()=>app.exit(1),60000);
app.whenReady().then(async()=>{
 try {
  const {CredentialStore}=await import(pathToFileURL(path.join(root,'dist-electron/electron/credential-store.js')));
  const {VideoService}=await import(pathToFileURL(path.join(root,'dist-electron/core/service.js')));
  const saved=new CredentialStore(credentials,safeStorage).load();
  if(!saved?.token)throw new Error('本重构没有已保存录像凭据');
  const service=new VideoService((url,init)=>net.fetch(url instanceof URL?url.href:url,init));service.connect(saved.token);
  let recording;for(const course of (await service.courses()).slice(0,5)){recording=(await service.recordings(course.id))[0];if(recording)break;}
  if(!recording)throw new Error('没有录像');
  const tracks=await service.tracks(recording.id);const url=tracks[0].url;
  async function sample(range){
    const controller=new AbortController();const started=performance.now();let bytes=0,status,headersMs;
    const stop=setTimeout(()=>controller.abort(),6000);
    try{
      const response=await fetch(url,{headers:{Referer:'https://v.sjtu.edu.cn/jy-application-resourcemanage-ui/',...(range?{Range:range}:{})},redirect:'error',signal:controller.signal});
      status=response.status;headersMs=performance.now()-started;
      const reader=response.body.getReader();
      while(bytes<4*1048576){const {done,value}=await reader.read();if(done)break;bytes+=value.length;}
      await reader.cancel();
    }catch(error){if(!controller.signal.aborted)throw new Error('媒体测速连接失败');}
    finally{clearTimeout(stop);}
    const seconds=(performance.now()-started)/1000;
    return {range:range||'none',status,bytes,seconds,headersMs,MiBps:bytes/1048576/seconds,Mbps:bytes*8/1e6/seconds};
  }
  report.samples.push(await sample());
  report.samples.push(await sample('bytes=0-4194303'));
  const start=performance.now();const pair=await Promise.all([sample('bytes=4194304-8388607'),sample('bytes=8388608-12582911')]);
  report.parallel={samples:pair,MiBps:pair.reduce((sum,s)=>sum+s.bytes,0)/1048576/((performance.now()-start)/1000)};
 }catch(error){report.error=error.message;}
 finally{mkdirSync(path.join(root,'logs'),{recursive:true});writeFileSync(path.join(root,'logs/download-speed.json'),JSON.stringify(report,null,2));clearTimeout(timer);app.exit(report.error?1:0);}
});
