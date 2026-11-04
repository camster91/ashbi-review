import { Hono } from 'hono';
import { proxy } from './proxy';
import {guestsApi} from './guests';
import {authApi} from './auth';
import {sendCommentDigest} from './email';
import { reviewsApi } from './reviews';
export interface Env { DB: D1Database; FILES: R2Bucket; BROWSER: Fetcher; ASSETS: Fetcher; DEV_OPERATOR_TOKEN?: string; RESEND_API_KEY?:string; EMAIL_FROM?:string;APP_ORIGIN?:string }
const app = new Hono<{ Bindings: Env }>();
app.route('/p', proxy);
app.all('/p/*', c => c.text('Review unavailable', 404));
app.get('/api/health', async c => {
  try { await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first(); return c.json({ ok: true, database: 'ok' }); }
  catch { return c.json({ ok: false, database: 'unavailable' }, 503); }
});
app.route('/api/auth',authApi);
app.route('/api/guest',guestsApi);
app.route('/api', reviewsApi);
app.all('/api/*', c => c.json({ error: 'Not found' }, 404));
app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default {fetch:app.fetch,async scheduled(event:ScheduledController,env:Env){await sendCommentDigest(env,event.scheduledTime);}};
