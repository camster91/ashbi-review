import { Hono } from 'hono';
import type { Env } from './index';
import { publicOrigin, proxyUrl } from './proxy';
import { siteAnchor } from './site-input';
import { isLocalOperator } from './operator';
import { imageType, InputError, MAX_IMAGE_BYTES, readBounded } from './images';

type Review = { id: string; project_id: string; type: 'image' | 'site'; name: string; r2_key: string | null; source_url:string; share_token:string };
type Pin = { id: string; review_id: string; x_pct: number; y_pct: number; number: number; status: string };
type Project = { id: string; name: string; client_name: string; archived: number };

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const bytes = await readBounded(request, 64 * 1024);
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw new InputError('Invalid request.'); }
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new InputError(`${label} is required (maximum ${max} characters).`);
  return value.trim();
}
const id = () => crypto.randomUUID();

export const reviewsApi = new Hono<{ Bindings: Env }>();
reviewsApi.use('*', async (c, next) => {
  if (!await isLocalOperator(c.req.raw, c.env.DEV_OPERATOR_TOKEN)) return c.json({ error: 'Sign in to open your workspace.' }, 401);
  const origin = c.req.header('origin');
  if (origin) {
    try { if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) return c.json({ error: 'Invalid request origin.' }, 403); }
    catch { return c.json({ error: 'Invalid request origin.' }, 403); }
  }
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
  const pins = await c.env.DB.prepare('SELECT * FROM pins WHERE review_id=? ORDER BY number').bind(review.id).all();
  const comments = await c.env.DB.prepare('SELECT comments.* FROM comments JOIN pins ON pins.id=comments.pin_id WHERE pins.review_id=? ORDER BY created_at,comments.rowid').bind(review.id).all();
  const {share_token,source_url,r2_key,...safeReview}=review;
  const frame_url=review.type==='site'?proxyUrl(new URL(source_url),`/p/${review.id}/${share_token}/`):undefined;
  return c.json({ review:{...safeReview,source_url,frame_url}, pins: pins.results, comments: comments.results });
});
reviewsApi.get('/reviews/:id/image', async c => {
  const review = await c.env.DB.prepare("SELECT r2_key FROM reviews WHERE id=? AND type='image'").bind(c.req.param('id')).first<Review>();
  if (!review?.r2_key) return c.json({ error: 'Image not found.' }, 404);
  const file = await c.env.FILES.get(review.r2_key);
  if (!file) return c.json({ error: 'Image not found.' }, 404);
  return new Response(file.body, { headers: { 'Content-Type': file.httpMetadata?.contentType ?? 'application/octet-stream', 'Content-Length': String(file.size), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
});
reviewsApi.post('/reviews/:id/pins', async c => {
  const review = await c.env.DB.prepare("SELECT id,type FROM reviews WHERE id=?").bind(c.req.param('id')).first<{id:string;type:string}>();
  if (!review) return c.json({ error: 'Review not found.' }, 404);
  const data = await jsonBody(c.req.raw);
  for (const value of [data.x_pct, data.y_pct]) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new InputError('Pin coordinates must be between 0 and 100.');
  const anchor=review.type==='site'?siteAnchor(data):null;
  const body = text(data.body, 'Comment', 10000);
  const author = text(data.author_name, 'Name', 120);
  const pinId = id();
  // Number allocation and insertion happen in one SQL statement, avoiding a read/increment race.
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO pins(id,review_id,x_pct,y_pct,page_path,selector,viewport,scroll_y,page_x_pct,page_y_pct,number) SELECT ?,?,?,?,?,?,?,?,?,?,COALESCE(MAX(number),0)+1 FROM pins WHERE review_id=?").bind(pinId,review.id,data.x_pct,data.y_pct,anchor?.page_path??'/',anchor?.selector??null,anchor?.viewport??null,anchor?.scroll_y??0,anchor?.page_x_pct??null,anchor?.page_y_pct??null,review.id),
    c.env.DB.prepare('INSERT INTO comments(id,pin_id,author_name,body) VALUES(?,?,?,?)').bind(id(), pinId, author, body)
  ]);
  const pin = await c.env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(pinId).first<Pin>();
  return c.json({ pin }, 201);
});
reviewsApi.post('/pins/:id/comments', async c => {
  const pin = await c.env.DB.prepare('SELECT * FROM pins WHERE id=?').bind(c.req.param('id')).first<Pin>();
  if (!pin) return c.json({ error: 'Pin not found.' }, 404);
  const data = await jsonBody(c.req.raw);
  const parent = data.parent_id === undefined || data.parent_id === null ? null : text(data.parent_id, 'Reply target', 100);
  if (parent && !await c.env.DB.prepare('SELECT id FROM comments WHERE id=? AND pin_id=?').bind(parent, pin.id).first()) throw new InputError('Reply must belong to the same pin.');
  const comment = { id: id(), pin_id: pin.id, author_name: text(data.author_name, 'Name', 120), body: text(data.body, 'Comment', 10000), parent_id: parent };
  await c.env.DB.prepare('INSERT INTO comments(id,pin_id,author_name,body,parent_id) VALUES(?,?,?,?,?)').bind(comment.id, pin.id, comment.author_name, comment.body, parent).run();
  return c.json({ comment }, 201);
});
reviewsApi.patch('/pins/:id', async c => {
  const data = await jsonBody(c.req.raw);
  if (data.status !== 'open' && data.status !== 'resolved') throw new InputError('Choose open or resolved.');
  const result = await c.env.DB.prepare('UPDATE pins SET status=? WHERE id=? RETURNING *').bind(data.status, c.req.param('id')).first<Pin>();
  if (!result) return c.json({ error: 'Pin not found.' }, 404);
  return c.json({ pin: result });
});
