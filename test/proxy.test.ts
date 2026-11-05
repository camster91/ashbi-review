import { SELF, env } from 'cloudflare:test';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { originKey, proxyUrl, publicOrigin, rewriteCss, rewriteSrcset } from '../worker/proxy';

const origin='https://client.example.com';
const key=originKey(origin);
const token='a-long-random-proof-token';
const prefix=`/p/review/${token}/`;
const url=`https://review.test${prefix}${key}/about/`;
async function request(path=url,init?:RequestInit){return SELF.fetch(path,init);}
beforeEach(async()=>{
  await env.DB.prepare('DELETE FROM reviews').run();
  await env.DB.prepare("INSERT OR IGNORE INTO projects(id,client_name,name) VALUES('project','Test','Proof')").run();
  await env.DB.prepare("INSERT INTO reviews(id,project_id,type,source_url,share_token) VALUES('review','project','site',?,?)").bind(origin+'/about/',token).run();
});
afterEach(()=>vi.restoreAllMocks());
describe('proxy access boundary',()=>{
  it('rejects missing tokens and malformed routes',async()=>{expect((await request('https://review.test/p/review/')).status).toBe(404);});
  it('rejects missing and invalid review tokens without fetching',async()=>{const mock=vi.spyOn(globalThis,'fetch');expect((await request(url.replace(token,'wrong'))).status).toBe(404);expect(mock).not.toHaveBeenCalled();});
  it('rejects expired and disabled links',async()=>{await env.DB.prepare('UPDATE reviews SET expires_at=1').run();expect((await request()).status).toBe(404);await env.DB.prepare('UPDATE reviews SET expires_at=NULL,link_enabled=0').run();expect((await request()).status).toBe(404);});
  it('does not accept an arbitrary destination',async()=>{const mock=vi.spyOn(globalThis,'fetch');expect((await request(url.replace(key,originKey('https://other.example.com')))).status).toBe(403);expect(mock).not.toHaveBeenCalled();});
  it('rejects a network-path escape',async()=>{const mock=vi.spyOn(globalThis,'fetch');const r=await request(`https://review.test${prefix}${key}//evil.example.com/path`);expect(r.status).toBe(400);expect(mock).not.toHaveBeenCalled();});
  it('rejects private, credentialed and unusual-port saved sources',async()=>{for(const value of ['http://127.0.0.1','http://[::1]','http://2130706433','http://foo.internal','http://localhost','https://user:pass@client.example.com','https://client.example.com:8080'])expect(()=>publicOrigin(value)).toThrow();});
  it('supports screenshot-mode fallback without fetching',async()=>{await env.DB.prepare('UPDATE reviews SET screenshot_mode=1').run();const mock=vi.spyOn(globalThis,'fetch');expect((await request()).status).toBe(409);expect(mock).not.toHaveBeenCalled();});
  it('redirects a review entry to its saved page',async()=>{const r=await request('https://review.test'+prefix,{redirect:'manual'});expect(r.status).toBe(302);expect(r.headers.get('location')).toBe(prefix+key+'/about/');});
  it('does not expose app cookies or auth headers to the source',async()=>{const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('ok'));await request(url,{headers:{cookie:'session=private; other=secret',authorization:'Bearer private'}});const options=mock.mock.calls[0][1]!;expect(new Headers(options.headers).get('cookie')).toBeNull();expect(new Headers(options.headers).get('authorization')).toBeNull();expect(options.redirect).toBe('manual');});
});
describe('rewriter',()=>{
  it('rewrites HTML attributes, lazy assets, CSS, srcset, base and injects overlay',async()=>{
    vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(`<!doctype html><html><head><base href="https://escape.example.com/"><style>.hero{background:url('../hero.webp')}</style><meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none'"></head><body><a href="/next?q=1#title">Next</a><img src="/a.jpg" srcset="/a.jpg 1x, /b.jpg 2x" data-src="/lazy.jpg"><form action="/login"><button>Log in</button></form><div style="background:url('/bg.jpg')"></div></body></html>`,{headers:{'content-type':'text/html','x-frame-options':'DENY','content-security-policy':"default-src 'self'; frame-ancestors 'none'"}}));
    const r=await request();const html=await r.text();
    for(const path of ['/next?q=1#title','/a.jpg','/b.jpg','/lazy.jpg','/login','/bg.jpg','/hero.webp'])expect(html).toContain(prefix+key+path);
    expect(html).toContain('ashbi:draft');expect(html).toContain('ashbi:config');expect(html).not.toContain('https://escape.example.com');expect(html).not.toContain('http-equiv="Content-Security-Policy"');
    expect(r.headers.get('x-frame-options')).toBeNull();expect(r.headers.get('content-security-policy')).toContain('sandbox allow-scripts');expect(r.headers.get('content-security-policy')).not.toContain('allow-same-origin');expect(r.headers.get('referrer-policy')).toBe('no-referrer');expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('rewrites CSS URLs and imports',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('@import "../theme.css";x{background:url(../img.png)}',{headers:{'content-type':'text/css'}}));const r=await request(`https://review.test${prefix}${key}/css/main.css`);const css=await r.text();expect(css).toContain(prefix+key+'/theme.css');expect(css).toContain(prefix+key+'/img.png');});
  it('keeps data-image srcset candidates intact',()=>{const result=rewriteSrcset('data:image/png;base64,AAAA 1x, /b.png 2x',x=>x.startsWith('/')?'proxy'+x:x);expect(result).toBe('data:image/png;base64,AAAA 1x, proxy/b.png 2x');});
  it('keeps encoded CSS URLs stable',()=>{expect(rewriteCss('url("data:image/png;base64,AAAA")',x=>x)).toBe('url("data:image/png;base64,AAAA")');});
  it('rewrites only saved external resource origins',async()=>{await env.DB.prepare('UPDATE reviews SET allowed_origins=?').bind(JSON.stringify(['https://cdn.example.com'])).run();vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('<img src="https://cdn.example.com/a.jpg"><a href="https://unsaved.example.com/">External</a>',{headers:{'content-type':'text/html'}}));const html=await(await request()).text();expect(html).toContain(prefix+originKey('https://cdn.example.com')+'/a.jpg');expect(html).toContain('href="https://unsaved.example.com/"');});
  it('rewrites same-origin redirects and blocks unsaved redirects',async()=>{const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(null,{status:302,headers:{location:'/login'}}));const r=await request(url,{redirect:'manual'});expect(r.headers.get('location')).toBe(prefix+key+'/login');mock.mockImplementation(async()=>new Response(null,{status:302,headers:{location:'https://unsaved.example.com/login'}}));expect((await request(url,{redirect:'manual'})).status).toBe(409);});
  it('allows a saved HTTP site to upgrade to HTTPS on the same host',async()=>{
    const http='http://client.example.com';
    await env.DB.prepare('UPDATE reviews SET source_url=?').bind(http+'/about/').run();
    const fetchSite=vi.spyOn(globalThis,'fetch').mockImplementationOnce(async()=>new Response(null,{status:301,headers:{location:origin+'/about/'}})).mockImplementationOnce(async()=>new Response('Secure site'));
    const redirected=await request(url.replace(key,originKey(http)),{redirect:'manual'});
    expect(redirected.status).toBe(301);
    expect(redirected.headers.get('location')).toBe(prefix+key+'/about/');
    expect(await (await request()).text()).toBe('Secure site');
    expect(String(fetchSite.mock.calls.at(-1)?.[0])).toBe(origin+'/about/');
    fetchSite.mockImplementationOnce(async()=>new Response(null,{status:302,headers:{location:'https://other.example.com/'}}));
    const blocked=await request(url,{redirect:'manual'});
    expect(blocked.status).toBe(409);
    expect(await blocked.text()).toContain('ashbi:preview-error');
    expect(blocked.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });
  it('scopes Set-Cookie to review and origin, restoring original names upstream',async()=>{const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('ok',{headers:{'set-cookie':'__Host-session=secret; Path=/; Domain=client.example.com; Secure; SameSite=None; Max-Age=300'}}));const r=await request();const cookie=r.headers.get('set-cookie')!;expect(cookie).toContain(`Path=${prefix}${key}/`);expect(cookie).not.toContain('Domain=');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Max-Age=300');await request(url,{headers:{cookie:cookie.split(';')[0]+'; session=app-secret'}});expect(new Headers(mock.mock.calls[1][1]!.headers).get('cookie')).toBe('__Host-session=secret');});
  it('does not cache private HTML or forward origin security side effects',async()=>{vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('ok',{headers:{'clear-site-data':'"*"','service-worker-allowed':'/','refresh':'0;url=https://evil.example.com','cache-control':'public, max-age=3600'}}));const r=await request();for(const key of ['clear-site-data','service-worker-allowed','refresh'])expect(r.headers.has(key)).toBe(false);expect(r.headers.get('cache-control')).toBe('no-store');});
  it('preserves query strings without interpreting URL parameters as destinations',async()=>{const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('ok'));await request(url+'?url=https://other.example.com&x=1');expect(String(mock.mock.calls[0][0])).toBe(origin+'/about/?url=https://other.example.com&x=1');});
  it('handles upstream errors as a screenshot fallback',async()=>{vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('network'));expect((await request()).status).toBe(502);});
  it('forwards bounded staging forms but rejects unrelated request origins',async()=>{const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response('ok'));const headers={'origin':'null','content-type':'application/x-www-form-urlencoded','content-length':'10'};expect((await request(url,{method:'POST',headers,body:'password=x'})).status).toBe(200);expect(new Headers(mock.mock.calls[0][1]!.headers).get('origin')).toBe(origin);expect((await request(url,{method:'POST',headers:{...headers,origin:'https://evil.example.com'},body:'password=x'})).status).toBe(403);});
  it('blocks unsupported methods',async()=>{expect((await request(url,{method:'DELETE'})).status).toBe(405);});
});
