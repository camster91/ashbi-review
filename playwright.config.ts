import { defineConfig } from '@playwright/test';
const key='local-e2e-test-only-key-at-least-32-characters';
export default defineConfig({testDir:'./e2e',workers:1,timeout:60000,use:{baseURL:'http://127.0.0.1:5174',actionTimeout:10000,trace:'retain-on-failure'},webServer:[
 {command:'npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e && npx wrangler dev --ip 127.0.0.1 --port 8788 --inspector-port 9230 --infer-origin-from-routes false --persist-to .wrangler/e2e --var DEV_OPERATOR_TOKEN:'+key,url:'http://127.0.0.1:8788/api/health',timeout:60000},
 {command:'npx vite --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',env:{DEV_OPERATOR_TOKEN:key,DEV_API_TARGET:'http://127.0.0.1:8788'}}]});
