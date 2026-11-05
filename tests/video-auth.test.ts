import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireVideoToken,jwtFromLocation,launchForm,VideoLoginRequired} from '../core/video-auth.js';
test('video SSO follows encoded form and extracts JWT without forwarding Canvas Bearer',async()=>{
  const calls: {url:string;init?:RequestInit}[]=[];
  const token=await acquireVideoToken(async(url,init)=>{
    calls.push({url,init});
    if(calls.length===1) {
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer canvas-test');
      return Response.json({session_url:'https://oc.sjtu.edu.cn/session/start?encoded=a%2Bb'});
    }
    assert.equal(new Headers(init?.headers).get('Authorization'),null);
    if(calls.length===2) return new Response('<form action="https://v.sjtu.edu.cn/lti"><input name="oauth" value="a&amp;b+%2B"></form>');
    assert.equal(String(init?.body),'oauth=a%26b%2B%252B');
    return new Response('',{status:302,headers:{location:'https://v.sjtu.edu.cn/ui/#/?jwt_token=header.payload.signature'}});
  },'canvas-test');
  assert.equal(token,'header.payload.signature');
  assert.equal(calls.length,3);
});
test('video login refuses foreign destinations, password forms, and non-JWT token',()=>{
  assert.throws(()=>launchForm('<form action="https://evil.test"><input name="oauth" value="x"></form>','https://oc.sjtu.edu.cn'),/非学校/);
  assert.throws(()=>launchForm('<form action="/login"><input type="password" name="pw" value="x"></form>','https://oc.sjtu.edu.cn'),VideoLoginRequired);
  assert.throws(()=>jwtFromLocation('/#/?jwt_token=canvas-token'),/JWT格式/);
});
test('video login distinguishes expired SSO and never treats HTML login as API success',async()=>{
  await assert.rejects(()=>acquireVideoToken(async()=>new Response('',{status:401})),VideoLoginRequired);
  await assert.rejects(()=>acquireVideoToken(async()=>new Response('<html>login</html>')),VideoLoginRequired);
});
test('unrelated blank or analytics iframe cannot derail a valid LTI form', async()=>{
  let calls=0;
  const token=await acquireVideoToken(async()=>{
    if(++calls===1) return new Response('<iframe src="about:blank"></iframe><iframe src="https://example.org/analytics"></iframe><form action="https://v.sjtu.edu.cn/lti"><input name="oauth" value="encoded"></form>');
    return new Response('',{status:302,headers:{location:'https://v.sjtu.edu.cn/ui/#/?jwt_token=header.payload.signature'}});
  });
  assert.equal(token,'header.payload.signature');
  assert.equal(calls,2);
});
