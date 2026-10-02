import { defineConfig, loadEnv } from 'vite';

// CSP connect-src is filled from the build-time Supabase and update URLs (nothing else may be fetched).
// The web build also gets sw.js (offline cache + in-app updates) listing every built file.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const urls = [env.VITE_SUPABASE_URL, env.VITE_UPDATE_URL, ...(env.VITE_UPDATE_URLS || '').split(','), env.VITE_WEB_UPDATE_URL]
    .map(u => (u || '').trim()).filter(u => /^https?:\/\//.test(u));
  const origins = urls.map(u => new URL(u).origin);
  const ws = origins.filter(o => o.includes('supabase')).map(o => o.replace(/^https:/, 'wss:'));
  const connect = ["'self'", ...new Set([...origins, ...ws])].join(' ');
  const version = (env.VITE_APP_VERSION || '1.0.0-dev') + '-' + Date.now().toString(36);
  return {
    base: './',
    build: { target: 'es2020', chunkSizeWarningLimit: 1500, sourcemap: false },
    plugins: [
      { name: 'csp-connect-src', transformIndexHtml: html => html.replace('%CONNECT_SRC%', connect) },
      {
        name: 'service-worker',
        generateBundle(_, bundle) {
          const files = Object.keys(bundle).filter(f => !f.endsWith('.map'));
          const assets = ['./', 'index.html', 'favicon.png', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', ...files.filter(f => f !== 'index.html')];
          const src = `/* Generated at build time (vite.config.js). Offline cache + in-app updates for the web version. */
const VERSION = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(assets)};
const CACHE = 'ddt-' + VERSION;
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(keys => Promise.all(keys.filter(k => k.startsWith('ddt-') && k !== CACHE).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith('/version.json')) return; // cloud + update checks go to the network
  if (req.mode === 'navigate') { e.respondWith(caches.match('index.html').then(r => r || fetch(req))); return; }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req)));
});
`;
          this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
        }
      }
    ]
  };
});
