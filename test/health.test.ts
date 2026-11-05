import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
describe('Worker foundation',()=>{
  it('reads the migrated D1 database',async()=>{ const r=await SELF.fetch('https://review.test/api/health'); expect(r.status).toBe(200); expect(await r.json()).toEqual({ok:true,database:'ok'}); });
  it('creates all six core tables',async()=>{const r=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{name:string}>();expect(r.results.map(x=>x.name)).toEqual(expect.arrayContaining(['users','projects','reviews','pins','comments','guests']));});
  it('protects workspace API paths before returning any data',async()=>{expect((await SELF.fetch('https://review.test/api/projects')).status).toBe(401);});
});
