// Scan Git's publication allowlist, never local credentials or ignored profiles.
const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const findings=[];
for(const file of files){
  if(/(?:^|\/)(?:node_modules|logs|release|\.local|\.smoke-profile|\.test-profiles)(?:\/|$)|\.(?:enc|pem|pfx|p12|bundle|mp4)$|(?:^|\/)\.env(?:\.|$)/i.test(file))findings.push({file,rule:'private or generated file'});
  const content=readFileSync(file,'utf8');
  for(const [rule,pattern] of [
    ['personal Windows home',/[A-Z]:[\\/]Users[\\/](?!Public(?:[\\/]|$)|Default(?:[\\/]|$))[^\s"'<>]+/i],
    ['personal workspace',/[A-Z]:[\\/]Workspace[\\/]/i],
    ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ['JWT credential',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/],
    ['OpenAI credential',/\bsk-(?:proj-)?[A-Za-z0-9_-]{25,}\b/]
  ])if(pattern.test(content))findings.push({file,rule});
}
if(findings.length){console.error(JSON.stringify(findings,null,2));process.exitCode=1;}
else console.log(`Public-source audit passed: ${files.length} tracked files; no recognized personal paths or credential patterns. Manual review is still required.`);
