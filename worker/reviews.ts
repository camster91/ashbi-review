import { Hono } from 'hono';
import type { Env } from './index';
import { publicOrigin } from './proxy';
import {captureForRequest,captureReview,localCapture} from './screenshots';
import {createPin,createReply,reviewData,imageResponse} from './feedback';
import {operator,validOrigin,type User} from './auth';
import {jsonBody,text} from './input';
import { imageType, InputError, MAX_IMAGE_BYTES, readBounded } from './images';

type Review = { id: string; project_id: string; type: 'image' | 'site'; name: string; r2_key: string | null; source_url:string; share_token:string; screenshot_mode:number;screenshot_key:string|null;screenshot_width:number|null;screenshot_path:string|null };
type Pin = { id: string; review_id: string; x_pct: number; y_pct: number; number: number; status: string };
type Project = { id: string; name: string; client_name: string; archived: number };

const id = () => crypto.randomUUID();

export const reviewsApi = new Hono<{ Bindings: Env; Variables:{operator:User} }>();
reviewsApi.use('*', async (c, next) => {
  const user=await operator(c.req.raw,c.env);if(!user)return c.json({error:'Sign in to open your workspace.'},401);
  // Production cookies require an exact Origin; the local Vite helper is limited to loopback.
  const origin=c.req.header('origin');
  let localOrigin=false;try{localOrigin=!!origin&&['localhost','127.0.0.1'].includes(new URL(origin).hostname);}catch{}
  if(!validOrigin(c.req.raw)&&!(user.local&&localOrigin))return c.json({error:'Invalid request origin.'},403);
  c.set('operator',user);
  c.header('Cache-Control', 'no-store');
  await next();
});
reviewsApi.onError((error, c) => {
  if (error instanceof InputError) return c.json({ error: error.message }, error.status);
  console.error('Review operation failed', { name: error.name });
  return c.json({ error: 'Could not save your change. Please try again.' }, 500);
});

reviewsApi.get('/projects', async c => {
  const projects = await c.env.DB.prepare('SELECT * FROM projects ORDER BY client_name COLLATE NOCASE, name COLLATE NOCASE').all<Project>();
  return c.json({ projects: projects.results });
});
reviewsApi.post('/projects', async c => {
  const data = await jsonBody(c.req.raw);
  const project = { id: id(), client_name: text(data.client_name, 'Client name', 120), name: text(data.name, 'Project name', 160), archived: 0 };
  await c.env.DB.prepare('INSERT INTO projects(id,client_name,name) VALUES(?,?,?)').bind(project.id, project.client_name, project.name).run();
  return c.json({ project }, 201);
});
reviewsApi.patch('/projects/:id', async c => {
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(c.req.param('id')).first<Project>();
  if (!project) return c.json({ error: 'Project not found.' }, 404);
  const data = await jsonBody(c.req.raw);
  if ('name' in data) project.name = text(data.name, 'Project name', 160);
  if ('client_name' in data) project.client_name = text(data.client_name, 'Client name', 120);
  if ('archived' in data) {
    if (typeof data.archived !== 'boolean') throw new InputError('Archived must be true or false.');
    project.archived = Number(data.archived);
  }
  await c.env.DB.prepare('UPDATE projects SET name=?,client_name=?,archived=? WHERE id=?').bind(project.name, project.client_name, project.archived, project.id).run();
  return c.json({ project });
});
reviewsApi.get('/projects/:id/reviews', async c => {
  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE id=?').bind(c.req.param('id')).first();
  if (!project) return c.json({ error: 'Project not found.' }, 404);
  const reviews = await c.env.DB.prepare('SELECT id,project_id,type,name FROM reviews WHERE project_id=? ORDER BY rowid DESC').bind(c.req.param('id')).all();
  return c.json({ reviews: reviews.results });
});
reviewsApi.post('/projects/:id/reviews', async c => {
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(c.req.param('id')).first<Project>();
  if (!project) return c.json({ error: 'Project not found.' }, 404);
  if (project.archived) return c.json({ error: 'Restore this project before adding a review.' }, 409);
  const bytes = await readBounded(c.req.raw, MAX_IMAGE_BYTES);
  const detected = imageType(bytes);
  if ((c.req.header('content-type') ?? '').split(';')[0] !== detected.mime) throw new InputError('The file type does not match the image.', 415);
  let name: string;
  try { name = decodeURIComponent(c.req.header('x-file-name') ?? 'Image review'); }
  catch { throw new InputError('Invalid image name.'); }
  name = text(name, 'Image name', 240);
  const review = { id: id(), project_id: project.id, type: 'image', name };
  const key = `reviews/${review.id}/${id()}.${detected.extension}`;
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: detected.mime } });
  try {
    await c.env.DB.prepare("INSERT INTO reviews(id,project_id,type,r2_key,share_token,name) VALUES(?,?,'image',?,?,?)").bind(review.id, project.id, key, id() + id(), name).run();
  } catch (error) { await c.env.FILES.delete(key); throw error; }
  return c.json({ review }, 201);
});
reviewsApi.post('/projects/:id/sites',async c=>{
 const project=await c.env.DB.prepare('SELECT * FROM projects WHERE id=?').bind(c.req.param('id')).first<Project>();
 if(!project)return c.json({error:'Project not found.'},404);
 if(project.archived)return c.json({error:'Restore this project before adding a review.'},409);
 const data=await jsonBody(c.req.raw);let source:URL;
 try{source=publicOrigin(text(data.source_url,'Website URL',2000));}catch{throw new InputError('Enter a public website URL.');}
 const review={id:id(),project_id:project.id,type:'site',name:text(data.name,'Review name',240)};
 await c.env.DB.prepare("INSERT INTO reviews(id,project_id,type,source_url,share_token,name) VALUES(?,?,'site',?,?,?)").bind(review.id,project.id,source.href,id()+id(),review.name).run();
 return c.json({review},201);
});
reviewsApi.get('/reviews/:id', async c => {
  const review = await c.env.DB.prepare('SELECT * FROM reviews WHERE id=?').bind(c.req.param('id')).first<Review>();
  if (!review) return c.json({ error: 'Review not found.' }, 404);
  return c.json(await reviewData(c.env,review));
});
reviewsApi.get('/reviews/:id/image', async c => {
  const review = await c.env.DB.prepare("SELECT r2_key FROM reviews WHERE id=? AND type='image'").bind(c.req.param('id')).first<Review>();
  if (!review?.r2_key) return c.json({ error: 'Image not found.' }, 404);
  return imageResponse(c.env,review.r2_key);
});
reviewsApi.post('/reviews/:id/pins', async c => {
  const review = await c.env.DB.prepare("SELECT * FROM reviews WHERE id=?").bind(c.req.param('id')).first<Review>();
  if (!review) return c.json({ error: 'Review not found.' }, 404);
  const data = await jsonBody(c.req.raw);
  const user=c.get('operator');const pin=await createPin(c.env,review,data,{name:user.local?text(data.author_name,'Name',120):user.name,email:user.email});
  if(pin&&review.type==='site')c.executionCtx.waitUntil(captureForRequest(c.env,pin.id,c.req.url));
  return c.json({pin},201);
});
reviewsApi.post('/pins/:id/comments', async c => {
  const pin = await c.env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(c.req.param('id')).first<Pin>();
  if (!pin) return c.json({ error: 'Pin not found.' }, 404);
  const data = await jsonBody(c.req.raw);
  const user=c.get('operator');const comment=await createReply(c.env,pin.id,data,{name:user.local?text(data.author_name,'Name',120):user.name,email:user.email});
  return c.json({comment},201);
});
reviewsApi.patch('/pins/:id', async c => {
  const data = await jsonBody(c.req.raw);
  if (data.status !== 'open' && data.status !== 'resolved') throw new InputError('Choose open or resolved.');
  const result = await c.env.DB.prepare('UPDATE pins SET status=? WHERE id=? RETURNING *').bind(data.status, c.req.param('id')).first<Pin>();
  if (!result) return c.json({ error: 'Pin not found.' }, 404);
  return c.json({ pin: result });
});

