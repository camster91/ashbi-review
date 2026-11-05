import {env,SELF} from 'cloudflare:test';
import {expect,it,vi} from 'vitest';
import {capturePin,captureReview,captureTarget} from '../worker/screenshots';
import {createPin} from '../worker/feedback';
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6RsAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
const headers={authorization:'Bearer local-workers-test-key-only-32-characters-minimum'};
async function fixture(){const p=crypto.randomUUID(),id=crypto.randomUUID();await env.DB.prepare('INSERT INTO projects(id,name,client_name) VALUES(?,?,?)').bind(p,'Captures','QA').run();await env.DB.prepare("INSERT INTO reviews(id,project_id,type,source_url,share_token,name) VALUES(?,?,'site','https://client.example.com/',?,'Capture QA')").bind(id,p,crypto.randomUUID()).run();return {id,type:'site',source_url:'https://client.example.com/',screenshot_mode:0,screenshot_key:null,screenshot_width:null,screenshot_path:null};}
it('only captures paths on the saved public origin at supported widths',async()=>{const r=await fixture();expect(captureTarget(r,'/page?q=1',390).href).toBe('https://client.example.com/page?q=1');for(const p of ['//evil.com','/\\evil.com'])expect(()=>captureTarget(r,p,390)).toThrow();expect(()=>captureTarget(r,'/',500)).toThrow();});
it('stores full-page Browser Rendering captures privately in R2 and reuses the image pin layer',async()=>{
 const review=await fixture();const quickAction=vi.fn(async(_action:string,_options:unknown)=>new Response(png,{headers:{'content-type':'image/png'}}));const runtime={...env,BROWSER:{quickAction}};
 const key=await captureReview(runtime,review.id,'/design',390);expect(quickAction).toHaveBeenCalledWith('screenshot',expect.objectContaining({url:'https://client.example.com/design',viewport:expect.objectContaining({width:390}),screenshotOptions:{type:'png',fullPage:true}}));expect((await env.FILES.get(key))!.httpMetadata!.contentType).toBe('image/png');
 const saved=await env.DB.prepare('SELECT * FROM reviews WHERE id=?').bind(review.id).first<typeof review>();const pin=await createPin(runtime,saved!,{x_pct:25,y_pct:40,body:'Captured page feedback',capture_version:key.split('/').at(-1)},{name:'Guest'});expect(await capturePin(runtime,pin!.id)).toBe(true);expect(quickAction).toHaveBeenCalledTimes(1);await expect(createPin(runtime,saved!,{x_pct:20,y_pct:40,body:'Stale capture',capture_version:'old.png'},{name:'Guest'})).rejects.toThrow('changed');
 const persisted=await env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(pin!.id).first();expect(persisted).toMatchObject({screenshot_key:key,screenshot_status:'saved',page_path:'/design',viewport:390,page_x_pct:25,page_y_pct:40});
 const privateRead=await SELF.fetch(`http://localhost/api/reviews/${review.id}/snapshot`,{headers});expect(privateRead.status).toBe(200);expect(privateRead.headers.get('cache-control')).toContain('no-store');expect((await SELF.fetch(`https://review.ashbi.ca/api/pins/${pin!.id}/screenshot`)).status).toBe(401);
});
it('capture failures leave persistent feedback intact and can be retried',async()=>{
 const review=await fixture();const pin=await createPin(env,review,{x_pct:10,y_pct:20,page_x_pct:10,page_y_pct:20,page_path:'/',selector:'#hero',viewport:768,scroll_y:0,body:'Do not lose this feedback'},{name:'QA'});
 const failed={...env,BROWSER:{quickAction:async()=>new Response('unavailable',{status:503})}};expect(await capturePin(failed,pin!.id)).toBe(false);expect((await env.DB.prepare('SELECT screenshot_status FROM pins WHERE id=?').bind(pin!.id).first())!.screenshot_status).toBe('failed');expect((await env.DB.prepare('SELECT body FROM comments WHERE pin_id=?').bind(pin!.id).first())!.body).toBe('Do not lose this feedback');
 const success={...env,BROWSER:{quickAction:async()=>new Response(png)}};expect(await capturePin(success,pin!.id)).toBe(true);expect((await env.DB.prepare('SELECT screenshot_status FROM pins WHERE id=?').bind(pin!.id).first())!.screenshot_status).toBe('saved');
});
it('keeps the validated snapshot through a refresh, delayed processing and retries',async()=>{
 const review=await fixture();
 const quickAction=vi.fn(async()=>new Response(png));
 const runtime={...env,BROWSER:{quickAction}};
 const original=await captureReview(runtime,review.id,'/',390);
 const saved=await env.DB.prepare('SELECT * FROM reviews WHERE id=?').bind(review.id).first<typeof review>();
 const version=original.split('/').at(-1);
 const pin=await createPin(runtime,saved!,{x_pct:25,y_pct:40,body:'Original feedback',capture_version:version},{name:'Guest'});
 expect(pin).toMatchObject({screenshot_key:original,screenshot_status:'saved'});

 const refreshed=await captureReview(runtime,review.id,'/',390);
 expect(refreshed).not.toBe(original);
 expect(await capturePin(runtime,pin!.id)).toBe(true);
 expect(await capturePin(runtime,pin!.id,false)).toBe(true);
 expect(quickAction).toHaveBeenCalledTimes(2);
 expect(await env.DB.prepare('SELECT screenshot_key FROM pins WHERE id=?').bind(pin!.id).first()).toMatchObject({screenshot_key:original});
 expect((await SELF.fetch(`http://localhost/api/reviews/${review.id}/snapshot?v=${version}`,{headers})).status).toBe(404);
 expect((await SELF.fetch(`http://localhost/api/pins/${pin!.id}/screenshot`,{headers})).status).toBe(200);

 // Simulate feedback written before the fix whose original key was never saved.
 await env.DB.prepare("UPDATE pins SET screenshot_key=NULL,screenshot_status='pending' WHERE id=?").bind(pin!.id).run();
 expect(await capturePin(runtime,pin!.id)).toBe(false);
 expect(await env.DB.prepare('SELECT screenshot_key,screenshot_status FROM pins WHERE id=?').bind(pin!.id).first()).toMatchObject({screenshot_key:null,screenshot_status:'failed'});
 expect(await env.DB.prepare('SELECT body FROM comments WHERE pin_id=?').bind(pin!.id).first()).toMatchObject({body:'Original feedback'});
 expect(quickAction).toHaveBeenCalledTimes(2);
});

