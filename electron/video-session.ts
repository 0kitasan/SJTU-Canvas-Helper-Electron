import { net, type Session } from 'electron';
import { acquireVideoToken } from '../core/video-auth.js';
// This function is main-process only. Never return its result through renderer IPC.
export function tryVideoLogin(activeSession: Session, canvasToken?: string): Promise<string> {
  return acquireVideoToken((url, init) => schoolRequest(activeSession, url, init), canvasToken);
}

// net.request exposes redirect headers without automatically following a JWT URL.
// Domain restrictions and every next redirect/form are checked by acquireVideoToken.
export function schoolRequest(active: Session, url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = net.request({url, method: init.method || 'GET', session: active,
      redirect: 'manual', credentials: init.credentials || 'include'});
    const finish = (response?: Response, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
      if (response) resolve(response); else reject(error || new Error('NETWORK_FAILURE'));
    };
    const abort = () => { finish(undefined,new Error('ABORT_ERR')); request.abort(); };
    const timer = setTimeout(abort, 20000);
    request.once('error', error => finish(undefined,error));
    request.once('redirect', (status, _method, target) => {
      finish(new Response(null,{status,headers:{location:target}}));
      request.abort();
    });
    request.once('response', incoming => {
      const chunks: Buffer[] = [];
      let size = 0;
      incoming.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) { finish(undefined,new Error('录像登录响应超过安全上限')); request.abort(); }
        else chunks.push(Buffer.from(chunk));
      });
      incoming.once('error', error => finish(undefined,error));
      incoming.once('end', () => {
        if (settled) return;
        try {
          const headers = new Headers();
          for (const [key,value] of Object.entries(incoming.headers))
            for (const item of Array.isArray(value) ? value : [value]) headers.append(key,item);
          finish(new Response([204,205,304].includes(incoming.statusCode) ? null : Buffer.concat(chunks),{status:incoming.statusCode,headers}));
        } catch { finish(undefined,new Error('录像登录响应结构异常')); }
      });
    });
    if (init.signal?.aborted) { abort(); return; }
    init.signal?.addEventListener('abort',abort,{once:true});
    try {
      new Headers(init.headers).forEach((value,key) => request.setHeader(key,value));
      if (init.body != null) {
        if (typeof init.body !== 'string' && !(init.body instanceof URLSearchParams)) throw new Error('录像登录表单类型无效');
        request.write(init.body.toString());
      }
      request.end();
    } catch (error) { finish(undefined,error instanceof Error ? error : new Error('录像登录请求失败')); request.abort(); }
  });
}
