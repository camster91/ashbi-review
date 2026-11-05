import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'DEV_');
  return { plugins: [react()], build: { outDir: 'dist' }, server: { host: '127.0.0.1', proxy: { '/api': { target: env.DEV_API_TARGET ?? 'http://localhost:8787', changeOrigin: true, headers: env.DEV_OPERATOR_TOKEN ? { Authorization: `Bearer ${env.DEV_OPERATOR_TOKEN}` } : {} } } } };
});
