import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import { getKvCredentials, handleApiGet, handleApiPost } from './api/_kvStore.js';

const PROD_CLOUD_API = 'https://pancake-distribution.vercel.app/api/state';

function cloudApiMiddlewarePlugin() {
  return {
    name: 'pancake-cloud-api-middleware',
    configureServer(server) {
      server.middlewares.use('/api/state', async (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 'no-store');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        try {
          const urlObj = new URL(req.url || '/', 'http://localhost');
          const query = Object.fromEntries(urlObj.searchParams.entries());
          let rawBody = '';

          if (req.method === 'POST') {
            rawBody = await new Promise((resolve, reject) => {
              const chunks = [];
              req.on('data', (c) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
              req.on('error', reject);
            });
          }

          // Si KV direct absent localement (ex: [SENSITIVE]), relayer vers l'API Vercel si déployée
          const kv = getKvCredentials(process.env);
          if (!kv.valid) {
            try {
              const targetUrl = query.backupId
                ? `${PROD_CLOUD_API}?backupId=${encodeURIComponent(query.backupId)}`
                : PROD_CLOUD_API;
              const remoteRes = await fetch(targetUrl, {
                method: req.method,
                headers: req.method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
                body: req.method === 'POST' ? rawBody : undefined,
                signal: AbortSignal.timeout(4000),
              });
              const contentType = remoteRes.headers.get('content-type') || '';
              if (contentType.includes('application/json')) {
                const jsonText = await remoteRes.text();
                res.statusCode = remoteRes.status;
                res.setHeader('Content-Type', 'application/json');
                res.end(jsonText);
                return;
              }
            } catch {
              // Hors-ligne ou API prod non encore déployée -> repli local persistant
            }
          }

          let result;
          if (req.method === 'GET') {
            result = await handleApiGet(process.env, query);
          } else if (req.method === 'POST') {
            const parsed = rawBody ? JSON.parse(rawBody) : {};
            result = await handleApiPost(process.env, parsed);
          } else {
            result = { status: 405, body: { ok: false, error: 'Méthode non autorisée.' } };
          }

          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: err?.message || 'Erreur serveur' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['ios >= 12', 'safari >= 12'],
      modernPolyfills: true,
    }),
    cloudApiMiddlewarePlugin(),
  ],
});
