import type {Env} from './index';
import {publicOrigin} from './proxy';
import {imageType,readBounded,MAX_IMAGE_BYTES,InputError} from './images';
type CaptureReview={id:string;type:string;source_url:string;screenshot_mode:number;screenshot_key:string|null;screenshot_width:number|null;screenshot_path:string|null};
export function captureTarget(review:CaptureReview,path:string,width:number){
 if(![390,768,1440].includes(width))throw new InputError('Choose a supported capture width.');
 if(!path.startsWith('/')||path.startsWith('//')||path.length>2000||/[\r\n#]/.test(path))throw new InputError('Invalid capture path.');
 const source=publicOrigin(review.source_url),target=publicOrigin(new URL(path,source).href);if(source.origin!==target.origin)throw new InputError('Capture must stay on the saved website.');return target;
}
async function capture(env:Env,review:CaptureReview,path:string,width:number){
 const target=captureTarget(review,path,width);
 const response=await env.BROWSER.quickAction('screenshot',{url:target.href,viewport:{width,height:850,deviceScaleFactor:1},screenshotOptions:{type:'png',fullPage:true},scrollPage:true,cacheTTL:0,gotoOptions:{waitUntil:'networkidle2',timeout:12000},actionTimeout:10000,bestAttempt:true});
 if(!response.ok)throw new Error('Browser capture failed');const bytes=await readBounded(response,MAX_IMAGE_BYTES);if(imageType(bytes).mime!=='image/png')throw new Error('Invalid browser capture');
 const key=`reviews/${review.id}/captures/${crypto.randomUUID()}.png`;await env.FILES.put(key,bytes,{httpMetadata:{contentType:'image/png'}});return key;
}
export async function captureReview(env:Env,id:string,path:string,width:number){
 const review=await env.DB.prepare("SELECT * FROM reviews WHERE id=? AND type='site'").bind(id).first<CaptureReview>();if(!review)throw new InputError('Website review not found.');
 const key=await capture(env,review,path,width);
 try{await env.DB.prepare('UPDATE reviews SET screenshot_mode=1,screenshot_key=?,screenshot_width=?,screenshot_path=?,captured_at=unixepoch() WHERE id=?').bind(key,width,path,id).run();}catch(error){await env.FILES.delete(key);throw error;}
 return key;
}
export async function capturePin(env:Env,pinId:string){
 const pin=await env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(pinId).first<{id:string;review_id:string;page_path:string;viewport:number}>();if(!pin)return false;
 const review=await env.DB.prepare("SELECT * FROM reviews WHERE id=? AND type='site'").bind(pin.review_id).first<CaptureReview>();if(!review)return false;
 let key:string|null=null,created=false;
 try{
  if(review.screenshot_mode&&review.screenshot_key&&review.screenshot_path===pin.page_path&&review.screenshot_width===pin.viewport)key=review.screenshot_key;
  else{key=await capture(env,review,pin.page_path,pin.viewport);created=true;}
  await env.DB.prepare("UPDATE pins SET screenshot_key=?,screenshot_status='saved' WHERE id=?").bind(key,pin.id).run();return true;
 }catch(error){if(key&&created)await env.FILES.delete(key);await env.DB.prepare("UPDATE pins SET screenshot_status='failed' WHERE id=?").bind(pin.id).run();console.error('Pin capture failed',{name:(error as Error).name});return false;}
}

// Browser Run Quick Actions do not run in local emulation. Keep local feedback
// usable and expose capture failure rather than leaving an unsupported RPC pending.
export function localCapture(url:string){return ['localhost','127.0.0.1'].includes(new URL(url).hostname);}
export async function captureForRequest(env:Env,pinId:string,url:string){if(localCapture(url)){const snapshot=await env.DB.prepare('SELECT r.screenshot_key FROM pins p JOIN reviews r ON r.id=p.review_id WHERE p.id=? AND r.screenshot_mode=1 AND r.screenshot_key IS NOT NULL AND p.page_path=r.screenshot_path AND p.viewport=r.screenshot_width').bind(pinId).first();if(snapshot)return capturePin(env,pinId);await env.DB.prepare("UPDATE pins SET screenshot_status='failed' WHERE id=?").bind(pinId).run();return false;}return capturePin(env,pinId);}
