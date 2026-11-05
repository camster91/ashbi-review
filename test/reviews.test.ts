import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { imageType, InputError, MAX_IMAGE_BYTES, readBounded } from '../worker/images';

const token = 'local-workers-test-key-only-32-characters-minimum';
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6RsAAAAASUVORK5CYII='), c => c.charCodeAt(0));
function api(path: string, method = 'GET', data?: unknown) {
  return SELF.fetch('http://localhost/api' + path, { method, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
}
async function project() {
  const response = await api('/projects', 'POST', { client_name: 'Test client', name: 'Package proof' });
  return (await response.json() as {project:{id:string}}).project.id;
}
async function review(projectId?: string) {
  const p = projectId ?? await project();
  const response = await SELF.fetch(`http://localhost/api/projects/${p}/reviews`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'image/png', 'x-file-name': encodeURIComponent('Package design.png') }, body: png });
  expect(response.status).toBe(201);
  return (await response.json() as {review:{id:string}}).review.id;
}
beforeEach(async () => {
  await env.DB.batch(['comments','pins','guests','reviews','projects'].map(table => env.DB.prepare(`DELETE FROM ${table}`)));
});

describe('development isolation', () => {
  it('rejects missing/wrong credentials and every production hostname', async () => {
    for (const [host, auth] of [['localhost',''], ['localhost','wrong'], ['review.ashbi.ca',token]]) {
      const response = await SELF.fetch(`https://${host}/api/projects`, { headers: { authorization: 'Bearer ' + auth } });
      expect(response.status).toBe(401);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM projects').first<{count:number}>())?.count).toBe(0);
  });
  it('rejects cross-origin writes even with the local key', async () => {
    const r = await SELF.fetch('http://localhost/api/projects', { method:'POST', headers:{authorization:'Bearer '+token,origin:'https://evil.example.com','content-type':'application/json'},body:JSON.stringify({name:'Bad',client_name:'Bad'}) });
    expect(r.status).toBe(403);
  });
});
describe('projects and private image storage', () => {
  it('creates, renames, archives and restores a project', async () => {
    const p = await project();
    expect((await api(`/projects/${p}`, 'PATCH', { name:'Second round',client_name:'New client',archived:true })).status).toBe(200);
    const list = await (await api('/projects')).json() as {projects:{name:string;client_name:string;archived:number}[]};
    expect(list.projects[0]).toMatchObject({name:'Second round',client_name:'New client',archived:1});
    expect((await api(`/projects/${p}`, 'PATCH', { archived:false })).status).toBe(200);
  });
  it('validates project input without accepting whitespace-only names', async () => {
    expect((await api('/projects','POST',{client_name:'x',name:'   '})).status).toBe(400);
    expect((await api('/projects','POST',{client_name:'x',name:9})).status).toBe(400);
  });
  it('stores a real PNG in private R2 and reads it after a separate request', async () => {
    const p = await project(); const r = await review(p);
    const list = await (await api(`/projects/${p}/reviews`)).json() as {reviews:{id:string;name:string}[]};
    expect(list.reviews[0]).toMatchObject({id:r,name:'Package design.png'});
    const image = await api(`/reviews/${r}/image`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toContain('no-store');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
    expect((await SELF.fetch(`https://review.ashbi.ca/api/reviews/${r}/image`)).status).toBe(401);
  });
  it('rejects HTML and MIME-spoofed uploads', async () => {
    const p=await project();
    for(const [type,body]of [['image/png','<svg onload="alert(1)"></svg>'],['text/html',png]] as const){
      const r=await SELF.fetch(`http://localhost/api/projects/${p}/reviews`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':type},body});
      expect(r.status).toBe(415);
    }
    expect((await env.DB.prepare('SELECT COUNT(*) AS count FROM reviews').first<{count:number}>())?.count).toBe(0);
  });
  it('rejects uploads above 25 MB before reading them', async () => {
    const p=await project();const r=await SELF.fetch(`http://localhost/api/projects/${p}/reviews`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png','content-length':String(MAX_IMAGE_BYTES+1)},body:png});
    expect(r.status).toBe(413);
  });
  it('enforces bounded reads with no trusted content-length', async () => {
    const stream=()=>new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(5));controller.close();}});
    await expect(readBounded(new Request('http://localhost',{method:'POST',body:stream()}),4)).rejects.toBeInstanceOf(InputError);
    expect((await readBounded(new Request('http://localhost',{method:'POST',body:stream()}),5)).length).toBe(5);
  });
  it('recognises only supported image signatures', () => {
    expect(imageType(png).mime).toBe('image/png');
    expect(imageType(new Uint8Array([255,216,255,224,255,217])).mime).toBe('image/jpeg');
    expect(imageType(new TextEncoder().encode('RIFF1234WEBPVP8 ')).mime).toBe('image/webp');
    expect(()=>imageType(new TextEncoder().encode('not an image'))).toThrow(InputError);
  });
  it('refuses new reviews in archived and nonexistent projects', async()=>{
    const p=await project();await api(`/projects/${p}`,'PATCH',{archived:true});
    for(const [projectId,status]of [[p,409],['missing',404]] as const){const r=await SELF.fetch(`http://localhost/api/projects/${projectId}/reviews`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png'},body:png});expect(r.status).toBe(status);}
  });
});
describe('persistent pin and comment workflow', () => {
  it('drops 5 numbered pins, replies, resolves 2 and reloads the same state', async () => {
    const r=await review();const pins:string[]=[];
    for(let n=1;n<=5;n++){
      const response=await api(`/reviews/${r}/pins`,'POST',{x_pct:n*10,y_pct:n*12,author_name:'Cameron',body:`Feedback ${n}`});
      expect(response.status).toBe(201);const data=await response.json() as {pin:{id:string;number:number}};
      expect(data.pin.number).toBe(n);pins.push(data.pin.id);
    }
    let state=await(await api(`/reviews/${r}`)).json() as {pins:{status:string}[];comments:{id:string;body:string;parent_id:string|null}[]};
    const root=state.comments[0].id;
    expect((await api(`/pins/${pins[0]}/comments`,'POST',{parent_id:root,author_name:'Bianca',body:'Updated this.'})).status).toBe(201);
    for(const pin of pins.slice(0,2))expect((await api(`/pins/${pin}`,'PATCH',{status:'resolved'})).status).toBe(200);
    state=await(await api(`/reviews/${r}`)).json() as typeof state;
    expect(state.pins).toHaveLength(5);expect(state.pins.filter(p=>p.status==='resolved')).toHaveLength(2);
    expect(state.comments).toHaveLength(6);expect(state.comments[5]).toMatchObject({body:'Updated this.',parent_id:root});
  });
  it('allocates unique pin numbers for concurrent submissions', async()=>{
    const r=await review();const responses=await Promise.all(Array.from({length:5},(_,n)=>api(`/reviews/${r}/pins`,'POST',{x_pct:n,y_pct:n,author_name:'Cam',body:'Note'})));
    expect(responses.map(x=>x.status)).toEqual([201,201,201,201,201]);
    const data=await(await api(`/reviews/${r}`)).json() as {pins:{number:number}[]};expect(data.pins.map(x=>x.number)).toEqual([1,2,3,4,5]);
  });
  it('does not attach replies to another pin or review', async()=>{
    const a=await review(),b=await review();
    const create=async(r:string)=>(await(await api(`/reviews/${r}/pins`,'POST',{x_pct:0,y_pct:100,author_name:'Cam',body:'Note'})).json() as {pin:{id:string}}).pin.id;
    const pinA=await create(a),pinB=await create(b);const data=await(await api(`/reviews/${a}`)).json() as {comments:{id:string}[]};
    expect((await api(`/pins/${pinB}/comments`,'POST',{parent_id:data.comments[0].id,author_name:'Cam',body:'Wrong review'})).status).toBe(400);
    expect((await api(`/pins/${pinA}/comments`,'POST',{parent_id:data.comments[0].id,author_name:'Cam',body:'Correct review'})).status).toBe(201);
  });
  it('validates coordinates, comments and resolution states',async()=>{
    const r=await review();
    for(const data of [{x_pct:-1,y_pct:0,body:'x'},{x_pct:0,y_pct:101,body:'x'},{x_pct:'20',y_pct:5,body:'x'},{x_pct:20,y_pct:5,body:'   '}])expect((await api(`/reviews/${r}/pins`,'POST',{...data,author_name:'Cam'})).status).toBe(400);
    expect((await api('/pins/missing','PATCH',{status:'deleted'})).status).toBe(400);
    expect((await api('/pins/missing','PATCH',{status:'resolved'})).status).toBe(404);
  });
});