reviewsApi.get('/reviews/:id/share',async c=>{
 const share=await c.env.DB.prepare('SELECT share_token,expires_at,link_enabled FROM reviews WHERE id=?').bind(c.req.param('id')).first<{share_token:string;expires_at:number|null;link_enabled:number}>();
 if(!share)return c.json({error:'Review not found.'},404);
 return c.json({url:`${c.env.APP_ORIGIN??new URL(c.req.url).origin}/?share=${encodeURIComponent(c.req.param('id'))}&token=${encodeURIComponent(share.share_token)}`,expires_at:share.expires_at,link_enabled:share.link_enabled});
});
reviewsApi.patch('/reviews/:id/share',async c=>{
 const data=await jsonBody(c.req.raw);if(typeof data.link_enabled!=='boolean')throw new InputError('Choose whether the share link is enabled.');
 if(data.expires_at!==null&&(typeof data.expires_at!=='number'||!Number.isInteger(data.expires_at)||data.expires_at<=Date.now()/1000))throw new InputError('Choose a future expiry date or no expiry.');
 const result=await c.env.DB.prepare('UPDATE reviews SET link_enabled=?,expires_at=? WHERE id=? RETURNING id').bind(Number(data.link_enabled),data.expires_at,c.req.param('id')).first();if(!result)return c.json({error:'Review not found.'},404);return c.json({ok:true});
});

reviewsApi.post('/reviews/:id/capture',async c=>{
 if(localCapture(c.req.url))return c.json({error:'Browser capture is available on the deployed workspace. You can upload an image for local feedback.'},502);
 const data=await jsonBody(c.req.raw);try{await captureReview(c.env,c.req.param('id'),text(data.page_path,'Page path',2000),Number(data.width));return c.json({ok:true});}catch(error){if(error instanceof InputError)throw error;return c.json({error:'The page capture failed. Try again, or upload an image of this page.'},502);}
});
reviewsApi.patch('/reviews/:id/mode',async c=>{
 const result=await c.env.DB.prepare("UPDATE reviews SET screenshot_mode=0 WHERE id=? AND type='site' RETURNING id").bind(c.req.param('id')).first();return result?c.json({ok:true}):c.json({error:'Website review not found.'},404);
});
reviewsApi.get('/reviews/:id/snapshot',async c=>{const review=await c.env.DB.prepare('SELECT screenshot_key FROM reviews WHERE id=?').bind(c.req.param('id')).first<{screenshot_key:string|null}>();const version=c.req.query('v');return review?.screenshot_key&&(version===undefined||version===review.screenshot_key.split('/').at(-1))?imageResponse(c.env,review.screenshot_key):c.json({error:'Capture not found.'},404);});
reviewsApi.get('/pins/:id/screenshot',async c=>{const pin=await c.env.DB.prepare('SELECT screenshot_key FROM pins WHERE id=?').bind(c.req.param('id')).first<{screenshot_key:string|null}>();return pin?.screenshot_key?imageResponse(c.env,pin.screenshot_key):c.json({error:'Capture not found.'},404);});
reviewsApi.post('/pins/:id/capture',async c=>{const saved=await captureForRequest(c.env,c.req.param('id'),c.req.url);return saved?c.json({ok:true}):c.json({error:'The page capture failed. Try again later.'},502);});
