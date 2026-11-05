import { Hono } from 'hono';
import type { Env } from './index';
import { siteOverlay } from './site-overlay';

interface Review { id: string; source_url: string; share_token: string; expires_at: number | null; screenshot_mode: number; link_enabled: number; allowed_origins: string }
// A review's saved source and explicitly saved resource origins are the only destinations.
// The client never supplies an arbitrary fetch URL or changes this allowlist.
export function publicOrigin(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      (url.port && !['80','443'].includes(url.port)) || !host.includes('.') ||
      /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) throw new Error('Public HTTP(S) origin required');
  return url;
}
export function originKey(origin: string) { return btoa(origin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export function proxyUrl(target: URL, prefix: string) { return `${prefix}${originKey(target.origin)}${target.pathname}${target.search}${target.hash}`; }
export function rewriteUrl(raw: string, base: URL, prefix: string, allowed: Set<string>): string {
  if (!raw.trim() || /^(?:#|data:|blob:|mailto:|tel:)/i.test(raw.trim())) return raw;
  try { const target=publicOrigin(new URL(raw,base).href); return allowed.has(target.origin) ? proxyUrl(target,prefix) : target.href; }
  catch { return '#'; }
}
export function rewriteCss(css: string, rewrite: (s:string)=>string) {
  return css.replace(/url\(\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^)'"\s]*))\s*\)/gi, (_m,a,b,c)=>`url("${rewrite(a??b??c).replace(/"/g,'%22')}")`)
    .replace(/(@import\s+)(["'])(.*?)\2/gi,(_m,a,_q,s)=>`${a}"${rewrite(s).replace(/"/g,'%22')}"`);
}
export function rewriteSrcset(value:string,rewrite:(s:string)=>string) {
  // Data URLs contain commas; consume them as one candidate up to whitespace.
  return value.replace(/(^|,\s*)(data:[^\s]+|[^\s,]+)(\s+[^,]+)?/g,(_m,sep,url,descriptor)=>`${sep}${rewrite(url)}${descriptor??''}`);
}
export function rewriteCookie(cookie:string,prefix:string,key:string):string|null {
  const [pair,...attributes]=cookie.split(';');
  const eq=pair.indexOf('='); if(eq<1)return null;
  const name=pair.slice(0,eq).trim();
  if(!/^[!#$%&'*+.^_`|~\w-]+$/.test(name))return null;
  const kept=attributes.filter(x=>!/^\s*(domain|path|samesite|secure|httponly)(?:\s*=|\s*$)/i.test(x));
  return `ar_${key}_${originKey(name)}=${pair.slice(eq+1)};${kept.join(';')}; Path=${prefix}${key}/; HttpOnly; Secure; SameSite=Lax`;
}
function originCookies(header:string,key:string) {
  const start=`ar_${key}_`;
  return header.split(/;\s*/).filter(x=>x.startsWith(start)).map(x=>{const pair=x.slice(start.length);const i=pair.indexOf('=');try{return atob(pair.slice(0,i).replace(/-/g,'+').replace(/_/g,'/'))+pair.slice(i);}catch{return '';}}).filter(Boolean).join('; ');
}
function safeHeaders(headers:Headers) {
  const h=new Headers(headers);
  for(const key of ['x-frame-options','content-security-policy','content-security-policy-report-only','content-length','content-encoding','etag','last-modified','set-cookie','access-control-allow-origin','access-control-allow-credentials','service-worker-allowed','refresh','clear-site-data','report-to','nel','link'])h.delete(key);
  h.set('Cache-Control','no-store'); h.set('Referrer-Policy','no-referrer'); h.set('X-Robots-Tag','noindex, nofollow');
  // No allow-same-origin: untrusted site scripts cannot access the dashboard origin,
  // credentials, local storage, or register a service worker.
  h.set('Content-Security-Policy',"sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'; worker-src 'none'");
  h.set('X-Content-Type-Options','nosniff');
  return h;
}

export const proxy = new Hono<{ Bindings: Env }>();
proxy.all('/:reviewId/:token/*',async c=>{
  const {reviewId,token}=c.req.param();
  const review=await c.env.DB.prepare("SELECT * FROM reviews WHERE id=? AND type='site' AND share_token=?").bind(reviewId,token).first<Review>();
  if(!review || !review.link_enabled || (review.expires_at!==null && review.expires_at<=Date.now()/1000))return c.text('Review unavailable',404);
  if(review.screenshot_mode)return c.text('This review uses screenshot mode.',409);
  let source:URL; let allowed:Set<string>;
  try { source=publicOrigin(review.source_url); allowed=new Set([source.origin,...(JSON.parse(review.allowed_origins) as string[]).map(x=>publicOrigin(x).origin)]); }
  catch { return c.text('Invalid saved source',422); }
  const prefix=`/p/${encodeURIComponent(reviewId)}/${encodeURIComponent(token)}/`;
  const incoming=new URL(c.req.url);
  const rest=incoming.pathname.slice(prefix.length);
  if(!rest)return c.redirect(proxyUrl(source,prefix),302);
  const slash=rest.indexOf('/');
  if(slash<0)return c.text('Invalid proxy path',400);
  const key=rest.slice(0,slash);
  let origin:string;
  try {origin=atob(key.replace(/-/g,'+').replace(/_/g,'/'));} catch {return c.text('Invalid origin',400);}
  if(!allowed.has(origin))return c.text('Origin is not saved on this review',403);
  const target=new URL(rest.slice(slash)+incoming.search,origin);
  if(target.origin!==origin)return c.text('Invalid path',400);
  if(!['GET','HEAD','POST'].includes(c.req.method))return c.text('Method not supported',405);
  const h=new Headers();
  for(const name of ['accept','accept-language','content-type','user-agent']){const v=c.req.header(name);if(v)h.set(name,v);}
  const cookies=originCookies(c.req.header('cookie')??'',key);if(cookies)h.set('cookie',cookies);
  if(c.req.method==='POST'){
    // Only browser submissions from a sandboxed proxy or the dashboard are accepted.
    const originHeader=c.req.header('origin');if(originHeader!=='null' && originHeader!==incoming.origin)return c.text('Invalid request origin',403);
    const length=Number(c.req.header('content-length'));if(!Number.isFinite(length)||length>1024*1024)return c.text('Form too large',413);
    h.set('origin',target.origin);h.set('referer',target.href);
  }
  const body=c.req.method==='POST'?await c.req.arrayBuffer():undefined;
  if(body && body.byteLength>1024*1024)return c.text('Form too large',413);
  let upstream:Response;
  try {upstream=await fetch(target,{method:c.req.method,headers:h,body,redirect:'manual',signal:AbortSignal.timeout(20000)});}
  catch {return c.text('Origin unavailable. Use screenshot mode for this site.',502);}
  const headers=safeHeaders(upstream.headers);
  const rewrite=(s:string)=>rewriteUrl(s,target,prefix,allowed);
  for(const cookie of upstream.headers.getSetCookie()){const v=rewriteCookie(cookie,prefix,key);if(v)headers.append('set-cookie',v);}
  const location=upstream.headers.get('location');
  if(location){
    let destination:URL;try{destination=publicOrigin(new URL(location,target).href);}catch{return c.text('Invalid origin redirect',502);}
    if(!allowed.has(destination.origin))return c.text('Redirect leaves the saved review origins. Save the destination origin or use screenshot mode.',409);
    headers.set('location',proxyUrl(destination,prefix));
  }
  const type=headers.get('content-type')??'';
  if(c.req.method==='HEAD'||[204,304].includes(upstream.status))return new Response(null,{status:upstream.status,headers});
  if(type.includes('text/css'))return new Response(rewriteCss(await upstream.text(),rewrite),{status:upstream.status,headers});
  const response=new Response(upstream.body,{status:upstream.status,headers});
  if(!type.includes('text/html'))return response;
  let styleText='';
  const rewriter=new HTMLRewriter().on('*',{element(el){
    for(const attribute of ['href','src','action','poster','data-src','data-lazy-src','data-bg']){
      const value=el.getAttribute(attribute);if(value!==null)el.setAttribute(attribute,rewrite(value));
    }
    for(const attribute of ['srcset','data-srcset','data-lazy-srcset']){const v=el.getAttribute(attribute);if(v)el.setAttribute(attribute,rewriteSrcset(v,rewrite));}
    const style=el.getAttribute('style');if(style)el.setAttribute('style',rewriteCss(style,rewrite));
    if(el.tagName==='base')el.remove();
    if(el.tagName==='meta' && ['content-security-policy','refresh'].includes((el.getAttribute('http-equiv')??'').toLowerCase()))el.remove();
    // Transformed resources no longer match upstream integrity hashes.
    el.removeAttribute('integrity');
  }}).on('style',{element(){styleText='';},text(chunk){styleText+=chunk.text;chunk.remove();if(chunk.lastInTextNode){chunk.after(rewriteCss(styleText,rewrite),{html:true});styleText='';}}})
    .on('head',{element(el){el.prepend(`<base href="${proxyUrl(target,prefix).replace(/&/g,'&amp;').replace(/"/g,'&quot;')}">`,{html:true});}})
    .onDocument({end(end){end.append(`<script>${siteOverlay(incoming.origin)}</script>`,{html:true});}});
  return rewriter.transform(response);
});
