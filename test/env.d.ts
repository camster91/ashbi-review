import type { Env as AppEnv } from '../worker/index';
declare global { namespace Cloudflare { interface Env extends AppEnv { TEST_MIGRATIONS: D1Migration[] } } }
