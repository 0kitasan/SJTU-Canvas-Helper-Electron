require('../electron/stdio.cjs').install();
const {app,session}=require('electron');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'.test-profiles','restart'));
app.setPath('sessionData',app.getPath('userData'));
const phase=process.argv[2];
const timer=setTimeout(()=>app.exit(1),15000);
app.whenReady().then(async()=>{
  try {
    const {CanvasSession}=await import(pathToFileURL(path.join(root,'dist-electron/electron/canvas-session.js')));
    const {CanvasApi}=await import(pathToFileURL(path.join(root,'dist-electron/core/canvas.js')));
    const manager=new CanvasSession();
    // Fixed-response transport; real CanvasSession, Chromium cookies and OS safeStorage.
    manager.api=function(provider=this.provider,token=this.token) {
      return new CanvasApi(provider==='ji'?'https://jicanvas.com':'https://oc.sjtu.edu.cn',async (_url,init)=>{
        const header=new Headers(init.headers).get('Authorization');
        if (header && header!=='Bearer fixture-restart-secret') return new Response('',{status:401});
        return Response.json({id:42,name:'Fixture'});
      },token);
    };
    await manager.initialize();
    const file=path.join(app.getPath('userData'),'canvas-session.enc');
    if(phase==='save-token') {
      await manager.connectToken('ji','fixture-restart-secret');
      await assert.rejects(()=>manager.connectToken('sjtu','invalid-fixture'));
      assert.equal((await manager.status()).provider,'ji');
      assert.ok(!readFileSync(file).includes(Buffer.from('fixture-restart-secret')));
      await manager.flush();
    } else if(phase==='restore-token') {
      assert.equal(manager.token,'fixture-restart-secret');
      assert.equal((await manager.status()).provider,'ji');
      await manager.logout();assert.equal(existsSync(file),false);
    } else if(phase==='save-cookie') {
      const active=session.fromPartition('persist:canvas-rebuild-schema1-sjtu');
      await active.cookies.set({url:'https://oc.sjtu.edu.cn/',name:'fixture-session',value:'fixture-cookie-secret',secure:true,httpOnly:true});
      await manager.flush();
      assert.ok(!readFileSync(file).includes(Buffer.from('fixture-cookie-secret')));
      // Remove Chromium copy: next phase must restore from encrypted snapshot.
      await active.clearStorageData();
    } else if(phase==='restore-cookie') {
      const cookies=await session.fromPartition('persist:canvas-rebuild-schema1-sjtu').cookies.get({url:'https://oc.sjtu.edu.cn/'});
      assert.equal(cookies.find(c=>c.name==='fixture-session')?.value,'fixture-cookie-secret');
      await manager.logout();assert.equal(existsSync(file),false);
    } else if(phase==='logged-out') {
      assert.deepEqual(await manager.status(),{authenticated:false,provider:'sjtu'});
      await manager.flush();assert.equal(existsSync(file),false);
    } else throw new Error('Unknown phase');
    console.log(`Session restart passed: ${phase}`);
    clearTimeout(timer);app.exit(0);
  } catch(error) {console.error(error);clearTimeout(timer);app.exit(1);}
});