it('keeps a live pin capture stable when a delayed attempt overlaps a successful retry',async()=>{
 const review=await fixture();
 const pin=await createPin(env,review,{x_pct:10,y_pct:20,page_x_pct:10,page_y_pct:20,page_path:'/',selector:'#hero',viewport:768,scroll_y:0,body:'Live feedback'},{name:'QA'});
 const success={...env,BROWSER:{quickAction:async()=>new Response(png)}};
 const snapshot=await captureReview(success,review.id,'/',768);
 let markStarted!:()=>void;
 const started=new Promise<void>(resolve=>{markStarted=resolve;});
 let finish!:(response:Response)=>void;
 const response=new Promise<Response>(resolve=>{finish=resolve;});
 const delayed=capturePin({...env,BROWSER:{quickAction:()=>{markStarted();return response;}}},pin!.id);
 await started;
 expect(await capturePin(success,pin!.id)).toBe(true);
 const readPin=()=>env.DB.prepare('SELECT screenshot_key,screenshot_status FROM pins WHERE id=?').bind(pin!.id).first();
 const winning=await readPin();
 expect(winning).toMatchObject({screenshot_key:expect.any(String),screenshot_status:'saved'});
 expect(winning?.screenshot_key).not.toBe(snapshot);
 finish(new Response(png));
 expect(await delayed).toBe(true);
 expect(await readPin()).toEqual(winning);
});
