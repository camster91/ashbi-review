import { Hono } from 'hono';
export interface Env { DB: D1Database; FILES: R2Bucket; BROWSER: Fetcher; ASSETS: Fetcher }
const app = new Hono<{ Bindings: Env }>();
app.get('/api/health', async c => {
  try { await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(); return c.json({ ok: true, database: 'ok' }); }
  catch { return c.json({ ok: false, database: 'unavailable' }, 503); }
});
app.all('/api/*', c => c.json({ error: 'Not found' }, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
