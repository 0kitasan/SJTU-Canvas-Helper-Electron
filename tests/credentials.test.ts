import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoService } from '../core/service.js';
import { apiData } from '../core/subtitles.js';
test('Canvas token is rejected by video adapter before replacing current connection', () => {
  const service = new VideoService();
  assert.throws(() => service.connect('canvas-personal-token'), /不是 Canvas Token/);
  assert.deepEqual(service.connection(), {demo:true,revision:0});
  service.connect('header.payload.signature');
  assert.equal(service.connection().demo, false);
});
test('video JWT rejection explains which credential to use without echoing server payload', () => {
  assert.throws(() => apiData({status:10013,message:'sensitive'}), error =>
    error instanceof Error && error.message.includes('Canvas Token') && !error.message.includes('sensitive'));
});
