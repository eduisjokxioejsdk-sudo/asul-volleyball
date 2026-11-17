// Test fonctionnel du mode Fast Direct contre un serveur local démarré.
// Exécution : node server/scripts/fast-direct-api.spec.mjs
const BASE = process.env.API_URL || 'http://localhost:3001/api';
let failures = 0;

function check(label, condition, details = '') {
  if (condition) {
    console.log(`OK  ${label}`);
  } else {
    failures += 1;
    console.error(`KO  ${label}${details ? ` — ${details}` : ''}`);
  }
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function register(label) {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const res = await request('/auth/register', {
    method: 'POST',
    body: {
      email: `fast_direct_${label}_${stamp}@example.test`,
      password: 'FastDirect-2026!',
      name: `FD ${label}`,
    },
  });
  if (res.status !== 201) throw new Error(`Inscription ${label} impossible: ${JSON.stringify(res.data)}`);
  return res.data;
}

const state = (label) => ({
  rows: [
    {
      uid: 'row_1',
      match: 'ASUL',
      rotation: '1',
      setter: '6',
      service: 'S',
      zoneR: '5',
      qualiteR: '#',
      zoneP: '3',
      baseOff: '1',
      distribP: '4',
      joueur: '1',
      resAtt: '#',
      label,
    },
  ],
  matchList: ['ASUL'],
  setterList: [{ code: '6', name: 'PAUL' }],
  sheetConfigs: [{ id: 'S6', title: 'PAUL', setter: '6', matches: ['ASUL'] }],
  teamLineup: { 1: { num: '6', role: 'Passeur' } },
});

console.log('== Création de la session Fast Direct ==');
const owner = await register('owner');
const scout = await register('scout');
const viewer = await register('viewer');
const camera = await register('camera');

const created = await request('/live', {
  method: 'POST',
  token: owner.token,
  body: {
    mode: 'fast_direct',
    name: 'Test Fast Direct',
    team1_name: 'ASUL',
    team2_name: 'Adversaire',
  },
});
check('création HTTP 201', created.status === 201, JSON.stringify(created.data));
check('type fast_direct conservé', created.data.session_kind === 'fast_direct');
const sessionId = created.data.id;
const joinCode = created.data.join_code;

console.log('\n== Jonction et rôles ==');
const joinedScout = await request('/live/join', {
  method: 'POST',
  token: scout.token,
  body: { join_code: joinCode, role: 'distribution' },
});
check('distribution rejoint', joinedScout.status === 200 && joinedScout.data.session_kind === 'fast_direct');

const joinedViewer = await request('/live/join', {
  method: 'POST',
  token: viewer.token,
  body: { join_code: joinCode, role: 'viewer' },
});
check('banc rejoint', joinedViewer.status === 200);

const joinedCamera = await request('/live/join', {
  method: 'POST',
  token: camera.token,
  body: { join_code: joinCode, role: 'camera' },
});
check('caméra rejoint', joinedCamera.status === 200);

const defaultJoin = await request('/live/join', {
  method: 'POST',
  token: viewer.token,
  body: { join_code: joinCode },
});
check('rôle absent = viewer (aucun droit d’écriture)', defaultJoin.status === 200);

console.log('\n== Écriture et versions ==');
const firstSave = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: scout.token,
  body: { state: state('initial'), baseRevision: 0 },
});
check('distribution écrit la version 1', firstSave.status === 200 && firstSave.data.revision === 1);

const secondSave = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: scout.token,
  body: { state: state('mise-a-jour'), baseRevision: 1 },
});
check('distribution écrit la version 2', secondSave.status === 200 && secondSave.data.revision === 2);

const stale = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: scout.token,
  body: { state: state('perimee'), baseRevision: 1 },
});
check('ancienne révision refusée', stale.status === 409 && stale.data.revision === 2);

console.log('\n== Lecture seule ==');
const readViewer = await request(`/live/${sessionId}/fast-direct`, { token: viewer.token });
check(
  'le banc lit la dernière version',
  readViewer.status === 200 && readViewer.data.state?.rows?.[0]?.label === 'mise-a-jour'
);
const writeViewer = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: viewer.token,
  body: { state: state('interdit'), baseRevision: 2 },
});
check('le banc ne peut pas écrire', writeViewer.status === 403);

const selfPromote = await request(
  `/live/${sessionId}/members/${joinedViewer.data.memberId}`,
  {
    method: 'PUT',
    token: viewer.token,
    body: { role: 'distribution' },
  }
);
check('le banc ne peut pas s’attribuer un rôle éditeur', selfPromote.status === 403);

const writeCamera = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: camera.token,
  body: { state: state('interdit'), baseRevision: 2 },
});
check('la caméra ne peut pas écrire', writeCamera.status === 403);

const mine = await request('/live/mine', { token: owner.token });
const listed = (mine.data.sessions || []).find((s) => s.id === sessionId);
check('session listée sans l’état volumineux', listed && listed.fast_direct_state === undefined);

const fullSession = await request(`/live/${sessionId}`, { token: viewer.token });
check(
  'état complet accessible au banc sans le champ brut',
  fullSession.status === 200 && fullSession.data.session?.fast_direct_state === undefined
);

console.log('\n== Isolation du mode DataVolley ==');
const dv = await request('/live', {
  method: 'POST',
  token: owner.token,
  body: { name: 'Direct DV test', team1_name: 'A', team2_name: 'B' },
});
check('direct existant reste datavolley', dv.data.session_kind === 'datavolley');
const dvFast = await request(`/live/${dv.data.id}/fast-direct`, { token: owner.token });
check('état Fast Direct refusé pour un direct DV', dvFast.status === 409);

// Nettoyage des deux sessions de test.
const delFd = await request(`/live/${sessionId}`, { method: 'DELETE', token: owner.token });
const delDv = await request(`/live/${dv.data.id}`, { method: 'DELETE', token: owner.token });
check('nettoyage des sessions de test', delFd.status === 200 && delDv.status === 200);

console.log(`\n${failures === 0 ? 'Tous les contrôles passent.' : `${failures} contrôle(s) en échec.`}`);
if (failures > 0) process.exit(1);
