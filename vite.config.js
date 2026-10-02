import { defineConfig, loadEnv } from 'vite';

// CSP connect-src is filled from the build-time Supabase and update URLs (nothing else may be fetched).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const origins = [env.VITE_SUPABASE_URL, env.VITE_UPDATE_URL].filter(Boolean).map(u => new URL(u).origin);
  const ws = origins.filter(o => o.includes('supabase')).map(o => o.replace(/^https:/, 'wss:'));
  const connect = ["'self'", ...new Set([...origins, ...ws])].join(' ');
  return {
    base: './',
    build: { target: 'es2020', chunkSizeWarningLimit: 1500, sourcemap: false },
    plugins: [{ name: 'csp-connect-src', transformIndexHtml: html => html.replace('%CONNECT_SRC%', connect) }]
  };
});
