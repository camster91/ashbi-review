import {Hono} from 'hono';
import {getCookie,setCookie} from 'hono/cookie';
import type {Env} from './index';
import {hashToken,randomToken,validOrigin} from './auth';
import {jsonBody,text,email} from './input';
import {InputError} from './images';
import {captureForRequest} from './screenshots';
import {createPin,createReply,reviewData,imageResponse} from './feedback';
type SharedReview={id:string;project_id:string;name:string;type:string;source_url:string|null;share_token:string;screenshot_mode:number;r2_key:string|null;expires_at:number|null;link_enabled:number;screenshot_key:string|null;screenshot_width:number|null;screenshot_path:string|null};
type Guest={id:string;name:string;email:string|null};
export const guestsApi=new Hono<{Bindings:Env;Variables:{review:SharedReview;guest:Guest|null}}>();
guestsApi.use('/:reviewId/:token/*',async(c,next)=>{
 c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');
 if(!validOrigin(c.req.raw))return c.json({error:'Invalid request origin.'},403);
 const review=await c.env.DB.prepare('SELECT * FROM reviews WHERE id=? AND share_token=? AND link_enabled=1 AND(expires_at IS NULL OR expires_at>unixepoch())').bind(c.req.param('reviewId'),c.req.param('token')).first<SharedReview>();
 if(!review)return c.json({error:'This review link is unavailable or has expired.'},404);
 c.set('review',review);const token=getCookie(c,'ashbi_guest');const guest=token&&token.length===64?await c.env.DB.prepare('SELECT id,name,email FROM guests WHERE review_id=? AND token=?').bind(review.id,await hashToken(token)).first<Guest>():null;
 c.set('guest',guest);await next();
});
guestsApi.onError((error,c)=>{if(error instanceof InputError)return c.json({error:error.message},error.status);console.error('Guest review operation failed',{name:error.name});return c.json({error:'Could not save your change. Please try again.'},500);});
guestsApi.get('/:reviewId/:token/review',async c=>c.json({...await reviewData(c.env,c.get('review')),guest:c.get('guest')?{name:c.get('guest')!.name}:null}));
guestsApi.get('/:reviewId/:token/image',async c=>{const review=c.get('review');return review.type==='image'&&review.r2_key?imageResponse(c.env,review.r2_key):c.json({error:'Image not found.'},404);});
guestsApi.post('/:reviewId/:token/join',async c=>{
 const data=await jsonBody(c.req.raw),name=text(data.name,'Name',120),address=email(data.email),raw=randomToken();
 const existing=c.get('guest');if(existing){await c.env.DB.prepare('UPDATE guests SET name=?,email=? WHERE id=?').bind(name,address,existing.id).run();return c.json({guest:{name}});}
 await c.env.DB.prepare('INSERT INTO guests(id,review_id,name,email,token) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),c.get('review').id,name,address,await hashToken(raw)).run();
 setCookie(c,'ashbi_guest',raw,{httpOnly:true,secure:true,sameSite:'Lax',path:`/api/guest/${c.get('review').id}/`,maxAge:31536000});return c.json({guest:{name}},201);
});
guestsApi.post('/:reviewId/:token/pins',async c=>{const guest=c.get('guest');if(!guest)return c.json({error:'Add your name to leave feedback.'},401);const pin=await createPin(c.env,c.get('review'),await jsonBody(c.req.raw),{name:guest.name,email:guest.email,notify:true});if(pin&&c.get('review').type==='site')c.executionCtx.waitUntil(captureForRequest(c.env,pin.id,c.req.url));return c.json({pin},201);});
guestsApi.post('/:reviewId/:token/pins/:pinId/comments',async c=>{
 const guest=c.get('guest');if(!guest)return c.json({error:'Add your name to leave feedback.'},401);
 const pin=await c.env.DB.prepare('SELECT id FROM pins WHERE id=? AND review_id=?').bind(c.req.param('pinId'),c.get('review').id).first<{id:string}>();if(!pin)return c.json({error:'Pin not found.'},404);
 const comment=await createReply(c.env,pin.id,await jsonBody(c.req.raw),{name:guest.name,email:guest.email,notify:true});return c.json({comment},201);
});

guestsApi.get('/:reviewId/:token/snapshot',async c=>{const review=c.get('review');const version=c.req.query('v');return review.screenshot_key&&(version===undefined||version===review.screenshot_key.split('/').at(-1))?imageResponse(c.env,review.screenshot_key):c.json({error:'Capture not found.'},404);});
guestsApi.get('/:reviewId/:token/pins/:pinId/screenshot',async c=>{const pin=await c.env.DB.prepare('SELECT screenshot_key FROM pins WHERE id=? AND review_id=?').bind(c.req.param('pinId'),c.get('review').id).first<{screenshot_key:string|null}>();return pin?.screenshot_key?imageResponse(c.env,pin.screenshot_key):c.json({error:'Capture not found.'},404);});
