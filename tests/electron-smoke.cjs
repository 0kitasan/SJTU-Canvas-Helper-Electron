// Run after build with node tests/run-electron-smoke.cjs.
require('../electron/stdio.cjs').install();
const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const assert = require("node:assert/strict");
const { writeFile, readFile, unlink } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
app.disableHardwareAcceleration();
const realFetch = global.fetch;
global.fetch = (url,init) => String(url).startsWith('https://mss2.sjtu.edu.cn/fixture.mp4')
  ? Promise.resolve(new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{headers:{'Content-Type':'video/mp4'}}))
  : realFetch(url,init);

const timeout = setTimeout(() => {
  try { console.error("Electron smoke timed out"); }
  finally { app.exit(1); }
}, 30000);
app.whenReady().then(async () => {
  try {
    const firstWindow = new Promise((resolve) =>
      app.once("browser-window-created", (_event, win) => resolve(win)),
    );
    await import(
      pathToFileURL(
        path.resolve(__dirname, "../dist-electron/electron/main.js"),
      ).href
    );
    const win = await firstWindow;
    await new Promise((resolve, reject) => {
      win.webContents.once("did-finish-load", resolve);
      win.webContents.once("did-fail-load", (_event, code, description) =>
        reject(new Error(`${code}: ${description}`)),
      );
    });
    const result = await win.webContents.executeJavaScript(`(async()=>{
      const courses=await window.canvas.courses();
      const recordings=await window.canvas.recordings(courses[0].id);
      const original=await window.canvas.transcript('206265');
      const optimized=await window.canvas.transcript('207075');
      const errors=[];
      for(const id of ['403','404']) {try{await window.canvas.transcript(id);}catch(e){errors.push(String(e));}}
      await window.canvas.openWindow('connection');
      return {courses:courses.length,recordings:recordings.length,original:original.version,optimized:optimized.version,errors,text:document.body.innerText};
    })()`);
    assert.equal(result.original, "original");
    assert.equal(result.optimized, "optimized");
    assert.equal(result.recordings, 4);
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors[0].includes("403"));
    assert.ok(result.text.includes("课程资料"));
    assert.ok(!result.text.includes("Canvas Agent"));
    assert.ok(await win.webContents.executeJavaScript(`document.querySelectorAll('.nav-icon svg').length >= 13`));
    await assert.rejects(() => win.webContents.executeJavaScript(`window.canvas.canvasConnectToken('sjtu','invalid token')`), /Token 原文/);
    await assert.rejects(() => win.webContents.executeJavaScript(`window.canvas.openWindow('agent')`), /未知页面/);
    assert.equal(BrowserWindow.getAllWindows().length, 2);
    const prefs = win.webContents.getLastWebPreferences();
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.sandbox, true);
    const {VideoService} = await import(pathToFileURL(path.resolve(__dirname,'../dist-electron/core/service.js')));
    const originalTracks = VideoService.prototype.tracks;
    const originalOpenDialog = dialog.showOpenDialog;
    const targetVideo = path.join(__dirname,'../logs/未分类课程/日期未知/fixture_录像206265_机位1.mp4');
    const targetVideo2 = path.join(__dirname,'../logs/未分类课程/日期未知/fixture_录像206265_机位2.mp4');
    await unlink(targetVideo).catch(()=>{});
    await unlink(targetVideo2).catch(()=>{});
    VideoService.prototype.tracks = async () => [0,1].map(index=>({index,view:index+1,title:'fixture机位',url:'https://mss2.sjtu.edu.cn/fixture.mp4?signature=not-real'}));
    let dialogCalls=0;
    dialog.showOpenDialog = async options => {
      dialogCalls++;assert.equal(path.basename(options.defaultPath),'SJTU_Canvas_Helper-electron');
      return {canceled:true,filePaths:[]};
    };
    await session.defaultSession.protocol.handle('https',()=>new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{headers:{'Content-Type':'video/mp4'}}));
    try {
      const tracks = await win.webContents.executeJavaScript(`window.canvas.videoTracks('206265')`);
      assert.equal(tracks[0].url,undefined);
      const cancelled=await win.webContents.executeJavaScript(`window.canvas.downloadVideos([{id:'206265',title:'fixture'}])`);
      assert.equal(cancelled.cancelled,true);assert.equal((await win.webContents.executeJavaScript(`window.canvas.downloadTasks()`)).length,0);
      dialog.showOpenDialog = async options => {
        dialogCalls++;assert.equal(path.basename(options.defaultPath),'SJTU_Canvas_Helper-electron');
        return {canceled:false,filePaths:[path.join(__dirname,'../logs')]};
      };
      const batch=await win.webContents.executeJavaScript(`window.canvas.downloadVideos([{id:'206265',title:'fixture'}])`);
      assert.equal(batch.tasks.length,2);assert.equal(dialogCalls,2);
      let completed=false;
      for(let n=0;n<100;n++) {
        const tasks=await win.webContents.executeJavaScript(`window.canvas.downloadTasks()`);
        if(tasks.length===2 && tasks.every(task=>task.state==='completed')){completed=true;break;}
        if(tasks[0]?.state==='failed')throw new Error(tasks[0].error);
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.ok(completed);assert.equal((await readFile(targetVideo)).length,8);
      assert.equal((await readFile(targetVideo2)).length,8);
      const second=BrowserWindow.getAllWindows().find(other=>other!==win);
      assert.equal((await second.webContents.executeJavaScript(`window.canvas.downloadTasks()`))[0].state,'completed');
    } finally {
      VideoService.prototype.tracks=originalTracks;
      dialog.showOpenDialog=originalOpenDialog;
      await session.defaultSession.protocol.unhandle('https');
      await unlink(targetVideo).catch(()=>{});
      await unlink(targetVideo2).catch(()=>{});
    }
    // Fixed data tests UI state transitions, not school API acceptance.
    ipcMain.removeHandler('canvas:courses');
    ipcMain.handle('canvas:courses', () => [
      {id:'1',title:'本学期测试课程',term:'2026-2027 秋季'},
      {id:'2',title:'往年测试课程',term:'2025-2026 春季'},
    ]);
    ipcMain.removeHandler('canvas:resources');
    ipcMain.handle('canvas:resources', (_event,id) => {
      if(id==='2') throw new Error('模拟网络失败，请重试');
      return [{id:1,display_name:'fixture-notes.pdf'}];
    });
    const nextWindow = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)));
    await win.webContents.executeJavaScript(`window.canvas.openWindow('files')`);
    const files = await nextWindow;
    if(files.webContents.isLoadingMainFrame()) await new Promise(resolve => files.webContents.once('did-finish-load',resolve));
    await files.webContents.executeJavaScript(`(async()=>{
      const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Canvas UI timed out');};
      const clickRead=()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='读取数据').click();
      await wait(()=>document.querySelector('#canvas-course')?.value==='1');
      if(document.querySelector('#canvas-term').value!=='2026-2027 秋季') throw new Error('Wrong initial term');
      clickRead();await wait(()=>document.body.textContent.includes('fixture-notes.pdf'));
      const term=document.querySelector('#canvas-term');term.value='2025-2026 春季';term.dispatchEvent(new Event('change',{bubbles:true}));
      await wait(()=>document.querySelector('#canvas-course')?.value==='2');
      if(document.body.textContent.includes('fixture-notes.pdf')) throw new Error('Stale course resources');
      clickRead();await wait(()=>document.querySelector('[role=alert]')?.textContent.includes('模拟网络失败'));
    })()`);
    files.setSize(640,800);
    await new Promise(resolve=>setTimeout(resolve,200));
    assert.ok(await files.webContents.executeJavaScript(`document.documentElement.scrollWidth <= innerWidth`));
    await writeFile(path.join(__dirname,'../logs/canvas-fixture-error.png'),(await files.webContents.capturePage()).toPNG());
    files.close();
    const savePath = path.resolve(__dirname, '../smoke-test.srt');
    const originalDialog = dialog.showSaveDialog;
    let defaultName = '';
    dialog.showSaveDialog = async options => { defaultName = options.defaultPath; return {canceled:false,filePath:savePath}; };
    try {
      const saved = await win.webContents.executeJavaScript(`window.canvas.save('207075','演示课堂')`);
      assert.equal(saved.version, 'optimized');
      assert.ok(defaultName.includes('优化字幕'));
      assert.ok((await readFile(savePath,'utf8')).includes('00:00:01,000 --> 00:00:04,800'));
    } finally { dialog.showSaveDialog = originalDialog; await unlink(savePath).catch(()=>{}); }
    await win.webContents.executeJavaScript(`(async()=>{
      const wait=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw new Error('UI wait timed out');};
      await wait(()=>document.querySelector('button.course:not(:disabled)'));
      document.querySelector('button.course').click();
      await wait(()=>document.querySelectorAll('button.recording:not(:disabled)').length===4);
      const all=document.querySelector('input[aria-label="全选当前课程课节"]');
      if(!all)throw new Error('Missing select-all');
      const rows=[...document.querySelectorAll('input[aria-label^="选择课节 "]')];
      if(rows.length!==4)throw new Error('Missing lecture selectors');
      rows[0].click();
      await wait(()=>all.indeterminate);
      all.click();await wait(()=>rows.every(row=>row.checked));
      all.click();await wait(()=>rows.every(row=>!row.checked));
      document.querySelectorAll('button.recording')[1].click();
      await wait(()=>document.querySelector('.preview .badge')?.textContent==='优化字幕');
      return true;
    })()`);
    win.show();
    await new Promise(resolve=>setTimeout(resolve,500));
    await writeFile(
      path.resolve(__dirname, "../smoke-preview.png"),
      (await win.webContents.capturePage()).toPNG(),
    );
    for (const [name, width, height] of [["reference",2283,1165],["narrow",640,800]]) {
      win.setSize(width, height);
      await new Promise(resolve => setTimeout(resolve, 200));
      const layout = await win.webContents.executeJavaScript(`({width:innerWidth,content:document.documentElement.scrollWidth,navigation:document.querySelectorAll('button.nav').length})`);
      assert.ok(layout.content <= layout.width, `${name}: horizontal document overflow`);
      assert.ok(layout.navigation >= 13);
      await writeFile(path.resolve(__dirname, `../smoke-${name}.png`), (await win.webContents.capturePage()).toPNG());
    }
    await writeFile(path.resolve(__dirname, '../smoke-result.json'), JSON.stringify({
      passed: true, timestamp: new Date().toISOString(),
      checks: ['isolated renderer', 'preload IPC', 'demo subtitle provenance and errors', 'second window', 'main-process SRT write with dialog stub', 'navigation', 'desktop and narrow document overflow', 'Canvas semester switch and stale resource clearing (fixture)', 'network failure UI (simulated)'],
      realAccountTested: false, nativeDialogTested: false,
    }, null, 2));
    console.log(
      "Electron smoke passed: renderer, typed preload IPC, four demo cases, native second window",
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    try { console.error(error); }
    finally { app.exit(1); }
  }
});
