// Vérifie les profils de fenêtres : enregistrement, mise à jour, suppression,
// et application d'une disposition à un autre match (fusion + bornage).
// Exécution : node client/scripts/panel-profiles.spec.mjs
import {
  PANEL_PROFILES_KEY,
  PANEL_PROFILE_LIMIT,
  applyProfileLayout,
  loadPanelProfiles,
  profileLayoutOf,
  removePanelProfile,
  savePanelProfile,
  sanitizePanelProfile,
  storePanelProfiles,
} from '../src/utils/panelProfiles.js';
import { PANEL_IDS, defaultPanelLayout } from '../src/utils/panelLayout.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `attendu ${e} — obtenu ${a}`);
}

/** Stockage mémoire (localStorage simulé). */
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    dump: () => map,
  };
}

const LAYOUT = {
  video: { x: 10, y: 20, w: 600, h: 340, open: true },
  console: { x: 10, y: 380, w: 600, h: 300, open: true },
  actions: { x: 640, y: 10, w: 380, h: 500, open: false },
  direction: { x: 10, y: 700, w: 600, h: 300, open: true },
  inconnu: { x: 1, y: 2, w: 3, h: 4, open: true },
};

console.log('\n== Contenu d’un profil ==');
const PROFILE_LAYOUT = profileLayoutOf(LAYOUT);
check('la fenêtre « Direction d’attaque » fait partie des fenêtres connues', PANEL_IDS.includes('direction'));
check('seules les fenêtres connues sont enregistrées', !('inconnu' in PROFILE_LAYOUT));
eq('position conservée', PROFILE_LAYOUT.actions, { x: 640, y: 10, w: 380, h: 500, open: false });
check('toutes les fenêtres connues présentes', Object.keys(PROFILE_LAYOUT).every((id) => PANEL_IDS.includes(id)));

console.log('\n== Enregistrement et mise à jour ==');
const first = savePanelProfile([], '  Saisie club  ', LAYOUT, { id: 'p1', now: '2026-10-01T10:00:00.000Z' });
check('profil créé', !!first && first.profiles.length === 1);
eq('nom nettoyé', first.profile.name, 'Saisie club');
eq('identifiant', first.profile.id, 'p1');
eq('disposition enregistrée', first.profile.layout, PROFILE_LAYOUT);

const second = savePanelProfile(
  first.profiles,
  'SAISIE CLUB',
  { ...LAYOUT, video: { ...LAYOUT.video, open: false } },
  { now: '2026-10-02T10:00:00.000Z' }
);
eq('même nom (casse différente) : un seul profil', second.profiles.length, 1);
eq('identifiant conservé', second.profile.id, 'p1');
eq('date de création conservée', second.profile.createdAt, '2026-10-01T10:00:00.000Z');
eq('date de mise à jour', second.profile.updatedAt, '2026-10-02T10:00:00.000Z');
eq('nouvelle disposition prise en compte', second.profile.layout.video.open, false);
check('nom vide refusé', savePanelProfile([], '   ', LAYOUT) === null);

const many = [];
for (let i = 0; i < PANEL_PROFILE_LIMIT + 5; i += 1) {
  const res = savePanelProfile(many, `Profil ${i}`, LAYOUT, { id: `p${i}` });
  many.length = 0;
  many.push(...res.profiles);
}
eq('nombre de profils plafonné', many.length, PANEL_PROFILE_LIMIT);
eq('les plus récents sont conservés', many[many.length - 1].name, `Profil ${PANEL_PROFILE_LIMIT + 4}`);

console.log('\n== Suppression ==');
eq('suppression par identifiant', removePanelProfile(first.profiles, 'p1').length, 0);
eq('identifiant inconnu : liste inchangée', removePanelProfile(first.profiles, 'nope').length, 1);

console.log('\n== Application à un autre match ==');
const CURRENT = defaultPanelLayout(1200, 800);
const TARGET = applyProfileLayout(
  CURRENT,
  {
    video: { x: 5, y: 6, w: 700, h: 400, open: false },
    console: { x: -50, y: -10, w: 10, h: 10, open: false },
    direction: { x: 100, y: 120, w: 320, h: 220, open: false },
  },
  { width: 1200, height: 800 }
);
eq('position et taille appliquées', { x: TARGET.video.x, y: TARGET.video.y, w: TARGET.video.w, h: TARGET.video.h }, {
  x: 5,
  y: 6,
  w: 700,
  h: 400,
});
check('la vidéo (ancre) reste ouverte', TARGET.video.open === true);
check('la zone de code (ancre) reste ouverte', TARGET.console.open === true);
check('position négative ramenée à zéro', TARGET.console.x === 0 && TARGET.console.y === 0);
check('taille minimale respectée', TARGET.console.w >= 320 && TARGET.console.h >= 180);
eq('panneau du profil appliqué', { x: TARGET.direction.x, y: TARGET.direction.y, w: TARGET.direction.w, h: TARGET.direction.h }, {
  x: 100,
  y: 120,
  w: 320,
  h: 220,
});
check('fenêtre fermée du profil refermée', TARGET.direction.open === false);
eq(
  'fenêtre absente du profil : disposition courante conservée',
  { x: TARGET.actions.x, y: TARGET.actions.y, w: TARGET.actions.w, h: TARGET.actions.h },
  { x: CURRENT.actions.x, y: CURRENT.actions.y, w: CURRENT.actions.w, h: CURRENT.actions.h }
);
const skipped = applyProfileLayout(CURRENT, { direction: { x: 0, y: 0, w: 300, h: 200, open: false } }, { width: 1200, height: 800 }, ['direction']);
eq('fenêtre ignorée (skip)', skipped.direction, CURRENT.direction);

console.log('\n== Stockage sur le poste ==');
const storage = memoryStorage();
check('écriture réussie', storePanelProfiles(first.profiles, storage) === true);
check('clé de stockage', storage.dump().has(PANEL_PROFILES_KEY));
const loaded = loadPanelProfiles(storage);
eq('relecture du profil', loaded.length, 1);
eq('nom relu', loaded[0].name, 'Saisie club');
eq('disposition relue', loaded[0].layout, first.profile.layout);
check('profil invalide écarté', sanitizePanelProfile({ id: 'x', name: '' }) === null);
check('stockage indisponible : aucun profil, pas de plantage', loadPanelProfiles(null).length === 0);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
