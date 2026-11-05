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
export async function capturePin(env:Env,pinId:string,allowRendering=true){
 const pin=await env.DB.prepare('SELECT review_id,page_path,viewport,selector,screenshot_key FROM pins WHERE id=?').bind(pinId).first<{review_id:string;page_path:string;viewport:number;selector:string|null;screenshot_key:string|null}>();
 if(!pin)return false;
 if(pin.screenshot_key)return true;
 const review=await env.DB.prepare("SELECT * FROM reviews WHERE id=? AND type='site'").bind(pin.review_id).first<CaptureReview>();
 if(!review)return false;
 let key:string|undefined;
 try{
  // Older snapshot pins without a saved key have no recoverable capture version.
  if(allowRendering&&pin.selector){
   key=await capture(env,review,pin.page_path,pin.viewport);
   const updated=await env.DB.prepare("UPDATE pins SET screenshot_key=?,screenshot_status='saved' WHERE id=? AND screenshot_key IS NULL").bind(key,pinId).run();
   if(!updated.meta.changes)await env.FILES.delete(key);
   return true;
  }
 }catch(error){
  if(key)await env.FILES.delete(key);
  console.error('Pin capture failed',{name:(error as Error).name});
 }
 await env.DB.prepare("UPDATE pins SET screenshot_status='failed' WHERE id=? AND screenshot_key IS NULL").bind(pinId).run();
 const saved=await env.DB.prepare('SELECT screenshot_key FROM pins WHERE id=?').bind(pinId).first<{screenshot_key:string|null}>();
 return !!saved?.screenshot_key;
}

// Browser Run Quick Actions do not run in local emulation.
export function localCapture(url:string){return ['localhost','127.0.0.1'].includes(new URL(url).hostname);}
export function captureForRequest(env:Env,pinId:string,url:string){return capturePin(env,pinId,!localCapture(url));}
