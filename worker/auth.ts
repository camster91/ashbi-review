import {Hono} from 'hono';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import type {Env} from './index';
import {isLocalOperator} from './operator';
import {jsonBody,email,text} from './input';
import {InputError} from './images';
import {sendEmail} from './email';
export type User={id:string;name:string;email:string;local?:boolean};
export const sessionCookie='__Host-ashbi_session';
export const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export async function hashToken(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export function cookies(request:Request,name:string){return request.headers.get('cookie')?.split(/;\s*/).find(c=>c.startsWith(name+'='))?.slice(name.length+1);}
export function validOrigin(request:Request){const origin=request.headers.get('origin');if(!origin)return true;try{return new URL(request.url).origin===origin;}catch{return false;}}
export async function operator(request:Request,env:Env):Promise<User|null>{
 if(await isLocalOperator(request,env.DEV_OPERATOR_TOKEN))return {id:'local',name:'Cameron',email:'cameron@ashbi.ca',local:true};
 const token=cookies(request,sessionCookie);if(!token||token.length!==64)return null;
 return env.DB.prepare('SELECT users.id,users.name,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>unixepoch()').bind(await hashToken(token)).first<User>();
}
export const authApi=new Hono<{Bindings:Env}>();
authApi.use('*',async(c,next)=>{c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');if(!validOrigin(c.req.raw))return c.json({error:'Invalid request origin.'},403);await next();});
authApi.onError((error,c)=>{if(error instanceof InputError)return c.json({error:error.message},error.status);console.error('Sign-in operation failed',{name:error.name});return c.json({error:'Sign-in is temporarily unavailable. Please try again.'},503);});
authApi.get('/me',async c=>{const user=await operator(c.req.raw,c.env);return user?c.json({user}):c.json({error:'Sign in to open your workspace.'},401);});
authApi.post('/request',async c=>{
 const data=await jsonBody(c.req.raw);const address=email(data.email);if(!address)throw new InputError('Enter your email address.');
 if(!c.env.EMAIL||!c.env.EMAIL_FROM)return c.json({error:'Email sign-in is not configured yet.'},503);
 const user=await c.env.DB.prepare('SELECT * FROM users WHERE email=?').bind(address).first<User>();
 if(user){
  const throttle=await c.env.DB.prepare('INSERT INTO login_throttle(user_id,requested_at) VALUES(?,unixepoch()) ON CONFLICT(user_id) DO UPDATE SET requested_at=excluded.requested_at WHERE requested_at<unixepoch()-60 RETURNING user_id').bind(user.id).first();
  if(throttle){const raw=randomToken(),hash=await hashToken(raw);await c.env.DB.prepare('INSERT INTO login_tokens(token_hash,user_id,expires_at) VALUES(?,?,unixepoch()+900)').bind(hash,user.id).run();
   try{await sendEmail(c.env,[user.email],'Sign in to Ashbi Review',`Open this link to sign in as ${user.name}. It expires in 15 minutes and works once.\n\n${c.env.APP_ORIGIN??'https://review.ashbi.ca'}/#login=${raw}`);}catch(error){await c.env.DB.prepare('DELETE FROM login_tokens WHERE token_hash=?').bind(hash).run();throw error;}
  }
 }
 return c.json({message:'If this address has access, a sign-in link is on its way.'},202);
});
authApi.post('/consume',async c=>{
 const data=await jsonBody(c.req.raw);const token=text(data.token,'Sign-in link',64);if(token.length!==64)throw new InputError('This sign-in link is invalid.');
 const raw=randomToken(),hash=await hashToken(raw),loginHash=await hashToken(token);
 const result=await c.env.DB.batch([c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) SELECT ?,user_id,unixepoch()+2592000 FROM login_tokens WHERE token_hash=? AND expires_at>unixepoch() RETURNING user_id').bind(hash,loginHash),c.env.DB.prepare('DELETE FROM login_tokens WHERE token_hash=?').bind(loginHash)]);
 if(!result[0].results.length)return c.json({error:'This link has expired or was already used. Request a new one.'},401);
 setCookie(c,sessionCookie,raw,{httpOnly:true,secure:true,sameSite:'Lax',path:'/',maxAge:2592000});return c.json({ok:true});
});
authApi.post('/logout',async c=>{const token=getCookie(c,sessionCookie);if(token)await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hashToken(token)).run();deleteCookie(c,sessionCookie,{path:'/',secure:true});return c.json({ok:true});});
