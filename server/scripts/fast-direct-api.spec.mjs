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

const statsState = (label) => ({
  v: 2,
  players: [{ id: 'p1', num: 6, first: 'Paul', name: 'D.', starter: true }],
  match: {
    id: 'm1',
    us: 'ASUL',
    opp: 'Adversaire',
    date: '2026-11-21',
    place: '',
    set: 1,
    scores: [{ u: 1, o: 0 }],
    adv: { s: 0, a: 0, d: 0 },
  },
  actions: [{ id: label, pid: 'p1', num: 6, k: 'S', r: 'S#', set: 1, sc: 'u', ts: '2026-11-21T12:00:00.000Z' }],
  archive: [],
  opp: [{ id: 'o1', num: '1', first: 'Adv', name: '' }],
  oact: [],
});

console.log('== Création de la session Fast Direct ==');
const owner = await register('owner');
const statsUser = await register('stats');
const legacyDistUser = await register('legacy_dist');
const benchUser = await register('bench');
const legacyViewerUser = await register('legacy_viewer');
const cameraUser = await register('camera');

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

console.log('\n== Jonction et rôles (stats, bench, camera + rétro-compatibilité) ==');
const joinedStats = await request('/live/join', {
  method: 'POST',
  token: statsUser.token,
  body: { join_code: joinCode, role: 'stats' },
});
check('appareil stats rejoint', joinedStats.status === 200 && joinedStats.data.session_kind === 'fast_direct');

const joinedLegacyDist = await request('/live/join', {
  method: 'POST',
  token: legacyDistUser.token,
  body: { join_code: joinCode, role: 'distribution' },
});
check('alias distribution rejoint', joinedLegacyDist.status === 200);

const joinedBench = await request('/live/join', {
  method: 'POST',
  token: benchUser.token,
  body: { join_code: joinCode, role: 'bench' },
});
check('appareil banc rejoint', joinedBench.status === 200);

const joinedLegacyViewer = await request('/live/join', {
  method: 'POST',
  token: legacyViewerUser.token,
  body: { join_code: joinCode, role: 'viewer' },
});
check('alias viewer rejoint', joinedLegacyViewer.status === 200);

const joinedCamera = await request('/live/join', {
  method: 'POST',
  token: cameraUser.token,
  body: { join_code: joinCode, role: 'camera' },
});
check('appareil caméra rejoint', joinedCamera.status === 200);

const defaultJoin = await request('/live/join', {
  method: 'POST',
  token: benchUser.token,
  body: { join_code: joinCode },
});
check('rôle absent = bench (aucun droit d’écriture)', defaultJoin.status === 200);

const ownerRejoin = await request('/live/join', {
  method: 'POST',
  token: owner.token,
  body: { join_code: joinCode, role: 'bench' },
});
const ownerState = await request(`/live/${sessionId}`, { token: owner.token });
check(
  'le lien Banc ne rétrograde pas le PC hôte',
  ownerRejoin.status === 200 && ownerState.data.me?.role === 'statistician'
);

console.log('\n== Écriture et versions Distribution ==');
const firstSave = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: statsUser.token,
  body: { state: state('initial'), baseRevision: 0 },
});
check('appareil stats écrit la distribution v1', firstSave.status === 200 && firstSave.data.revision === 1);

const secondSave = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: legacyDistUser.token,
  body: { state: state('mise-a-jour'), baseRevision: 1 },
});
check('alias distribution écrit la version 2', secondSave.status === 200 && secondSave.data.revision === 2);

const stale = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: statsUser.token,
  body: { state: state('perimee'), baseRevision: 1 },
});
check('ancienne révision distribution refusée', stale.status === 409 && stale.data.revision === 2);

console.log('\n== Écriture et versions Autres stats (Volley Stats) ==');
const firstStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: statsUser.token,
  body: { state: statsState('act_1'), baseRevision: 0 },
});
check('appareil stats écrit les autres stats v1', firstStats.status === 200 && firstStats.data.revision === 1);

const secondStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: owner.token,
  body: { state: statsState('act_2'), baseRevision: 1 },
});
check('hôte écrit les autres stats v2', secondStats.status === 200 && secondStats.data.revision === 2);

const staleStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: statsUser.token,
  body: { state: statsState('perimee'), baseRevision: 1 },
});
check('ancienne révision autres stats refusée', staleStats.status === 409 && staleStats.data.revision === 2);

