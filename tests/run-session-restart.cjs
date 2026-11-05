const {spawnSync}=require('node:child_process');
const {mkdirSync,openSync,closeSync,writeFileSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
mkdirSync(path.join(root,'logs'),{recursive:true});
const log=openSync(path.join(root,'logs/session-restart.txt'),'w');
const phases=['save-token','restore-token','save-cookie','restore-cookie','logged-out'];
const completed=[];
try {
  for(const phase of phases) {
    const result=spawnSync(require('electron'),[path.join(__dirname,'session-restart.cjs'),phase],{cwd:root,stdio:['ignore',log,log],windowsHide:true,timeout:20000});
    if(result.status!==0) throw new Error(`Session restart failed: ${phase}; see logs/session-restart.txt`);
    completed.push(phase);
  }
  writeFileSync(path.join(root,'logs/session-restart-result.json'),JSON.stringify({passed:true,timestamp:new Date().toISOString(),completed,realSchoolData:false,realOsEncryption:true},null,2));
} finally {closeSync(log);}
