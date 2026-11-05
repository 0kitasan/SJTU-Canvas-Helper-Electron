// Run only while the normal application is closed. Reads this rebuild's session,
// never the original app's configuration. Output contains counts, never credentials.
require('../electron/stdio.cjs').install();
const {app}=require('electron');
const path=require('node:path');
const {writeFile}=require('node:fs/promises');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const profile=path.join(app.getPath('appData'),'SJTU-Canvas-Rebuild-Electron-schema1');
app.setPath('userData',profile);app.setPath('sessionData',profile);
const report={timestamp:new Date().toISOString(),live:true,passed:false,stage:'startup'};
let held=false;
const timeout=setTimeout(()=>app.exit(1),90000);
app.whenReady().then(async()=>{
  try {
    held=app.requestSingleInstanceLock();
    if(!held) throw new Error('重构应用仍在运行，未读取其正在使用的会话');
    const {tryVideoLogin}=await import(pathToFileURL(path.join(root,'dist-electron/electron/video-session.js')));
    const {VideoService}=await import(pathToFileURL(path.join(root,'dist-electron/core/service.js')));
    const {CanvasSession}=await import(pathToFileURL(path.join(root,'dist-electron/electron/canvas-session.js')));
    const manager=new CanvasSession();
    await manager.initialize();
    report.stage='sso';
    await manager.withVideoCredentials(async (active,canvasToken)=>{
      const token=await tryVideoLogin(active,canvasToken||undefined);
      const service=new VideoService((url,init)=>active.fetch(url instanceof URL?url.href:url,init));
      service.connect(token);
      report.stage='courses';const courses=await service.courses();report.courses=courses.length;
      if(!courses.length) throw new Error('真实课程为空，未验收课节及字幕');
      report.stage='recordings';const recordings=await service.recordings(courses[0].id);report.recordings=recordings.length;
      if(!recordings.length) throw new Error('首门课程无课节，未验收字幕');
      report.stage='transcript';const transcript=await service.transcript(recordings[0].id);report.subtitleVersion=transcript.version;report.lines=transcript.lines.length;
    });
    report.passed=true;report.stage='complete';
  } catch(error) {report.error=error.message;}
  finally {
    await writeFile(path.join(root,'logs/video-live-result.json'),JSON.stringify(report,null,2));
    clearTimeout(timeout);app.exit(report.passed?0:1);
  }
});