console.log('\n== Lecture seule Banc & Caméra ==');
const readBenchDist = await request(`/live/${sessionId}/fast-direct`, { token: benchUser.token });
check(
  'le banc lit la dernière distribution',
  readBenchDist.status === 200 && readBenchDist.data.state?.rows?.[0]?.label === 'mise-a-jour'
);
const readBenchStats = await request(`/live/${sessionId}/fast-direct-stats`, { token: benchUser.token });
check(
  'le banc lit les dernières autres stats',
  readBenchStats.status === 200 && readBenchStats.data.state?.actions?.[0]?.id === 'act_2'
);

const writeBenchDist = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: benchUser.token,
  body: { state: state('interdit'), baseRevision: 2 },
});
check('le banc ne peut pas écrire la distribution', writeBenchDist.status === 403);

const writeBenchStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: benchUser.token,
  body: { state: statsState('interdit'), baseRevision: 2 },
});
check('le banc ne peut pas écrire les autres stats', writeBenchStats.status === 403);

const writeLegacyViewerStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: legacyViewerUser.token,
  body: { state: statsState('interdit'), baseRevision: 2 },
});
check('alias viewer ne peut pas écrire les autres stats', writeLegacyViewerStats.status === 403);

const selfPromote = await request(
  `/live/${sessionId}/members/${joinedBench.data.memberId}`,
  {
    method: 'PUT',
    token: benchUser.token,
    body: { role: 'stats' },
  }
);
check('le banc ne peut pas s’attribuer un rôle éditeur', selfPromote.status === 403);

const writeCameraDist = await request(`/live/${sessionId}/fast-direct`, {
  method: 'PUT',
  token: cameraUser.token,
  body: { state: state('interdit'), baseRevision: 2 },
});
const writeCameraStats = await request(`/live/${sessionId}/fast-direct-stats`, {
  method: 'PUT',
  token: cameraUser.token,
  body: { state: statsState('interdit'), baseRevision: 2 },
});
check(
  'la caméra ne peut écrire ni distribution ni autres stats',
  writeCameraDist.status === 403 && writeCameraStats.status === 403
);

const benchDelay = await request(`/live/${sessionId}/video-delay`, {
  method: 'PUT',
  token: benchUser.token,
  body: { delay: 15 },
});
const statsDelay = await request(`/live/${sessionId}/video-delay`, {
  method: 'PUT',
  token: statsUser.token,
  body: { delay: 12 },
});
check(
  'le banc et l’appareil stats peuvent régler le délai caméra',
  benchDelay.status === 200 && benchDelay.data.delay === 15 && statsDelay.status === 200 && statsDelay.data.delay === 12
);

const mine = await request('/live/mine', { token: owner.token });
const listed = (mine.data.sessions || []).find((s) => s.id === sessionId);
check(
  'session listée sans les états volumineux',
  listed && listed.fast_direct_state === undefined && listed.fast_direct_stats_state === undefined
);

const fullSession = await request(`/live/${sessionId}`, { token: benchUser.token });
check(
  'état complet accessible au banc sans les champs bruts',
  fullSession.status === 200 &&
    fullSession.data.session?.fast_direct_state === undefined &&
    fullSession.data.session?.fast_direct_stats_state === undefined
);

console.log('\n== Isolation du mode DataVolley ==');
const dv = await request('/live', {
  method: 'POST',
  token: owner.token,
  body: { name: 'Direct DV test', team1_name: 'A', team2_name: 'B' },
});
check('direct existant reste datavolley', dv.data.session_kind === 'datavolley');
const dvFast = await request(`/live/${dv.data.id}/fast-direct`, { token: owner.token });
const dvFastStats = await request(`/live/${dv.data.id}/fast-direct-stats`, { token: owner.token });
check('états Fast Direct refusés pour un direct DV', dvFast.status === 409 && dvFastStats.status === 409);

// Nettoyage des deux sessions de test.
const delFd = await request(`/live/${sessionId}`, { method: 'DELETE', token: owner.token });
const delDv = await request(`/live/${dv.data.id}`, { method: 'DELETE', token: owner.token });
check('nettoyage des sessions de test', delFd.status === 200 && delDv.status === 200);

console.log(`\n${failures === 0 ? 'Tous les contrôles passent.' : `${failures} contrôle(s) en échec.`}`);
if (failures > 0) process.exit(1);
