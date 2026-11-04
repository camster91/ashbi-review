import {SELF,env} from 'cloudflare:test';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {hashToken,sessionCookie} from '../worker/auth';
import {sendCommentDigest} from '../worker/email';
const replies:{status:number;body:unknown;capture?:(options:RequestInit)=>unknown}[]=[];
const mockEmail=(status:number,body:unknown,capture?:(options:RequestInit)=>unknown)=>replies.push({status,body,capture});
const local={authorization:'Bearer local-workers-test-key-only-32-characters-minimum','content-type':'application/json'};
const json={'content-type':'application/json'};
const call=(path:string,data:unknown,headers:Record<string,string>=json)=>SELF.fetch('https://review.ashbi.ca/api'+path,{method:'POST',headers,body:JSON.stringify(data)});
beforeEach(async()=>{replies.length=0;vi.spyOn(globalThis,'fetch').mockImplementation(async(input,options={})=>{expect(String(input)).toBe('https://api.resend.com/emails');const reply=replies.shift();if(!reply)throw new Error('Unexpected email request');reply.capture?.(options);return new Response(JSON.stringify(reply.body),{status:reply.status,headers:{'content-type':'application/json'}});});await env.DB.batch(['notification_queue','email_batches','comments','pins','guests','reviews','projects','sessions','login_tokens','login_throttle'].map(t=>env.DB.prepare('DELETE FROM '+t)));});
afterEach(()=>{expect(replies).toHaveLength(0);vi.restoreAllMocks();});
it('only emails approved accounts, throttles requests and consumes magic links once',async()=>{
 let sent='';mockEmail(200,{id:'magic-email'},options=>{sent=String(options.body);});
 expect((await call('/auth/request',{email:'stranger@example.com'})).status).toBe(202);
 expect((await call('/auth/request',{email:'bianca@ashbi.ca'})).status).toBe(202);
 expect((await call('/auth/request',{email:'bianca@ashbi.ca'})).status).toBe(202);
 const raw=sent.match(/#login=([a-f0-9]{64})/)![1];expect(raw).toHaveLength(64);
 expect((await env.DB.prepare('SELECT token_hash FROM login_tokens').first<{token_hash:string}>())!.token_hash).toBe(await hashToken(raw));
 const login=await call('/auth/consume',{token:raw});expect(login.status).toBe(200);const cookie=login.headers.get('set-cookie')!.split(';')[0];expect(login.headers.get('set-cookie')).toContain('HttpOnly');expect(login.headers.get('set-cookie')).toContain('Secure');
 const me=await SELF.fetch('https://review.ashbi.ca/api/auth/me',{headers:{cookie}});expect(await me.json()).toMatchObject({user:{name:'Bianca',email:'bianca@ashbi.ca'}});
 const rejected=await SELF.fetch('https://review.ashbi.ca/api/projects',{method:'POST',headers:{...json,cookie,origin:'null'},body:JSON.stringify({client_name:'Bad',name:'Bad'})});expect(rejected.status).toBe(403);
 expect((await call('/auth/consume',{token:raw})).status).toBe(401);
 expect((await call('/auth/logout',{}, {...json,cookie})).status).toBe(200);
 expect((await SELF.fetch('https://review.ashbi.ca/api/projects',{headers:{cookie}})).status).toBe(401);
});
it('rejects expired links and unrelated origins',async()=>{
 const raw='a'.repeat(64);await env.DB.prepare('INSERT INTO login_tokens VALUES(?,?,0)').bind(await hashToken(raw),'cameron').run();expect((await call('/auth/consume',{token:raw})).status).toBe(401);
 expect((await call('/auth/request',{email:'cameron@ashbi.ca'},{...json,origin:'https://evil.example.com'})).status).toBe(403);
});
async function shared(){
 const p=crypto.randomUUID(),r=crypto.randomUUID(),token=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO projects(id,name,client_name) VALUES(?,?,?)').bind(p,'Guest test','QA').run();
 await env.DB.prepare("INSERT INTO reviews(id,project_id,type,r2_key,share_token,name) VALUES(?,?,'image','qa.png',?,'QA design')").bind(r,p,token).run();
 const prefix=`/guest/${r}/${token}`;return {r,token,prefix};
}
async function joined(prefix:string){const join=await call(prefix+'/join',{name:'Client QA',email:'client@example.com'});expect(join.status).toBe(201);return join.headers.get('set-cookie')!.split(';')[0];}
it('remembers guest identity, scopes replies and prevents resolve/operator access',async()=>{
 const {r,prefix}=await shared();const cookie=await joined(prefix);const headers={...json,cookie};
 const save=await call(prefix+'/pins',{x_pct:20,y_pct:30,author_name:'Impersonation',body:'Client feedback'},headers);expect(save.status).toBe(201);const pin=(await save.json() as {pin:{id:string}}).pin;
 const read=await SELF.fetch('https://review.ashbi.ca/api'+prefix+'/review',{headers});const data=await read.json() as {guest:{name:string};comments:Record<string,unknown>[]};expect(data.guest.name).toBe('Client QA');expect(data.comments[0].author_name).toBe('Client QA');expect(data.comments[0].author_email).toBeUndefined();
 expect((await call(prefix+`/pins/${pin.id}/comments`,{body:'More detail'},headers)).status).toBe(201);
 expect((await SELF.fetch('https://review.ashbi.ca/api'+prefix+`/pins/${pin.id}`,{method:'PATCH',headers,body:JSON.stringify({status:'resolved'})})).status).toBe(401);
 expect((await SELF.fetch('https://review.ashbi.ca/api/projects',{headers})).status).toBe(401);
 const other=await shared();expect((await call(other.prefix+`/pins/${pin.id}/comments`,{body:'Cross review'},headers)).status).toBe(401);
 await env.DB.prepare('UPDATE reviews SET link_enabled=0 WHERE id=?').bind(r).run();expect((await SELF.fetch('https://review.ashbi.ca/api'+prefix+'/review',{headers})).status).toBe(404);
});
it('sends one frozen digest for new guest comments and stays quiet afterward',async()=>{
 const {prefix}=await shared(),cookie=await joined(prefix);for(let n=0;n<3;n++)expect((await call(prefix+'/pins',{x_pct:n,y_pct:n,body:'Feedback '+n},{...json,cookie})).status).toBe(201);
 let sent='';mockEmail(200,{id:'digest-email'},options=>{sent=String(options.body);});
 await sendCommentDigest(env,Date.now());expect(JSON.parse(sent)).toMatchObject({to:['bianca@ashbi.ca','cameron@ashbi.ca'],subject:'3 new comments in Ashbi Review'});
 await sendCommentDigest(env,Date.now());expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(0);
 expect((await env.DB.prepare('SELECT count(*) AS n FROM email_batches WHERE sent_at IS NOT NULL').first<{n:number}>())!.n).toBe(1);
});
it('retains queued feedback on provider failures and reuses the frozen retry',async()=>{
 const {prefix}=await shared(),cookie=await joined(prefix);await call(prefix+'/pins',{x_pct:1,y_pct:1,body:'Keep this queued'},{...json,cookie});
 mockEmail(503,{error:'temporary'});await expect(sendCommentDigest(env,Date.now())).rejects.toThrow();
 expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(1);
 mockEmail(200,{id:'retried'});await sendCommentDigest(env,Date.now());expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(0);
});
it('expiry blocks shared reads and comments; operator can switch off links',async()=>{
 const {r,prefix}=await shared(),cookie=await joined(prefix);await env.DB.prepare('UPDATE reviews SET expires_at=0 WHERE id=?').bind(r).run();expect((await call(prefix+'/pins',{x_pct:1,y_pct:1,body:'Expired'},{...json,cookie})).status).toBe(404);
 const result=await SELF.fetch(`http://localhost/api/reviews/${r}/share`,{method:'PATCH',headers:local,body:JSON.stringify({link_enabled:false,expires_at:null})});expect(result.status).toBe(200);
});
it('keeps quiet without sender configuration and claims one concurrent digest',async()=>{
 const {prefix}=await shared(),cookie=await joined(prefix);await call(prefix+'/pins',{x_pct:1,y_pct:1,body:'One digest'},{...json,cookie});
 await sendCommentDigest({...env,RESEND_API_KEY:undefined},Date.now());expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(1);
 mockEmail(200,{id:'one-concurrent'});await Promise.all([sendCommentDigest(env,Date.now()),sendCommentDigest(env,Date.now())]);
 await call(prefix+'/pins',{x_pct:2,y_pct:2,body:'Next interval'},{...json,cookie});await sendCommentDigest(env,Date.now());expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(1);
 mockEmail(200,{id:'next-interval'});await sendCommentDigest(env,Date.now()+900000);
 expect((await env.DB.prepare('SELECT count(*) AS n FROM notification_queue').first<{n:number}>())!.n).toBe(0);
});
