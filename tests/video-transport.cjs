require('../electron/stdio.cjs').install();
const {app,session}=require('electron');
const {createServer}=require('node:http');
const {writeFileSync,mkdirSync}=require('node:fs');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
app.setPath('userData',path.join(root,'.test-profiles','transport'));
app.setPath('sessionData',app.getPath('userData'));
const timeout=setTimeout(()=>app.exit(1),20000);
app.whenReady().then(async()=>{
  let server;
  try {
    let followed=0;
    server=createServer((request,response)=>{
      if(request.url==='/redirect') {response.writeHead(302,{Location:'/target?jwt_token=fixture.token.signature','Set-Cookie':'fixture-redirect=1; HttpOnly; Path=/'});response.end();}
      else if(request.url.startsWith('/target')) {followed++;response.end('must not follow');}
      else {response.setHeader('Content-Type','application/json');response.end(JSON.stringify({cookie:request.headers.cookie||''}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const active=session.fromPartition('persist:transport-fixture');
    let fetchManual;
    try {fetchManual=(await active.fetch(base+'/redirect',{redirect:'manual'})).status;} catch(error) {fetchManual=error.name;}
    followed=0;
    const {schoolRequest}=await import(pathToFileURL(path.join(root,'dist-electron/electron/video-session.js')));
    const redirected=await schoolRequest(active,base+'/redirect');
    assert.equal(redirected.status,302);assert.ok(redirected.headers.get('location').endsWith('/target?jwt_token=fixture.token.signature'));assert.equal(followed,0);
    const echoed=await (await schoolRequest(active,base+'/cookie')).json();
    assert.ok(echoed.cookie.includes('fixture-redirect=1'));
    mkdirSync(path.join(root,'logs'),{recursive:true});
    writeFileSync(path.join(root,'logs/video-transport-result.json'),JSON.stringify({passed:true,timestamp:new Date().toISOString(),fetchManual,redirectNotFollowed:true,cookiesPreserved:true,realSchoolData:false},null,2));
    server.close();clearTimeout(timeout);app.exit(0);
  } catch(error) {console.error(error);server?.close();clearTimeout(timeout);app.exit(1);}
});
