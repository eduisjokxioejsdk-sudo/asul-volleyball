// Rendu hors navigateur de l'app Fast Direct Analytics : détecte les erreurs qui
// n'apparaissent qu'à l'exécution (composants, hooks, états initiaux).
// Exécution : node fast-direct-analytics/scripts/render.spec.mjs
import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};

const store = new Map();
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  key: (index) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
};
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
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
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

const rawRows = [
  { id: 1, match: 'MATCH 1', rotation: '1', setter: '6', service: 'F', zoneR: '5', qualiteR: '#', zoneP: '3', baseOff: '1', distribP: '5', joueur: '1', resAtt: '-' },
  { id: 2, match: 'MATCH 1', rotation: '1', setter: '6', service: 'F', zoneR: '6', qualiteR: '+', zoneP: '2', baseOff: '2', distribP: '6', joueur: '3', resAtt: '#' },
  { id: 3, match: 'MATCH 2', rotation: '4', setter: 'NP', service: 'F', zoneR: '4', qualiteR: '0', zoneP: '5', baseOff: '0', distribP: '10', joueur: '2', resAtt: '-' },
];

try {
  const App = (await vite.ssrLoadModule('/src/App.jsx')).default;
  const appHtml = renderToString(React.createElement(App));
  check('application rendue', appHtml.includes('Fast Direct Analytics'));
  check('écran vide rendu', appHtml.includes('Aucune donnée Fast Direct chargée'));
  check('panneau de source rendu', appHtml.includes('Sessions détectées dans ce navigateur'));

  const engine = await vite.ssrLoadModule('/src/utils/statsEngine.js');
  const rows = rawRows.map((row, index) => engine.normalizeRow(row, index));
  const stats = engine.computeStats(rows);

  const panels = await vite.ssrLoadModule('/src/components/StatsPanels.jsx');
  const panelChecks = [
    ['vue d’ensemble', panels.OverviewPanel, { stats }, 'Distribution par zone cible'],
    ['réception', panels.ReceptionPanel, { reception: stats.reception }, 'Zones de réception'],
    ['distribution', panels.DistributionPanel, { distribution: stats.distribution }, 'Détail par code de distribution'],
    ['attaquants', panels.PlayersPanel, { players: stats.players, distribution: stats.distribution }, 'Utilisation des attaquants'],
    ['matchs', panels.MatchesPanel, { matches: stats.matches }, 'Synthèse par match'],
    ['combinaisons', panels.CombosPanel, { combos: stats.combos }, 'Combinaisons les plus utilisées'],
  ];
  panelChecks.forEach(([label, Component, props, expected]) => {
    const html = renderToString(React.createElement(Component, props));
    check(`panneau ${label} rendu`, html.includes(expected), expected);
  });

  const DataTablePanel = (await vite.ssrLoadModule('/src/components/DataTablePanel.jsx')).default;
  const tableHtml = renderToString(
    React.createElement(DataTablePanel, { rows, onExportCsv: noop })
  );
  check('tableau des données rendu', tableHtml.includes('MATCH 1') && tableHtml.includes('Exporter CSV'));

  const FiltersBar = (await vite.ssrLoadModule('/src/components/FiltersBar.jsx')).default;
  const filtersHtml = renderToString(
    React.createElement(FiltersBar, {
      options: engine.filterOptions(rows),
      filters: { matches: ['MATCH 1'], setters: [], rotations: [], players: [] },
      onChange: noop,
      onReset: noop,
      filteredCount: 2,
      totalCount: 3,
    })
  );
  check('barre de filtres rendue', filtersHtml.includes('Matchs') && filtersHtml.includes('MATCH 1'));

  const DataSourcePanel = (await vite.ssrLoadModule('/src/components/DataSourcePanel.jsx')).default;
  const sourceHtml = renderToString(
    React.createElement(DataSourcePanel, {
      sessions: [{ prefix: 'pancake_fd_demo_', sessionId: 'demo', label: 'Session demo', rowCount: 12, matchCount: 2 }],
      dataset: null,
      onImportFile: noop,
      onPickSession: noop,
      onClear: noop,
    })
  );
  check('source .json proposée', sourceHtml.includes('Déposer la sauvegarde .json'));
  check('session locale listée', sourceHtml.includes('Session demo') && sourceHtml.includes('action(s)'));
} finally {
  await vite.close();
}

if (failures > 0) {
  console.error(`\n${failures} rendu(s) en échec.`);
  process.exit(1);
}
console.log('\nRendus Fast Direct Analytics validés.');
