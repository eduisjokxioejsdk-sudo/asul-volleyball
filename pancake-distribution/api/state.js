import { handleApiGet, handleApiPost } from './_kvStore.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const result = await handleApiGet(process.env, req.query || {});
      res.status(result.status).json(result.body);
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        body = body ? JSON.parse(body) : {};
      }
      const result = await handleApiPost(process.env, body || {});
      res.status(result.status).json(result.body);
      return;
    }

    res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });
  } catch (err) {
    console.error('[api/state]', err);
    res.status(500).json({ ok: false, error: err?.message || 'Erreur serveur Cloud.' });
  }
}
