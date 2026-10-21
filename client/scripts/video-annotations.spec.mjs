// Vérifie la logique des annotations vidéo : coordonnées normalisées, letterbox,
// création, mise à jour du tracé, pile d'annulation et sérialisation.
// Exécution : node client/scripts/video-annotations.spec.mjs
import {
  DRAW_COLORS,
  DRAW_TOOLS,
  DRAW_WIDTHS,
  clearAnnotations,
  clamp01,
  createAnnotation,
  deserializeAnnotations,
  letterboxRect,
  pushAnnotation,
  serializeAnnotations,
  toNormalized,
  toPixels,
  undoAnnotation,
  updateDraft,
} from '../src/utils/videoAnnotations.js';

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

// --- Outils ----------------------------------------------------------------

check('les outils de dessin sont listés', DRAW_TOOLS.includes('arrow') && DRAW_TOOLS.includes('text'));
check('des couleurs sont proposées', DRAW_COLORS.length >= 4);
check('des épaisseurs sont proposées', DRAW_WIDTHS.length >= 2);

// --- Letterbox -------------------------------------------------------------

const rect = letterboxRect(1000, 600, 1920, 1080);
eq('le letterbox calcule la largeur utile', rect.width, 1000);
eq('le letterbox calcule la hauteur utile', rect.height, 562.5);
eq('le letterbox centre horizontalement', rect.x, 0);
eq('le letterbox centre verticalement', rect.y, 18.75);

const rectTall = letterboxRect(600, 1000, 1080, 1920);
eq('le letterbox gere le portrait', rectTall.height, 1000);
eq('le letterbox centre en largeur', rectTall.x, 18.75);

const rectEmpty = letterboxRect(0, 0, 0, 0);
eq('sans dimensions on renvoie un rectangle vide', rectEmpty, { x: 0, y: 0, width: 0, height: 0 });

// --- Normalisation ---------------------------------------------------------

const n = toNormalized(500, 300, rect);
eq('le centre de l\'image se normalise en (0.5, 0.5)', n, { x: 0.5, y: 0.5 });
const nEdge = toNormalized(0, 0, rect);
check('le bord haut-gauche se normalise en (0, 0)', nEdge.x >= 0 && nEdge.y <= 0.001);
check('les valeurs sont bornées dans [0,1]', clamp01(-5) === 0 && clamp01(5) === 1);
eq('une valeur non numérique vaut 0', clamp01('abc'), 0);

const back = toPixels(0.5, 0.5, rect);
eq('le retour en pixels est cohérent', back, { x: 500, y: 300 });

// --- Création --------------------------------------------------------------

const ann = createAnnotation('arrow', { x: 0.1, y: 0.2, x2: 0.3, y2: 0.4 }, { color: '#ffffff', width: 4 });
eq('l\'outil est conservé', ann.tool, 'arrow');
eq('la couleur est conservée', ann.color, '#ffffff');
eq('l\'épaisseur est conservée', ann.width, 4);
check('un identifiant est généré', typeof ann.id === 'string' && ann.id.length > 0);

const annDefault = createAnnotation('rect', {});
eq('la couleur par défaut est appliquée', annDefault.color, DRAW_COLORS[0]);
eq('l\'épaisseur par défaut est appliquée', annDefault.width, DRAW_WIDTHS[1]);

// --- Mise à jour du tracé --------------------------------------------------

const d1 = updateDraft(ann, { x: 0.5, y: 0.6 });
eq('la mise à jour déplace le second point', d1.x2, 0.5);
eq('le premier point ne bouge pas', d1.x, 0.1);

const free = createAnnotation('freehand', { points: [{ x: 0, y: 0 }] });
const free2 = updateDraft(free, { x: 0.1, y: 0.2 });
eq('la main levée ajoute un point', free2.points.length, 2);
eq('la main levée ne touche pas x2', free2.x2, undefined);

// --- Pile d'annulation -----------------------------------------------------

let anns = [];
let hist = [];
const r1 = pushAnnotation(anns, hist, ann);
anns = r1.annotations;
hist = r1.history;
eq('l\'annotation est ajoutée', anns.length, 1);
eq('l\'historique est alimenté', hist.length, 1);

const r2 = pushAnnotation(anns, hist, ann2());
anns = r2.annotations;
hist = r2.history;
eq('la deuxième annotation est ajoutée', anns.length, 2);

const u1 = undoAnnotation(anns, hist);
eq('l\'annulation retire la dernière annotation', u1.annotations.length, 1);
eq('l\'annulation retire l\'entrée d\'historique', u1.history.length, 1);

const u2 = undoAnnotation(u1.annotations, u1.history);
eq('une seconde annulation vide la liste', u2.annotations.length, 0);

const u3 = undoAnnotation([], []);
eq('annuler sans historique ne fait rien', u3.annotations.length, 0);

function ann2() {
  return createAnnotation('rect', { x: 0, y: 0, x2: 1, y2: 1 });
}

// --- Effacement ------------------------------------------------------------

const twoAnns = [ann, ann2()];
const c1 = clearAnnotations(twoAnns, []);
eq('l\'effacement vide la liste', c1.annotations.length, 0);
eq('l\'effacement est tracé dans l\'historique', c1.history.length, 1);
eq('l\'effacement retient la liste précédente', c1.history[0].previous.length, 2);

const cu = undoAnnotation(c1.annotations, c1.history);
eq('annuler l\'effacement restaure les annotations', cu.annotations.length, 2);

const cEmpty = clearAnnotations([], []);
eq('effacer une liste vide ne change rien', cEmpty.annotations.length, 0);

// --- Sérialisation ---------------------------------------------------------

const payload = serializeAnnotations(anns);
eq('la sérialisation porte une version', payload.version, 1);
eq('la sérialisation contient les annotations', payload.annotations.length, 2);

const backData = deserializeAnnotations(payload);
eq('la désérialisation restitue les annotations', backData.length, 2);
eq('la désérialisation restitue l\'outil', backData[0].tool, 'arrow');

const dirty = deserializeAnnotations({ annotations: [{ tool: 'inconnu' }, null, { tool: 'rect' }] });
eq('les entrées invalides sont ignorées', dirty.length, 1);
eq('une donnée vide ne casse rien', deserializeAnnotations(null).length, 0);

console.log(failures === 0 ? '\nOK — annotations vidéo' : `\n${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
