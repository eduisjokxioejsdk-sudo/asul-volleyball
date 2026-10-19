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

await vite.close();
console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
