// File descriptors remain owned by the child even if the launching terminal exits.
const { spawn } = require('node:child_process');
const { openSync, closeSync, rmSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
rmSync(path.join(root, 'smoke-result.json'), { force: true });
const out = openSync(path.join(root, 'smoke-stdout.txt'), 'w');
const err = openSync(path.join(root, 'smoke-stderr.txt'), 'w');
const child = spawn(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
  cwd: root, stdio: ['ignore', out, err], windowsHide: true,
  env: {...process.env, CANVAS_HELPER_SMOKE_PROFILE: path.join(root, '.smoke-profile')},
});
closeSync(out);
closeSync(err);
const timeout = setTimeout(() => {
  child.kill();
  process.exitCode = 1;
}, 45000);
child.once('error', error => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exitCode = 1;
});
child.once('exit', code => {
  clearTimeout(timeout);
  process.exitCode = code ?? 1;
});
