const {spawn}=require('node:child_process');
const {mkdirSync,openSync,closeSync}=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
mkdirSync(path.join(root,'logs'),{recursive:true});
const id=Date.now();
const out=openSync(path.join(root,'logs',`stability-${id}-stdout.txt`),'w');
const err=openSync(path.join(root,'logs',`stability-${id}-stderr.txt`),'w');
const child=spawn(require('electron'),[path.join(__dirname,'download-stability.cjs')],{
 cwd:root,stdio:['ignore',out,err],windowsHide:true,
});
closeSync(out);closeSync(err);
child.once('error',error=>{console.error(error.code||error.name);process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;console.log('Connection diagnostic finished; see logs/stability/connection-*.json');});
