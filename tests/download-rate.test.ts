import test from 'node:test';
import assert from 'node:assert/strict';
import {DownloadRate} from '../core/download-rate.js';

test('bursting transfer uses elapsed-time average and estimates remaining bytes after warmup',()=>{
 const rate=new DownloadRate(0,0);
 assert.equal(rate.update(1000,10000,1000).etaSeconds,undefined);
 rate.update(4000,10000,2000);
 const current=rate.update(6000,10000,3000);
 assert.equal(current.bytesPerSecond,2000);assert.equal(current.etaSeconds,2);
});

test('stalls show zero and no ETA; recovery includes recent idle time',()=>{
 const rate=new DownloadRate(0,0);
 rate.update(3000,10000,1000);
 assert.deepEqual(rate.update(3000,10000,3000),{bytesPerSecond:0,etaSeconds:undefined});
 assert.equal(rate.update(4000,10000,4000).bytesPerSecond,1000);
});

test('old bursts expire and retained bytes, unknown totals and progress resets do not invent ETA',()=>{
 const rate=new DownloadRate(50000,0);
 rate.update(60000,undefined,1000);
 const recent=rate.update(70000,undefined,11000);
 assert.equal(recent.bytesPerSecond,1000);assert.equal(recent.etaSeconds,undefined);
 assert.deepEqual(rate.update(0,100000,12000),{bytesPerSecond:0});
 assert.equal(rate.update(1000,100000,13000).bytesPerSecond,1000);
});
