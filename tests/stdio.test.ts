import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const { protectOutput } = createRequire(import.meta.url)('../electron/stdio.cjs');

test('logging ignores only EPIPE and preserves other stream failures', () => {
  const stream = new EventEmitter();
  protectOutput(stream);
  assert.doesNotThrow(() => stream.emit('error', Object.assign(new Error('pipe'), {code:'EPIPE'})));
  assert.throws(() => stream.emit('error', Object.assign(new Error('disk error'), {code:'EIO'})), /disk error/);
});

test('process survives repeated logging after its output pipe closes', async () => {
  const guard = createRequire(import.meta.url).resolve('../electron/stdio.cjs');
  const child = spawn(process.execPath, ['-e', `
    require(${JSON.stringify(guard)}).install();
    process.on('message', () => {
      let count = 0;
      const timer = setInterval(() => {
        console.log('log'); console.error('error');
        if (++count === 5) { clearInterval(timer); process.send('survived'); process.disconnect(); }
      }, 20);
    });
  `], {stdio:['ignore','pipe','pipe','ipc']});
  child.stdout!.destroy();
  child.stderr!.destroy();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {child.kill();reject(new Error('child hung'));}, 5000);
    child.on('error', reject);
    child.on('exit', code => {clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`exit ${code}`));});
    child.send('write');
  });
});
