// Rendu hors navigateur des écrans Fast Direct : détecte les erreurs qui
// n'apparaissent qu'à l'exécution (composant, hook, prop ou état initial).
// Exécution : node client/scripts/fast-direct-render.spec.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const store = new Map();
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
globalThis.window.location = globalThis.window.location || {
  href: 'http://localhost/',
  origin: 'http://localhost',
};
globalThis.document = globalThis.document || { addEventListener: noop, removeEventListener: noop };

let failures = 0;
function check(label, condition, details = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${details ? ` — ${details}` : ''}`);
  }
}

const vite = await createServer({
  root: CLIENT_DIR,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

const session = {
  id: 'fd_render',
  name: 'ASUL vs Nantes',
  team1_name: 'ASUL',
  team2_name: 'Nantes',
  join_code: 'ABC234',
  session_kind: 'fast_direct',
};

const state = {
  rows: [
    {
      uid: 'r1',
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
    },
  ],
  matchList: ['ASUL'],
  setterList: [{ code: '6', name: 'PAUL' }],
  sheetConfigs: [{ id: 'S6', title: 'PAUL', setter: '6', matches: ['ASUL'] }],
  teamLineup: {},
  revision: 3,
};

try {
  const table = (await vite.ssrLoadModule('/src/features/fast-direct/components/FastDirectDataTable.jsx')).default;
  const tableHtml = renderToString(
    React.createElement(table, { rows: state.rows, setterList: state.setterList })
  );
  check('tableau de consultation rendu', tableHtml.includes('ASUL') && tableHtml.includes('lecture seule'));

  const tabletSaisie = (await vite.ssrLoadModule('/src/features/fast-direct/components/TabletSaisieView.jsx')).default;
  const tabletHtml = renderToString(
    React.createElement(tabletSaisie, {
      rows: state.rows,
      allMatches: state.matchList,
      allSetters: state.setterList,
      sheetConfigs: state.sheetConfigs,
      onAddRow: noop,
      onUpdateRow: noop,
      onDeleteRow: noop,
      onUndoLast: noop,
      onAddMatch: noop,
      onDeleteMatch: noop,
      onRenameMatch: noop,
      onAddSetter: noop,
      onDeleteSetter: noop,
      onCreateSheet: noop,
      onRequestBlankReset: noop,
    })
  );
  check(
    'TabletSaisieView identique à pancake-distribution (4 étapes dont Position P1..P6)',
    tabletHtml.includes('Position') &&
      tabletHtml.includes('Étape 1 / 4') &&
      tabletHtml.includes('Quelle POSITION (Rotation)') &&
      tabletHtml.includes('Passeur en zone')
  );

  const workspace = (await vite.ssrLoadModule('/src/features/fast-direct/FastDirectWorkspace.jsx')).default;
  const workspaceHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(workspace, {
      session,
      user: { id: 1, name: 'Test' },
      initialData: {
        rows: [],
        matchList: ['ASUL'],
        setterList: [{ code: '6', name: 'PAUL' }],
        sheetConfigs: [],
        teamLineup: {},
      },
    }))
  );
  check(
    'espace distribution rendu',
    workspaceHtml.includes('Fast Direct') &&
      workspaceHtml.includes('Exporter Excel') &&
      workspaceHtml.includes('ABC234')
  );

  const statsShell = (await vite.ssrLoadModule('/src/features/fast-direct/FastDirectStatsShell.jsx')).default;
  const statsShellHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(statsShell, {
      session,
      user: { id: 1, name: 'Test' },
      initialData: {
        rows: [],
        matchList: ['ASUL'],
        setterList: [{ code: '6', name: 'PAUL' }],
        sheetConfigs: [],
        teamLineup: {},
      },
    }))
  );
  check(
    'coque Appareil Stats rendue avec les 3 onglets',
    statsShellHtml.includes('Distribution') &&
      statsShellHtml.includes('Autres stats') &&
      statsShellHtml.includes('Caméra') &&
      statsShellHtml.includes('ABC234')
  );

  const statsPane = (await vite.ssrLoadModule('/src/features/fast-direct/components/FastDirectStatsPane.jsx')).default;
  const statsPaneLiveHtml = renderToString(
    React.createElement(statsPane, { session, readOnly: false, active: true })
  );
  const statsPaneBenchHtml = renderToString(
    React.createElement(statsPane, { session, readOnly: true, active: true })
  );
  check(
    'panneau Stats Fast Direct rendu en mode live et banc',
    statsPaneLiveHtml.includes('mode=live&amp;session=fd_render') &&
      statsPaneBenchHtml.includes('mode=bench&amp;session=fd_render') &&
      statsPaneBenchHtml.includes('Consultation seule')
  );

  const linksModule = await vite.ssrLoadModule(
    '/src/features/fast-direct/components/FastDirectJoinLinks.jsx'
  );
  check(
    'adresse LAN préférée à localhost',
    linksModule.resolveInviteBase('http://localhost:3001', 'http://192.168.1.42:3001') ===
      'http://192.168.1.42:3001'
  );
  check(
    'liens des 3 appareils générés (stats, bench, camera)',
    linksModule.buildFastDirectInviteUrl('http://192.168.1.42:3001', 'ABC234', 'stats') ===
      'http://192.168.1.42:3001/fast-direct/join/ABC234?role=stats' &&
      linksModule.buildFastDirectInviteUrl('http://192.168.1.42:3001', 'ABC234', 'bench') ===
        'http://192.168.1.42:3001/fast-direct/join/ABC234?role=bench' &&
      linksModule.buildFastDirectInviteUrl('http://192.168.1.42:3001', 'ABC234', 'camera') ===
        'http://192.168.1.42:3001/fast-direct/join/ABC234?role=camera'
  );
  check(
    'anciens alias distribution / viewer normalisés',
    linksModule.normalizeFastDirectRole('distribution') === 'stats' &&
      linksModule.normalizeFastDirectRole('viewer') === 'bench'
  );

  const shareHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(linksModule.default, { session }))
  );
  check('code visible dans l’en-tête de distribution', shareHtml.includes('ABC234'));

  const home = (await vite.ssrLoadModule('/src/pages/FastDirectHomePage.jsx')).default;
  const homeHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(home, {
      user: { id: 1, name: 'Test' },
      onLogout: noop,
    }))
  );
  check(
    'accueil Fast Direct rendu',
    homeHtml.includes('Fast Direct') &&
      homeHtml.includes('Aucun code à saisir') &&
      !homeHtml.includes('placeholder="CODE"'),
    homeHtml.slice(0, 300)
  );

  const joinPage = (await vite.ssrLoadModule('/src/pages/FastDirectJoinPage.jsx')).default;
  const joinBenchHtml = renderToString(
    React.createElement(MemoryRouter, { initialEntries: ['/fast-direct/join/ABC234?role=bench'] },
      React.createElement(joinPage, { user: { id: 1, name: 'Test' } })
    )
  );
  const joinStatsHtml = renderToString(
    React.createElement(MemoryRouter, { initialEntries: ['/fast-direct/join/ABC234?role=stats'] },
      React.createElement(joinPage, { user: { id: 1, name: 'Test' } })
    )
  );
  check(
    'page de lien rendue avec les rôles bench et stats',
    joinBenchHtml.includes('Banc (Tablette)') &&
      joinStatsHtml.includes('Appareil Stats')
  );

  const pageModule = await vite.ssrLoadModule('/src/pages/FastDirectPage.jsx');
  const pageHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(pageModule.default, {
      user: { id: 1, name: 'Test' },
      onLogout: noop,
    }))
  );
  check('page de session rendue pendant le chargement', pageHtml.includes('Chargement de la session Fast Direct'));
  check(
    'résolution des rôles et vues d’appareils',
    pageModule.resolveDeviceMode('statistician', 'bench') === 'bench' &&
      pageModule.resolveDeviceMode('stats', '') === 'stats' &&
      pageModule.resolveDeviceMode('bench', 'stats') === 'bench' &&
      pageModule.resolveDeviceMode('viewer', 'stats') === 'bench' &&
      pageModule.resolveDeviceMode('camera', 'stats') === 'camera'
  );

  const bench = (await vite.ssrLoadModule('/src/features/fast-direct/components/FastDirectBench.jsx')).default;
  const benchHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(bench, {
      session,
      user: { id: 1, name: 'Test' },
      role: 'bench',
      onLogout: noop,
    }))
  );
  check(
    'banc tablette Fast Direct rendu avec exactement 2 onglets et P1–P6',
    benchHtml.includes('Banc · lecture seule') &&
      benchHtml.includes('Distribution P1–P6') &&
      benchHtml.includes('>Stats<') &&
      benchHtml.includes('P1') &&
      benchHtml.includes('P6') &&
      benchHtml.includes('mode=bench&amp;session=fd_render')
  );

  const cameraPanel = (await vite.ssrLoadModule('/src/components/LiveCameraPanel.jsx')).default;
  const panelHtml = renderToString(
    React.createElement(cameraPanel, {
      sessionId: session.id,
      active: false,
      delay: 10,
      canChangeDelay: true,
      onDelayChange: noop,
      canStartLocal: false,
    })
  );
  check('sélecteur de délai disponible pour le banc', panelHtml.includes('Délai'));

  const cameraPage = (await vite.ssrLoadModule('/src/features/fast-direct/components/FastDirectCameraPage.jsx')).default;
  const cameraHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(cameraPage, { session }))
  );
  check(
    'écran caméra rendu avec sélecteur de périphérique',
    cameraHtml.includes('Caméra Fast Direct') &&
      cameraHtml.includes('Démarrer la caméra') &&
      cameraHtml.includes('Caméra utilisée') &&
      cameraHtml.includes('Actualiser')
  );

  const cameraBigView = (await vite.ssrLoadModule(
    '/src/features/fast-direct/components/FastDirectCameraBigView.jsx'
  )).default;
  const cameraBigHtml = renderToString(
    React.createElement(MemoryRouter, null, React.createElement(cameraBigView, { session }))
  );
  check(
    'caméra en grand rendue dans un onglet dédié depuis le Banc',
    cameraBigHtml.includes('Caméra du match') &&
      cameraBigHtml.includes('Plein écran') &&
      cameraBigHtml.includes('Délai') &&
      cameraBigHtml.includes('Aucune caméra active')
  );
  check(
    'le Banc ouvre la caméra en grand (nouvel onglet)',
    benchHtml.includes('Ouvrir la caméra en grand dans un nouvel onglet')
  );

  const statsPage = (await vite.ssrLoadModule('/src/pages/StatsFastDirectPage.jsx')).default;
  const statsHtml = renderToString(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(statsPage, { user: { id: 1, name: 'Test' }, onLogout: noop })
    )
  );
  check(
    'app Stats Fast Direct rendue dans Pancake',
    statsHtml.includes('Stats Fast Direct') && statsHtml.includes('stats-fast-direct/index.html')
  );
} catch (err) {
  failures += 1;
  console.error(err);
}

await vite.close();
console.log(`\n${failures === 0 ? 'Rendu Fast Direct validé.' : `${failures} rendu(s) en échec.`}`);
if (failures > 0) process.exit(1);
