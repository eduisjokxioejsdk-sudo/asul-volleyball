// ============================================================================
// Test de rendu : la page de codage d'un match se rend-elle sans planter ?
//
// C'est le contrôle qui manquait : une erreur au rendu (valeur utilisée avant
// sa déclaration, composant non importé…) produit un ÉCRAN NOIR, invisible pour
// la compilation. Ici, la page est réellement rendue hors navigateur (Vite en
// mode SSR), avec un routeur en mémoire et un faux serveur d'API.
//
// Exécution : node client/scripts/render-smoke.mjs
// ============================================================================

import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const CLIENT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

// --- Environnement minimal du navigateur -----------------------------------
const noop = () => {};
const store = new Map();
globalThis.window = globalThis.window || {};
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window.addEventListener = noop;
globalThis.window.removeEventListener = noop;
globalThis.window.location = globalThis.window.location || { href: 'http://localhost/', origin: 'http://localhost' };
globalThis.window.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop });
globalThis.window.confirm = () => false;
globalThis.document = globalThis.document || { addEventListener: noop, removeEventListener: noop };
globalThis.SVGElement = globalThis.SVGElement || class SVGElement {};
globalThis.HTMLElement = globalThis.HTMLElement || class HTMLElement {};

const vite = await createServer({
  root: CLIENT_DIR,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

/** Rend une page et renvoie l'erreur éventuelle. */
async function renderRoute(modulePath, exportName, props = {}, route = '/datavolley/1') {
  const mod = await vite.ssrLoadModule(modulePath);
  const Page = mod[exportName] || mod.default;

  const element = React.createElement(
    MemoryRouter,
    { initialEntries: [route] },
    React.createElement(
      Routes,
      null,
      React.createElement(Route, { path: '/datavolley/:id', element: React.createElement(Page, props) })
    )
  );

  try {
    const html = renderToString(element);
    return { html, error: null };
  } catch (err) {
    return { html: '', error: err };
  }
}

console.log('\n== Rendu de la page de codage d’un match ==');
const page = await renderRoute('/src/pages/DataVolleyDashboard.jsx', 'default', {
  user: { email: 'coach@asul.test', name: 'Coach' },
  onLogout: () => {},
});
check(
  'la page se rend sans erreur',
  page.error === null,
  page.error ? `${page.error.name}: ${page.error.message}` : ''
);
if (page.error) {
  console.log(page.error.stack?.split('\n').slice(0, 6).join('\n'));
}
check('la page affiche quelque chose', page.html.length > 0, `${page.html.length} caractères`);
check(
  'le chargement est affiché (aucun écran noir)',
  /Chargement du codage|app-loading/.test(page.html),
  page.html.slice(0, 200)
);

console.log('\n== Rendu de l’accueil ==');
const home = await renderRoute('/src/pages/Dashboard.jsx', 'default', { user: { email: 'coach@asul.test' } });
check('l’accueil se rend sans erreur', home.error === null, home.error ? home.error.message : '');
check('l’accueil affiche du contenu', home.html.length > 0);

console.log('\n== Rendu des composants des modes ==');
for (const [file, name, props] of [
  ['/src/components/DvModeBar.jsx', 'default', { mode: 'saisie', onMode: noop }],
  ['/src/components/DvFilterPanel.jsx', 'default', { filters: {}, onFilters: noop, options: {} }],
  ['/src/components/DvCodeList.jsx', 'default', { rallies: [] }],
  ['/src/components/DvRotationWindow.jsx', 'default', { state: { setNumber: 1 }, team1: 'ASUL', team2: 'Nantes' }],
  ['/src/components/DvCommandWindow.jsx', 'default', { open: true, onClose: noop, onSubmit: noop }],
  ['/src/components/DvConsultationPane.jsx', 'default', { points: [], segments: [], filters: {}, onFilters: noop }],
  ['/src/components/DvCorrectionPane.jsx', 'default', { actions: [], rallies: [], sync: {} }],
]) {
  const mod = await vite.ssrLoadModule(file);
  const Comp = mod[name] || mod.default;
  try {
    const html = renderToString(React.createElement(Comp, props));
    check(`${path.basename(file)} se rend`, html.length > 0);
  } catch (err) {
    check(`${path.basename(file)} se rend`, false, `${err.name}: ${err.message}`);
  }
}

// --- Menu des fenêtres : profils de disposition ------------------------------
console.log('\n== Profils de fenêtres ==');
{
  const mod = await vite.ssrLoadModule('/src/components/PanelsMenu.jsx');
  const Menu = mod.default;
  try {
    const html = renderToString(
      React.createElement(Menu, {
        layout: { video: { x: 0, y: 0, w: 600, h: 340, open: true }, console: { x: 0, y: 350, w: 600, h: 300, open: true } },
        onToggle: noop,
        onSetMany: noop,
        onReset: noop,
        profiles: [{ id: 'p1', name: 'Saisie club', layout: {} }],
        onSaveProfile: () => ({ id: 'p1', name: 'Saisie club' }),
        onApplyProfile: noop,
        onDeleteProfile: noop,
        initialOpen: true,
      })
    );
    check('le menu rend la section « Profils de fenêtres »', /Profils de fenêtres/.test(html));
    check('le profil enregistré est proposé', /Saisie club/.test(html));
    check('les boutons Appliquer / Enregistrer sont présents', /Appliquer/.test(html) && /Enregistrer/.test(html));
  } catch (err) {
    check('le menu rend la section « Profils de fenêtres »', false, `${err.name}: ${err.message}`);
  }
}

// --- Liste des codes en accordéon : 60 points / 200 actions -----------------
console.log('\n== Liste des codes : 60 points, 200 actions ==');
const { makeAction, groupActionsIntoRallies } = await vite.ssrLoadModule('/src/utils/datavolley.js');
const pad = (n) => String(n).padStart(2, '0');
const listActions = [];
for (let p = 1; p <= 60; p += 1) {
  const long = p <= 20; // 20 points à 4 actions + 40 points à 3 actions = 200
  const codes = long
    ? ['*01S5', 'a02R1+', 'a03D6', `a04A${(p % 9) + 1}${((p + 1) % 9) + 1}#`]
    : ['*01S5', 'a02R1+', `a03A${(p % 9) + 1}${((p + 1) % 9) + 1}#`];
  for (const code of codes) {
    const a = makeAction(code.replace('01', pad((p % 20) + 1)), p * 10 + listActions.length);
    listActions.push(a);
  }
}
const smokeRallies = groupActionsIntoRallies(listActions);
check('200 actions construites', listActions.length === 200, `${listActions.length}`);
check('60 points construits', smokeRallies.length === 60, `${smokeRallies.length}`);
{
  const mod = await vite.ssrLoadModule('/src/components/DvCodeList.jsx');
  const Comp = mod.default;
  try {
    const html = renderToString(
      React.createElement(Comp, {
        rallies: smokeRallies,
        mode: 'consultation',
        activeIndex: listActions[150].action_index,
        issues: [],
        onEditCode: noop,
      })
    );
    check('DvCodeList (60 points) se rend', html.length > 0 && (html.match(/dvc-point\b/g) || []).length >= 60);
    check('l’en-tête résume le point (actions + badge)', /Point/.test(html) && /action/.test(html) && /dvc-badge/.test(html));
    check('la barre d’outils est présente', /Tout replier/.test(html) && /Tout déplier/.test(html));
    check('l’édition par double-clic est annoncée', /Double-clic sur une action/.test(html));
  } catch (err) {
    check('DvCodeList (60 points) se rend', false, `${err.name}: ${err.message}`);
  }
}

// --- Directions : terrain à 2 clics -----------------------------------------
console.log('\n== Directions d’attaque ==');
{
  const mod = await vite.ssrLoadModule('/src/components/DirectionCourt.jsx');
  const Picker = mod.default;
  const Map = mod.DirectionMap;
  try {
    const html = renderToString(
      React.createElement(Picker, { startZone: '4', endZone: '5', onChange: noop })
    );
    check('DirectionCourt se rend', /dirc-court/.test(html) && /FILET/.test(html));
    check('les 2 zones sont affichées', /Départ/.test(html) && /Arrivée/.test(html));
    const mapHtml = renderToString(
      React.createElement(Map, {
        rows: [
          { key: '4 → 5', start: '4', end: '5', total: 3 },
          { key: '2 → 1', start: '2', end: '1', total: 1 },
        ],
      })
    );
    check('DirectionMap se rend', /4 → 5|direction/.test(mapHtml) && /FILET/.test(mapHtml));
  } catch (err) {
    check('DirectionCourt se rend', false, `${err.name}: ${err.message}`);
  }

  // Fenêtre séparée : terrain complet, trajectoire + historique transparent.
  const Full = (await vite.ssrLoadModule('/src/components/AttackDirectionCourt.jsx')).default;
  try {
    const html = renderToString(
      React.createElement(Full, {
        startZone: '4',
        endZone: '5',
        side: 'home',
        playerLabel: 'n°07',
        history: [
          { start: '4', end: '5' },
          { start: '2', end: '1' },
        ],
        onChange: noop,
      })
    );
    check('AttackDirectionCourt se rend', /adc-court/.test(html) && /DIRECTION D’ATTAQUE/.test(html));
    check('la trajectoire et l’historique sont dessinés', /markerEnd|marker-end/.test(html) && /4/.test(html));
    check('aucun type d’attaque demandé', !/feinte|continuité|faute/i.test(html));
  } catch (err) {
    check('AttackDirectionCourt se rend', false, `${err.name}: ${err.message}`);
  }
}

// --- Menu d'analyse : toutes les fenêtres ----------------------------------
console.log('\n== Menu des fenêtres d’analyse ==');
{
  const mod = await vite.ssrLoadModule('/src/components/DvAnalysisPane.jsx');
  const windows = [
    ...['Synthèse', 'Service', 'Réception', 'Attaque', 'Combinaisons', 'Contre', 'Défense / Passe', 'Zones', 'Situations', 'Rotations', 'Classements', 'Par set', 'Joueurs', 'Directions'].map(
      (label, i) => ({ key: `w${i}`, label })
    ),
    { key: 'points', label: 'Points' },
    { key: 'distribution', label: 'Distribution' },
  ];
  try {
    const html = renderToString(React.createElement(mod.DvAnalysisMenu, { windows, windowKey: 'w0', onWindow: noop }));
    check('DvAnalysisMenu expose toutes les fenêtres', windows.every((w) => html.includes(w.label)));
  } catch (err) {
    check('DvAnalysisMenu expose toutes les fenêtres', false, `${err.name}: ${err.message}`);
  }
}

// --- Rapport complet : CHAQUE fenêtre (ce qui manquait en 3.0.0) -------------
console.log('\n== Rapport : chaque fenêtre d’analyse ==');
{
  const { computeScouting } = await vite.ssrLoadModule('/src/utils/scouting.js');
  const mod = await vite.ssrLoadModule('/src/components/MatchReportFull.jsx');
  const Report = mod.default;
  const report = computeScouting({
    actions: listActions,
    homeConfig: { roster: [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, name: `Joueur ${n}`, role: 'universal' })), libero: 6 },
    awayConfig: { roster: [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, name: `Visiteur ${n}`, role: 'universal' })), libero: 6 },
    homeName: 'ASUL',
    awayName: 'Nantes',
  });
  check('le rapport se calcule', report.actionCount > 0, `${report.actionCount}`);
  for (const t of mod.REPORT_TABS) {
    try {
      const html = renderToString(
        React.createElement(Report, {
          report,
          tab: t.key,
          onTab: noop,
          hideTabs: true,
          rawActions: listActions,
        })
      );
      check(`fenêtre « ${t.label} » se rend`, html.length > 0, `${html.length} caractères`);
    } catch (err) {
      check(`fenêtre « ${t.label} » se rend`, false, `${err.name}: ${err.message}`);
    }
  }
  check('la fenêtre Directions affiche un agrégat « → »', (() => {
    const html = renderToString(
      React.createElement(Report, { report, tab: 'directions', onTab: noop, hideTabs: true, rawActions: listActions })
    );
    return html.includes('→') && html.includes('dirc-table');
  })());
}

await vite.close();
console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);