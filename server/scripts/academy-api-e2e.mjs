// Teste l'API de progression Académie avec deux comptes et une relance serveur.
// Exécution : node server/scripts/academy-api-e2e.mjs
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(scriptDir, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-academy-'));
let child = null;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function startServer(port) {
  const logs = [];
  child = spawn(process.execPath, [path.join(serverDir, 'src', 'index.js')], {
    cwd: serverDir,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, JWT_SECRET: 'academy-e2e-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  return logs;
}

async function stopServer() {
  if (!child) return;
  const current = child;
  child = null;
  current.kill();
  await new Promise((resolve) => current.once('exit', resolve));
}

async function request(base, route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

async function waitReady(base, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child?.exitCode != null) throw new Error(`Serveur arrêté au démarrage: ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch { /* serveur pas encore prêt */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Délai de démarrage dépassé\n${serverLogs.join('')}`);
}

let serverLogs = [];

try {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  serverLogs = startServer(port);
  await waitReady(base);

  assert.equal((await request(base, '/api/academy/progress')).status, 401, 'API protégée par authentification');
  const first = await request(base, '/api/auth/register', { method: 'POST', body: { email: 'academy-a@example.test', password: 'test-password', name: 'Academy A' } });
  const second = await request(base, '/api/auth/register', { method: 'POST', body: { email: 'academy-b@example.test', password: 'test-password', name: 'Academy B' } });
  assert.equal(first.status, 201, 'premier compte créé');
  assert.equal(second.status, 201, 'second compte créé');

  const empty = await request(base, '/api/academy/progress', { token: first.data.token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.progress.completed, [], 'un compte démarre sans progression importée');

  const progress = { version: 1, completed: ['syntax-1', 'sim-compose'], xp: 50, level: 1, streak: 2, bestStreak: 2, badges: ['first-level'], lastActivityDate: new Date().toISOString().slice(0, 10) };
  assert.equal((await request(base, '/api/academy/progress', { method: 'PUT', token: first.data.token, body: { progress } })).status, 200, 'progression sauvegardée');
  assert.deepEqual((await request(base, '/api/academy/progress', { token: first.data.token })).data.progress, progress, 'progression relue pour le même compte');
  assert.deepEqual((await request(base, '/api/academy/progress', { token: second.data.token })).data.progress.completed, [], 'les comptes ne partagent pas leur progression');
  assert.equal((await request(base, '/api/academy/progress', { method: 'PUT', token: first.data.token, body: { progress: { ...progress, xp: -1 } } })).status, 400, 'les données invalides sont refusées');

  await stopServer();
  serverLogs = startServer(port);
  await waitReady(base);
  assert.deepEqual((await request(base, '/api/academy/progress', { token: first.data.token })).data.progress, progress, 'progression conservée après redémarrage');
  console.log('Académie API OK — authentification, sauvegarde, isolation par compte et persistance après redémarrage.');
} finally {
  await stopServer();
  const tempRoot = path.resolve(os.tmpdir());
  const resolvedDataDir = path.resolve(dataDir);
  if (resolvedDataDir.startsWith(`${tempRoot}${path.sep}`) && path.basename(resolvedDataDir).startsWith('asul-academy-')) {
    fs.rmSync(resolvedDataDir, { recursive: true, force: true });
  }
}
