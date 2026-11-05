export const videoLaunchUrl = 'https://oc.sjtu.edu.cn/accounts/1/external_tools/3136?launch_type=global_navigation';
export class VideoLoginRequired extends Error {}
const allowedHosts = new Set(['oc.sjtu.edu.cn', 'v.sjtu.edu.cn', 'courses.sjtu.edu.cn', 'jaccount.sjtu.edu.cn']);
export function allowedVideoUrl(value: string, base?: string): URL {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.username || url.password)
    throw new Error(`录像登录拒绝非学校认证地址（${url.hostname || '无主机名'}）`);
  return url;
}
export function jwtFromLocation(value: string): string | undefined {
  const fragment = value.includes('#') ? value.split('#').slice(1).join('#') : value;
  const query = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
  // URLSearchParams interprets literal + as space, unlike the original decoder.
  for (const pair of query.split('&')) {
    const index = pair.indexOf('=');
    if (pair.slice(0, index) === 'jwt_token') {
      let token: string;
      try { token = decodeURIComponent(pair.slice(index + 1)); } catch { throw new Error('录像JWT编码无效'); }
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('录像登录返回的JWT格式无效');
      return token;
    }
  }
}
function decode(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, code: string) => {
    if (code[0] === '#') {
      const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10);
      if (point < 0 || point > 0x10ffff) throw new Error('录像表单字符无效');
      return String.fromCodePoint(point);
    }
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'} as Record<string,string>)[code.toLowerCase()];
  });
}
function attributes(tag: string): Record<string,string> {
  const attrs: Record<string,string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
    attrs[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return attrs;
}
export function launchForm(html: string, base: string): { url: string; body: URLSearchParams } {
  const form = html.match(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/i);
  if (!form) throw new VideoLoginRequired('需要本人完成录像平台登录，当前会话未返回LTI启动表单');
  const attrs = attributes(form[1]);
  if (!attrs.action) throw new Error('录像登录表单缺少action');
  const url = allowedVideoUrl(attrs.action, base);
  if (url.hostname === 'jaccount.sjtu.edu.cn') throw new VideoLoginRequired('需要本人完成jAccount登录');
  const body = new URLSearchParams();
  for (const input of form[2].matchAll(/<input\b[^>]*>/gi)) {
    const item = attributes(input[0]);
    if (item.type?.toLowerCase() === 'password') throw new VideoLoginRequired('需要本人完成学校登录');
    if (item.name !== undefined && item.value !== undefined) body.append(item.name, item.value);
  }
  if (!body.size) throw new Error('录像登录表单没有启动参数');
  return {url: url.href, body};
}
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export function safeNetworkCode(error: unknown): string {
  const codes: string[] = [];
  let current = error;
  for (let level = 0; level < 4 && current && typeof current === 'object'; level++) {
    const item = current as { code?:unknown; name?:unknown; message?:unknown; cause?:unknown };
    for (const value of [item.code,item.name,item.message]) {
      if (typeof value !== 'string') continue;
      const found = value.match(/\b(?:net::)?(ERR_[A-Z_]+|UND_ERR_[A-Z_]+|ABORT_ERR|ECONN[A-Z]+|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b/);
      if (found && !codes.includes(found[1])) codes.push(found[1]);
      if (value === 'TimeoutError' && !codes.includes('TIMEOUT')) codes.push('TIMEOUT');
    }
    current = item.cause;
  }
  return codes.join('/') || 'NETWORK_FAILURE';
}
export async function acquireVideoToken(fetcher: Fetcher, canvasToken?: string): Promise<string> {
  let next = videoLaunchUrl;
  if (canvasToken) {
    const url = new URL('/login/session_token', 'https://oc.sjtu.edu.cn');
    url.searchParams.set('return_to', videoLaunchUrl);
    let response: Response;
    try { response = await fetcher(url.href, {headers:{Authorization:`Bearer ${canvasToken}`,Accept:'application/json'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)}); }
    catch (error) { throw new Error(`Canvas录像会话兑换连接失败（${safeNetworkCode(error)}）`); }
    if (!response.ok) throw new VideoLoginRequired(`Canvas录像会话兑换失败（HTTP ${response.status}），需要本人学校登录`);
    const result = await response.json() as {session_url?:unknown};
    if (typeof result.session_url !== 'string') throw new Error('Canvas未返回录像登录会话地址');
    next = allowedVideoUrl(result.session_url, 'https://oc.sjtu.edu.cn').href;
  }
  let formBody: URLSearchParams | undefined;
  for (let step=0; step<16; step++) {
    const url = allowedVideoUrl(next);
    let response: Response;
    try { response = await fetcher(url.href, {method:formBody?'POST':'GET',body:formBody,headers:formBody?{'Content-Type':'application/x-www-form-urlencoded'}:{},credentials:'include',redirect:'manual',signal:AbortSignal.timeout(20000)}); }
    catch (error) { throw new Error(`录像登录连接失败（步骤${step+1}，${safeNetworkCode(error)}）`); }
    if (response.status === 401 || response.status === 403) throw new VideoLoginRequired('录像登录会话无效，需要本人重新登录');
    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400) {
      const target = allowedVideoUrl(location,url.href);
      const token = target.hostname === 'v.sjtu.edu.cn' ? jwtFromLocation(target.href) : undefined;
      if (token) return token;
      next=target.href; formBody=undefined; continue;
    }
    if (!response.ok) throw new Error(`录像登录失败（HTTP ${response.status}）`);
    if (url.hostname === 'jaccount.sjtu.edu.cn') throw new VideoLoginRequired('需要本人完成jAccount登录，无法自动通过验证码或登录确认');
    const html = await response.text();
    for (const iframe of html.matchAll(/<iframe\b[^>]*>/gi)) {
      const src = attributes(iframe[0]).src;
      if (!src) continue;
      let target: URL;
      try { target = new URL(src,url.href); } catch { continue; }
      // Login pages may include about:blank or unrelated analytics frames.
      // Only inspect a video-platform frame; never follow these frame URLs.
      if (target.protocol !== 'https:' || target.hostname !== 'v.sjtu.edu.cn') continue;
      allowedVideoUrl(target.href);
      const token=jwtFromLocation(target.href);
      if(token) return token;
    }
    const form=launchForm(html,url.href);
    next=form.url;formBody=form.body;
  }
  throw new Error('录像登录重定向超过安全上限');
}
