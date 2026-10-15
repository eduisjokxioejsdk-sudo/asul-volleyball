// Vérifie la logique pure des fenêtres (disposition, bornage, ancres) et des
// raccourcis clavier personnalisables.
// Exécution : node client/scripts/windowing.spec.mjs
import {
  ANCHOR_PANELS,
  PANEL_IDS,
  PANEL_MIN,
  applyPanelPatch,
  arePanelsOpen,
  canvasMinHeight,
  canvasMinWidth,
  clampRect,
  defaultPanelLayout,
  fitPanelLayout,
  isClosable,
  openPanel,
  setPanelsOpen,
  togglePanel,
} from '../src/utils/panelLayout.js';
import {
  PLAYBACK_SPEEDS,
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  defaultShortcuts,
  findDuplicateKeys,
  formatKeyLabel,
  isActionForPage,
  keyFromEvent,
  matchesShortcut,
  normalizeKey,
  stepSpeed,
} from '../src/utils/shortcuts.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Disposition par défaut ==');
const wide = defaultPanelLayout(1400, 900);
check('toutes les fenêtres sont décrites', PANEL_IDS.every((id) => wide[id]), JSON.stringify(Object.keys(wide)));
check('vidéo ouverte par défaut', wide.video.open === true);
check('zone de code ouverte par défaut', wide.console.open === true);
check('aide-mémoire fermé par défaut (Mode Aide)', wide.aide.open === false);
check('clavier virtuel fermé par défaut', wide.keypad.open === false);
check('vidéo à gauche, terrain à droite', wide.video.x < wide.court.x, `${wide.video.x} / ${wide.court.x}`);
check('aucune fenêtre ne dépasse à droite', PANEL_IDS.every((id) => wide[id].x + wide[id].w <= 1400));
check('vidéo et zone de code ne se chevauchent pas', wide.video.y + wide.video.h <= wide.console.y);

const narrow = defaultPanelLayout(700, 900);
check('écran étroit : une seule colonne', narrow.court.x === 0 && narrow.video.x === 0);
check('écran étroit : empilement sans chevauchement', narrow.video.y + narrow.video.h <= narrow.console.y);
check('écran étroit : hauteur de canevas suffisante', canvasMinHeight(narrow) > 900);

console.log('\n== Bornage et redimensionnement ==');
const clamped = clampRect({ x: -80, y: -20, w: 9999, h: 9999 }, { width: 1000, height: 700 }, PANEL_MIN.court);
check('x ramené dans le canevas', clamped.x === 0);
check('y ramené dans le canevas', clamped.y === 0);
check('taille plafonnée (2× le canevas)', clamped.w === 2000 && clamped.h === 1400, `${clamped.w}x${clamped.h}`);
check('taille raisonnable conservée', clampRect({ x: 0, y: 0, w: 900, h: 600 }, { width: 1000, height: 700 }, PANEL_MIN.court).w === 900);
const tooSmall = clampRect({ x: 10, y: 10, w: 10, h: 10 }, { width: 1000, height: 700 }, PANEL_MIN.court);
check('largeur minimale respectée', tooSmall.w === PANEL_MIN.court.minW, `${tooSmall.w}`);
check('hauteur minimale respectée', tooSmall.h === PANEL_MIN.court.minH, `${tooSmall.h}`);

const moved = applyPanelPatch(wide, 'court', { x: 5, y: 480, w: 400, h: 300 }, { width: 1400, height: 900 });
check('déplacement appliqué', moved.court.x === 5 && moved.court.y === 480);

