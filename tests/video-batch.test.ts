import test from 'node:test';
import assert from 'node:assert/strict';
import {enqueueVideoBatch} from '../core/video-batch.js';
import {videoOutputPath,recordingDayTime} from '../core/video-batch.js';
import path from 'node:path';
import type {DownloadInput} from '../core/downloads.js';
function fixture(cancelled=false) {
  let dialogs=0,lookups=0;
  const queued:DownloadInput[]=[];
  const deps={chooseDirectory:async()=>{dialogs++;return cancelled?undefined:'C:/Videos/custom';},revision:()=>1,
    tracks:async(id:string)=>{lookups++;if(id==='3')throw new Error('录像权限不足');return [0,1].map(index=>({index,view:index+1,title:'机位',url:'https://live.sjtu.edu.cn/video.mp4'}));},
    enqueue:(input:DownloadInput)=>{queued.push(input);return {id:String(queued.length),key:input.key,title:input.title,filePath:input.filePath,state:'queued' as const,received:0};}};
  return {deps,queued,counts:()=>({dialogs,lookups})};
}
test('one picker confirms multiple lectures and queues every camera without duplicate selections',async()=>{
  const f=fixture();
  const result=await enqueueVideoBatch([{id:'1',title:'一'},{id:'2',title:'二'},{id:'1',title:'一'}],f.deps);
  assert.equal(result.tasks.length,4);assert.deepEqual(f.counts(),{dialogs:1,lookups:2});
  assert.ok(f.queued.every(item=>item.filePath.includes('custom')));
  assert.equal(result.cancelled,false);
});
test('videos are separated into course and lecture folders, with safe names and stable IDs',()=>{
  const row={id:'20',title:'课程:一',startTime:'2026/10/30 09:55:00',courseId:'10',courseTitle:'机构/设计'};
  assert.equal(videoOutputPath('root',row,0),path.join('root','机构_设计_10','2026-10-30','09_55_00_录像20_机位1.mp4'));
  assert.notEqual(videoOutputPath('root',row,0),videoOutputPath('root',{...row,id:'21'},0));
  assert.notEqual(videoOutputPath('root',row,0),videoOutputPath('root',{...row,courseId:'11'},0));
  const reserved=videoOutputPath('root',{id:'3',title:'..',courseTitle:'CON'},1);
  assert.ok(reserved.includes('_CON'));assert.equal(path.relative('root',reserved).startsWith('..'),false);
});
test('same-day lectures share one folder, different dates separate and IDs prevent same-time collisions',()=>{
  const row={id:'10',title:'测试',startTime:'2026-09-14 09:55:00',courseId:'10178',courseTitle:'课程'};
  const first=videoOutputPath('root',row,0);
  assert.equal(path.dirname(first),path.dirname(videoOutputPath('root',{...row,id:'11',startTime:'2026-09-14 10:50:20'},1)));
  assert.notEqual(path.dirname(first),path.dirname(videoOutputPath('root',{...row,startTime:'2026-09-16 09:55:00'},0)));
  assert.notEqual(first,videoOutputPath('root',{...row,id:'11'},0));
});
test('recording timestamps preserve Shanghai day across offsets and reject unknown dates',()=>{
  assert.deepEqual(recordingDayTime('2026-09-13T23:55:00Z'),{day:'2026-09-14',time:'07_55_00'});
  assert.deepEqual(recordingDayTime('2026-09-14T07:55:00+08:00'),{day:'2026-09-14',time:'07_55_00'});
  assert.equal(recordingDayTime('2026-02-30 09:55:00'),undefined);
  assert.equal(recordingDayTime('时间未知'),undefined);
  assert.ok(videoOutputPath('root',{id:'12',title:'未知课节',startTime:'未知'},0).includes('日期未知'));
});
test('picker cancellation makes no media lookup and starts no tasks',async()=>{
  const f=fixture(true);const result=await enqueueVideoBatch([{id:'1',title:'一'}],f.deps);
  assert.deepEqual(result,{tasks:[],errors:[],cancelled:true});assert.equal(f.counts().lookups,0);
});
test('one failed lecture does not discard successful lectures and all camera tasks',async()=>{
  const f=fixture();const result=await enqueueVideoBatch([{id:'3',title:'受限'},{id:'2',title:'二'}],f.deps);
  assert.equal(result.errors[0].id,'3');assert.equal(result.tasks.length,2);
});
test('session change during picker starts no tasks and invalid input does not open picker',async()=>{
  const f=fixture();await assert.rejects(()=>enqueueVideoBatch([{id:'../x',title:'bad'}],f.deps));assert.equal(f.counts().dialogs,0);
  let revision=1;f.deps.revision=()=>revision;f.deps.chooseDirectory=async()=>{revision++;return 'C:/Videos/custom';};
  await assert.rejects(()=>enqueueVideoBatch([{id:'1',title:'一'}],f.deps),/账号已变化/);assert.equal(f.queued.length,0);
});
