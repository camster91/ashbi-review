import {SELF,env} from 'cloudflare:test';
import {expect,it} from 'vitest';
import {anchorPosition} from '../shared/pins';
import {siteAnchor} from '../worker/site-input';
const headers={authorization:'Bearer local-workers-test-key-only-32-characters-minimum','content-type':'application/json'};
const point={page_path:'/products/?sort=new',selector:'#hero',x_pct:30,y_pct:40,page_x_pct:10,page_y_pct:20,viewport:390,scroll_y:120};
it('reattaches to a moved element, falling back to page percentages when missing',()=>{
 expect(anchorPosition(point,{left:10,top:300,width:200,height:100},{width:1000,height:2000})).toEqual({left:70,top:340});
 expect(anchorPosition(point,null,{width:1000,height:2000})).toEqual({left:100,top:400});
});
it('validates persistent site anchors',()=>{
 expect(siteAnchor(point)).toEqual(point);
 for(const change of [{viewport:400},{selector:''},{page_path:'//evil.com'},{page_x_pct:Infinity},{scroll_y:-1}])expect(()=>siteAnchor({...point,...change})).toThrow();
});
it('creates private site reviews and atomically persists anchors/comments',async()=>{
 const project=crypto.randomUUID();await env.DB.prepare('INSERT INTO projects(id,client_name,name) VALUES(?,?,?)').bind(project,'Site test','Website').run();
 const create=await SELF.fetch(`http://localhost/api/projects/${project}/sites`,{method:'POST',headers,body:JSON.stringify({source_url:'https://client.example.com/start',name:'Homepage'})});expect(create.status).toBe(201);
 const {review}=await create.json() as {review:{id:string}};
 const pin=await SELF.fetch(`http://localhost/api/reviews/${review.id}/pins`,{method:'POST',headers,body:JSON.stringify({...point,body:'Move this headline',author_name:'Cameron'})});expect(pin.status).toBe(201);
 const read=await SELF.fetch(`http://localhost/api/reviews/${review.id}`,{headers});const data=await read.json() as {review:Record<string,unknown>;pins:Record<string,unknown>[];comments:unknown[]};
 expect(data.review.share_token).toBeUndefined();expect(data.review.frame_url).toContain('/p/'+review.id+'/');expect(data.pins[0]).toMatchObject(point);expect(data.comments).toHaveLength(1);
 const bad=await SELF.fetch(`http://localhost/api/projects/${project}/sites`,{method:'POST',headers,body:JSON.stringify({source_url:'http://127.0.0.1:8788',name:'Private target'})});expect(bad.status).toBe(400);
});