console.log('\n== Robustesse : ne jamais tasser une fenêtre (bug « bloquée en haut à gauche ») ==');
const ref = { x: 260, y: 140, w: 640, h: 420 };
const noSize = clampRect(ref, undefined, PANEL_MIN.court);
check('taille inconnue : position conservée', noSize.x === 260 && noSize.y === 140, JSON.stringify(noSize));
check('taille inconnue : taille conservée', noSize.w === 640 && noSize.h === 420, JSON.stringify(noSize));
const zeroSize = clampRect(ref, { width: 0, height: 0 }, PANEL_MIN.court);
check('taille 0x0 : position conservée', zeroSize.x === 260 && zeroSize.y === 140, JSON.stringify(zeroSize));
check('taille 0x0 : taille conservée', zeroSize.w === 640 && zeroSize.h === 420, JSON.stringify(zeroSize));
const tinySize = clampRect(ref, { width: 320, height: 240 }, PANEL_MIN.court);
check('canevas plus petit que la fenêtre : fenêtre intacte', tinySize.w === 640 && tinySize.h === 420 && tinySize.x === 260, JSON.stringify(tinySize));
const patchNoSize = applyPanelPatch(wide, 'video', { x: 210, y: 90 }, undefined).video;
check('patch sans taille : la fenêtre ne part pas en (0,0)', patchNoSize.x === 210 && patchNoSize.y === 90, JSON.stringify(patchNoSize));
check('patch sans taille : la vidéo garde sa largeur', patchNoSize.w === wide.video.w, `${patchNoSize.w}`);
const canvas = { width: 1400, height: 1152 };
const step1 = applyPanelPatch(wide, 'video', { x: 60, y: 40 }, canvas).video;
const step2 = applyPanelPatch(applyPanelPatch(wide, 'video', { x: 60, y: 40 }, canvas), 'video', { x: 180, y: 120 }, canvas).video;
check('glissement : premier pas', step1.x === 60 && step1.y === 40, JSON.stringify(step1));
check('glissement : pas suivant', step2.x === 180 && step2.y === 120, JSON.stringify(step2));
check('glissement : taille inchangée', step2.w === wide.video.w && step2.h === wide.video.h);
check('glissement vers le haut/gauche : borné à 0', clampRect({ x: -400, y: -300, w: 500, h: 300 }, canvas, PANEL_MIN.court).x === 0);
const grown = applyPanelPatch(wide, 'video', { x: 1200, y: 0 }, canvas);
check('déplacement à droite conservé', grown.video.x === 1200, `${grown.video.x}`);
check('le canevas s élargit pour contenir la fenêtre', canvasMinWidth(grown) >= 1200 + grown.video.w);
check('redimensionnement : largeur minimale appliquée', clampRect({ x: 0, y: 0, w: 5, h: 5 }, canvas, PANEL_MIN.court).w === PANEL_MIN.court.minW);
check('redimensionnement : agrandissement conservé', clampRect({ x: 0, y: 0, w: 900, h: 700 }, canvas, PANEL_MIN.court).w === 900);

console.log('\n== Ancres, fermeture, réouverture ==');
check('vidéo non fermable', isClosable('video') === false);
check('zone de code non fermable', isClosable('console') === false);
check('terrain fermable', isClosable('court') === true);
check('ancres déclarées', ANCHOR_PANELS.includes('video') && ANCHOR_PANELS.includes('console'));
check('fermeture de la vidéo refusée', togglePanel(wide, 'video').video.open === true);
const closed = togglePanel(wide, 'court');
check('fermeture du terrain', closed.court.open === false);
check('réouverture du terrain', openPanel(closed, 'court').court.open === true);
check('fermer tout masque le terrain', setPanelsOpen(wide, ['court', 'score'], false).court.open === false);
check('fermer tout ne ferme pas la vidéo', setPanelsOpen(wide, ['video', 'console', 'court'], false).video.open === true);
check('arePanelsOpen vrai si toutes ouvertes', arePanelsOpen(wide, ['video', 'console', 'court']) === true);
check('arePanelsOpen faux si une est fermée', arePanelsOpen(closed, ['video', 'court']) === false);
check('fit conserve les fenêtres', Object.keys(fitPanelLayout(wide, { width: 1000, height: 700 })).length === PANEL_IDS.length);
const shrunk = fitPanelLayout(wide, { width: 900, height: 600 });
check('fit : les tailles sont conservées (jamais tassées)', PANEL_IDS.every((id) => shrunk[id].w === wide[id].w && shrunk[id].h === wide[id].h));
check('fit : aucune position négative', PANEL_IDS.every((id) => shrunk[id].x >= 0 && shrunk[id].y >= 0));
const fittedOnce = fitPanelLayout(wide, { width: 1400, height: 1400 });
check('fit : idempotent (pas de boucle de mesure)', fitPanelLayout(fittedOnce, { width: 1400, height: 1400 }) === fittedOnce);
check('fit : conserve toutes les fenêtres', Object.keys(fittedOnce).length === PANEL_IDS.length);
check('fit : identité quand rien ne change', fitPanelLayout(wide, undefined) === wide);
check('sans vidéo (live) : la zone de code occupe le haut', defaultPanelLayout(1400, 900, ['video']).console.y === 0);
check('sans vidéo (live) : aucune fenêtre vidéo créée', defaultPanelLayout(1400, 900, ['video']).video === undefined);

console.log('\n== Raccourcis : valeurs par défaut et libellés ==');
const defaults = defaultShortcuts();
check('une touche par action', SHORTCUT_ACTIONS.every((a) => !!defaults[a.id]));
check('J / K / L par défaut', defaults.seekBack === 'j' && defaults.pause === 'k' && defaults.seekForward === 'l');
check('valider = Entrée', defaults.validate === 'Enter');
check('vider = Échap', defaults.clearBuffer === 'Escape');
check('libellé Entrée', formatKeyLabel('Enter') === 'Entrée', formatKeyLabel('Enter'));
check('libellé Échap', formatKeyLabel('Escape') === 'Échap');
check('libellé Espace', formatKeyLabel('Space') === 'Espace');
check('libellé lettre en majuscule', formatKeyLabel('j') === 'J');
check('libellé flèche', formatKeyLabel('ArrowLeft') === '←');

console.log('\n== Raccourcis : normalisation et correspondance ==');
check('espace normalisé', normalizeKey(' ') === 'Space');
check('lettre en minuscule', normalizeKey('J') === 'j');
check('touche spéciale conservée', normalizeKey('Enter') === 'Enter');
check('évènement espace', keyFromEvent({ key: ' ' }) === 'Space');
check('évènement lettre', keyFromEvent({ key: 'K' }) === 'k');
check('évènement Entrée', keyFromEvent({ key: 'Enter' }) === 'Enter');
check('correspondance lettre', matchesShortcut({ key: 'J' }, 'j') === true);
check('non-correspondance', matchesShortcut({ key: 'x' }, 'j') === false);
check('correspondance touche spéciale', matchesShortcut({ key: 'Escape' }, 'Escape') === true);
check('correspondance espace', matchesShortcut({ key: ' ' }, 'Space') === true);

console.log('\n== Raccourcis : conflits et vitesses ==');
check('aucun conflit par défaut', findDuplicateKeys(defaults).length === 0, JSON.stringify(findDuplicateKeys(defaults)));
const conflict = { ...defaults, seekForward: 'j' };
check('conflit détecté', findDuplicateKeys(conflict).length === 1);
check('conflit liste les deux actions', findDuplicateKeys(conflict)[0].ids.sort().join(',') === 'seekBack,seekForward');

console.log('\n== Raccourcis : page Trajectoires (bascule Services ↔ Attaque) ==');
const toggle = SHORTCUT_ACTIONS.find((a) => a.id === 'toggleKind');
check('action de bascule présente', !!toggle);
check('touche par défaut t', toggle?.key === 't', `${toggle?.key}`);
check('groupe « Trajectoires » déclaré', toggle?.group === 'Trajectoires' && SHORTCUT_GROUPS.includes('Trajectoires'));
check('réservée à la page trajectoires', isActionForPage(toggle, 'trajectory') === true);
check('absente des écrans de codage', isActionForPage(toggle, 'coding') === false);
check('les raccourcis de codage ne concernent pas la page trajectoires', isActionForPage(SHORTCUT_ACTIONS.find((a) => a.id === 'pause'), 'trajectory') === false);
check('une seule action à régler sur la page trajectoires', SHORTCUT_ACTIONS.filter((a) => isActionForPage(a, 'trajectory')).length === 1);
const trajectoryActions = SHORTCUT_ACTIONS.filter((a) => isActionForPage(a, 'trajectory'));
// Les deux écrans ne partagent jamais une touche : un « k » sur la page
// trajectoires ne doit donc pas être signalé comme conflit.
const crossPage = { ...defaults, toggleKind: 'k' };
check('aucun conflit entre pages', findDuplicateKeys(crossPage, trajectoryActions).length === 0, JSON.stringify(findDuplicateKeys(crossPage, trajectoryActions)));
check('conflit détecté si on compare toutes les pages', findDuplicateKeys(crossPage).length === 1);
check('vitesse accélérée', stepSpeed(1, 1) === 1.25, `${stepSpeed(1, 1)}`);
check('vitesse ralentie', stepSpeed(1, -1) === 0.75, `${stepSpeed(1, -1)}`);
check('vitesse plafonnée au maximum', stepSpeed(2, 1) === PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1]);
check('vitesse plancher au minimum', stepSpeed(0.25, -1) === PLAYBACK_SPEEDS[0]);
check('vitesse hors liste recalée', PLAYBACK_SPEEDS.includes(stepSpeed(1.1, 1)), `${stepSpeed(1.1, 1)}`);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
