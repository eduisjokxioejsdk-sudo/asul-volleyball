// Vérifie le moteur des fiches de trajectoire : catalogue des issues, couleur
// selon le résultat, flèches droites / en arc, décision « dedans / dehors » et
// conversions base ↔ écran.
// Exécution : node client/scripts/trajectory.spec.mjs
import {
  ARC_BULGE,
  COURT_MID_Y,
  POPUP_RESULTS,
  SELECTION_COLOR,
  SERVE_RESULTS,
  TRAJECTORY_COURT,
  TRAJECTORY_KINDS,
  TRAJECTORY_MARGIN,
  TRAJECTORY_RESULTS,
  TRAJECTORY_VIEWBOX,
  arcPath,
  countByResult,
  emptyCounts,
  filterShots,
  isResultForKind,
  landingResult,
  normalizeRect,
  normalizeResultForKind,
  popupResultsFor,
  resultColor,
  resultIsArc,
  resultLabel,
  resultsForKind,
  rosterOf,
  selectedShotIndexes,
  shotFromRow,
  shotHitsRect,
  shotPath,
  shotToRow,
  shotsFor,
  straightPath,
  svgPointFromEvent,
} from '../src/utils/trajectory.js';
import { insideCourt } from '../src/utils/courtGeometry.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Catalogue des issues ==');
check('7 issues possibles', TRAJECTORY_RESULTS.length === 7, `${TRAJECTORY_RESULTS.length}`);
check(
  'les 6 choix de la popup sont ceux demandés',
  POPUP_RESULTS.join(',') === 'point,feinte_point,feinte_continuite,continuite,faute,contree',
  POPUP_RESULTS.join(',')
);
check('« dehors » n’est pas proposé dans la popup', !POPUP_RESULTS.includes('out'));
check('dehors est une issue automatique', TRAJECTORY_RESULTS.find((r) => r.id === 'out')?.auto === true);

console.log('\n== Feintes réservées à l’attaque ==');
check(
  'attaque : les 6 choix demandés (dont la balle contrée)',
  popupResultsFor('attack').join(',') === 'point,feinte_point,feinte_continuite,continuite,faute,contree',
  popupResultsFor('attack').join(',')
);
check('service : 3 choix, sans feinte', popupResultsFor('serve').join(',') === 'point,continuite,faute', popupResultsFor('serve').join(','));
check('aucune feinte proposée au service', !popupResultsFor('serve').some((r) => r.startsWith('feinte')));
check('service : liste officielle', SERVE_RESULTS.join(',') === 'point,continuite,faute');
check(
  'les deux feintes restent proposées à l’attaque',
  popupResultsFor('attack').includes('feinte_point') && popupResultsFor('attack').includes('feinte_continuite')
);
check('feinte point au service → point', normalizeResultForKind('feinte_point', 'serve') === 'point');
check('feinte continuité au service → continuité', normalizeResultForKind('feinte_continuite', 'serve') === 'continuite');
check('point au service inchangé', normalizeResultForKind('point', 'serve') === 'point');
check('dehors au service inchangé', normalizeResultForKind('out', 'serve') === 'out');
check('feinte conservée à l’attaque', normalizeResultForKind('feinte_point', 'attack') === 'feinte_point');
check('continuité conservée à l’attaque', normalizeResultForKind('continuite', 'attack') === 'continuite');
check('contrée conservée à l’attaque', normalizeResultForKind('contree', 'attack') === 'contree');
check('contrée au service → continuité', normalizeResultForKind('contree', 'serve') === 'continuite');

console.log('\n== Code couleur ==');
check('point = vert', resultColor('point') === '#34a853', resultColor('point'));
check('continuité = bleu', resultColor('continuite') === '#4285f4', resultColor('continuite'));
check('faute = rouge', resultColor('faute') === '#ea4335', resultColor('faute'));
check('dehors = rouge', resultColor('out') === '#ea4335', resultColor('out'));
check('contrée = orange', resultColor('contree') === '#ff8f00', resultColor('contree'));
check(
  'orange réservé à la balle contrée',
  TRAJECTORY_RESULTS.filter((r) => r.color === resultColor('contree')).length === 1
);
for (const id of POPUP_RESULTS) {
  check(`libellé défini pour ${id}`, resultLabel(id) !== 'Issue inconnue');
}

console.log('\n== Feintes en arc de cercle, autres en trait droit ==');
check('feinte point = arc', resultIsArc('feinte_point') === true);
check('feinte continuité = arc', resultIsArc('feinte_continuite') === true);
for (const id of ['point', 'continuite', 'faute', 'contree', 'out']) {
  check(`${id} = trait droit`, resultIsArc(id) === false);
}
check('la feinte point garde le vert', resultColor('feinte_point') === resultColor('point'));
check('la feinte continuité garde le bleu', resultColor('feinte_continuite') === resultColor('continuite'));

console.log('\n== Arrivée dans le terrain ou dehors ==');
const inside = { x: TRAJECTORY_COURT.x + 20, y: TRAJECTORY_COURT.top + 20 };
check('arrivée dans le terrain : popup demandée', landingResult(inside) === null, JSON.stringify(landingResult(inside)));
check('sur la ligne de côté : dans le terrain', insideCourt({ x: TRAJECTORY_COURT.x, y: 50 }) === true);
check('juste derrière la ligne de fond : dehors', landingResult({ x: TRAJECTORY_COURT.x - 0.5, y: 50 }) === 'out');
check('lancée trop loin : dehors', landingResult({ x: TRAJECTORY_COURT.x + TRAJECTORY_COURT.w + 4, y: 50 }) === 'out');
check('sortie de côté : dehors', landingResult({ x: 95, y: TRAJECTORY_COURT.top - 2 }) === 'out');
check('sortie par le bas : dehors', landingResult({ x: 95, y: TRAJECTORY_COURT.bottom + 2 }) === 'out');

console.log('\n== Tracés ==');
const from = { x: 95, y: 80 };
const to = { x: 140, y: 30 };
const line = straightPath(from, to);
const arc = arcPath(from, to);
check('trait droit : commande L', line.d.includes('L') && !line.d.includes('Q'), line.d);
check('trait droit : pas de point de contrôle', line.control === null);
check('arc : commande Q', arc.d.includes('Q'), arc.d);
check('arc : arc = true', arc.arc === true);
check('arc : extrémités conservées', arc.d.startsWith(`M ${from.x} ${from.y}`) && arc.d.endsWith(`${to.x} ${to.y}`), arc.d);
const midX = (from.x + to.x) / 2;
const midY = (from.y + to.y) / 2;
const offset = Math.hypot(arc.control.x - midX, arc.control.y - midY);
check('arc : bombe de 32 unités (contre 18 avant)', ARC_BULGE === 32, `${ARC_BULGE}`);
check('arc : point de contrôle éloigné du trait', Math.abs(offset - ARC_BULGE) < 0.2, `${offset}`);
check('arc : écart maximum d’au moins 1,5 m avec la corde', ARC_BULGE / 2 >= 15, `${ARC_BULGE / 2}`);
check('arc : bien plus marqué qu’une flèche droite', offset > 20, `${offset}`);
check('shotPath : feinte → arc', shotPath(from, to, 'feinte_point').arc === true);
check('shotPath : point → droit', shotPath(from, to, 'point').arc === false);
check('shotPath : dehors → droit', shotPath(from, to, 'out').arc === false);

console.log('\n== Sens du bombé des feintes (départ + arrivée dans la moitié haute) ==');
const arcBas = arcPath({ x: 20, y: 80 }, { x: 60, y: 80 });
check('feinte qui démarre et finit en bas : bombé vers le bas', arcBas.control.y > 80, `${arcBas.control.y}`);
const arcHaut = arcPath({ x: 20, y: 20 }, { x: 60, y: 20 });
check('feinte qui démarre et finit en haut : bombé vers le haut', arcHaut.control.y < 20, `${arcHaut.control.y}`);
check('la feinte haute monte puis redescend sur son arrivée', arcHaut.control.y < 20 && arcHaut.d.endsWith('60 20'), arcHaut.d);
const arcHautInverse = arcPath({ x: 60, y: 20 }, { x: 20, y: 20 });
check('feinte haute tracée vers la gauche : bombé vers le haut', arcHautInverse.control.y < 20, `${arcHautInverse.control.y}`);
const arcBasInverse = arcPath({ x: 60, y: 80 }, { x: 20, y: 80 });
check('feinte basse tracée vers la gauche : bombé vers le bas', arcBasInverse.control.y > 80, `${arcBasInverse.control.y}`);
const arcVersLeBas = arcPath({ x: 20, y: 80 }, { x: 60, y: 20 });
check('départ en bas et arrivée en haut : bombé vers le bas', arcVersLeBas.control.y > 50, `${arcVersLeBas.control.y}`);
const arcTraversant = arcPath({ x: 20, y: 20 }, { x: 60, y: 80 });
check('départ en haut et arrivée en bas : bombé vers le bas', arcTraversant.control.y > 50, `${arcTraversant.control.y}`);
check('les deux moitiés repartent de part et d’autre du trait', arcBas.control.y - 80 > 0 && arcHaut.control.y - 20 < 0);
check('ligne médiane à mi-largeur du terrain', COURT_MID_Y === TRAJECTORY_COURT.top + TRAJECTORY_COURT.h / 2, `${COURT_MID_Y}`);
check('extrémités conservées dans les deux sens', arcHaut.d.startsWith('M 20 20') && arcHaut.d.endsWith('60 20'), arcHaut.d);

console.log('\n== Repère de dessin ==');
check('marge autour du terrain', TRAJECTORY_MARGIN === 22, `${TRAJECTORY_MARGIN}`);
check(
  'le viewBox contient le terrain + la marge des deux côtés',
  TRAJECTORY_VIEWBOX.x === TRAJECTORY_COURT.x - TRAJECTORY_MARGIN &&
    TRAJECTORY_VIEWBOX.w === TRAJECTORY_COURT.w + TRAJECTORY_MARGIN * 2 &&
    TRAJECTORY_VIEWBOX.h === TRAJECTORY_COURT.h + TRAJECTORY_MARGIN * 2,
  JSON.stringify(TRAJECTORY_VIEWBOX)
);
const fakeEl = {
  getBoundingClientRect: () => ({
    left: 0,
    top: 0,
    width: TRAJECTORY_VIEWBOX.w * 2,
    height: TRAJECTORY_VIEWBOX.h * 2,
  }),
};
const centre = svgPointFromEvent(fakeEl, { clientX: TRAJECTORY_VIEWBOX.w, clientY: TRAJECTORY_VIEWBOX.h });
check('clic au centre de l’écran = centre du filet', centre.x === 95 && centre.y === 50, JSON.stringify(centre));
const coin = svgPointFromEvent(fakeEl, {
  clientX: TRAJECTORY_VIEWBOX.w * 2,
  clientY: TRAJECTORY_VIEWBOX.h * 2,
});
check(
  'clic en bas à droite = coin bas droit du repère',
  coin.x === TRAJECTORY_COURT.x + TRAJECTORY_COURT.w + TRAJECTORY_MARGIN,
  JSON.stringify(coin)
);
check('clic dans la zone libre = dehors', landingResult(coin) === 'out');
check('sans élément mesurable : pas de point', svgPointFromEvent(null, { clientX: 0, clientY: 0 }) === null);

console.log('\n== Comptage et effectif ==');
const shots = [
  { team_side: 'home', kind: 'serve', player_number: 4, result: 'point' },
  { team_side: 'home', kind: 'serve', player_number: 4, result: 'out' },
  { team_side: 'home', kind: 'serve', player_number: 4, result: 'feinte_point' },
  { team_side: 'home', kind: 'attack', player_number: 4, result: 'continuite' },
  { team_side: 'away', kind: 'serve', player_number: 7, result: 'faute' },
];
const counts = countByResult(shots);
check('point compté', counts.point === 1, `${counts.point}`);
check('feinte point comptée', counts.feinte_point === 1, `${counts.feinte_point}`);
check('dehors compté', counts.out === 1, `${counts.out}`);
check('compteur total = nombre de flèches', Object.values(counts).reduce((a, b) => a + b, 0) === shots.length);
check('compteurs à zéro par défaut', Object.values(emptyCounts()).every((v) => v === 0));
check('flèches d’un joueur filtrées par équipe + frappe', shotsFor(shots, 'home', 'serve', 4).length === 3, `${shotsFor(shots, 'home', 'serve', 4).length}`);
check('numéro comparé en chaîne comme en nombre', shotsFor(shots, 'home', 'attack', '4').length === 1);

const roster = rosterOf({
  players: [
    { number: 12, name: 'B', role: 'middle' },
    { number: 0, name: 'X' },
    { number: 3, name: 'A', role: 'setter' },
  ],
});
check('effectif trié par numéro', roster.map((p) => p.number).join(',') === '3,12', roster.map((p) => p.number).join(','));
check('joueurs sans numéro écartés', roster.length === 2);
check('rôle par défaut', roster.every((p) => !!p.role));

console.log('\n== Base ↔ écran ==');
const shot = {
  team_side: 'home',
  player_number: 4,
  kind: 'serve',
  start: { x: 1.24, y: 76.55 },
  end: { x: 150.04, y: 12.36 },
  result: 'feinte_continuite',
  set_number: null,
};
const row = shotToRow(shot);
check('envoyé en colonnes start_x / end_y', row.start.x === 1.2 && row.end.y === 12.4, JSON.stringify(row));
const back = shotFromRow({
  id: 9,
  team_side: row.team_side,
  player_number: row.player_number,
  kind: row.kind,
  start_x: row.start.x,
  start_y: row.start.y,
  end_x: row.end.x,
  end_y: row.end.y,
  result: row.result,
});
check('aller-retour conservé', back.start.x === 1.2 && back.end.x === 150 && back.result === 'feinte_continuite', JSON.stringify(back));
check('identifiant conservé', back.id === 9);
check('types de frappe : services puis attaque', TRAJECTORY_KINDS.map((k) => k.id).join(',') === 'serve,attack');

console.log('\n== Consultation : filtre des issues ==');
const fabrique = (result) => ({ team_side: 'home', kind: 'attack', player_number: 4, result });
const liste = [fabrique('point'), fabrique('contree'), fabrique('faute'), fabrique('out')];
check('sans filtre : tout est affiché', filterShots(liste, []).length === 4);
check('filtre vide (Set) : tout est affiché', filterShots(liste, new Set()).length === 4);
check('issue masquée retirée', filterShots(liste, ['contree']).map((s) => s.result).join(',') === 'point,faute,out');
check('plusieurs issues masquées', filterShots(liste, ['contree', 'out']).map((s) => s.result).join(',') === 'point,faute');
check('tout masqué : plus aucune flèche', filterShots(liste, resultsForKind('attack').map((r) => r.id)).length === 0);
check('ordre conservé', filterShots(liste, ['faute'])[0].result === 'point');
check('liste absente acceptée', filterShots(null, ['point']).length === 0);
check(
  'issues d’attaque : contrée comprise',
  resultsForKind('attack').map((r) => r.id).join(',') === 'point,feinte_point,feinte_continuite,continuite,faute,contree,out',
  resultsForKind('attack').map((r) => r.id).join(',')
);
check(
  'issues de service : ni feinte ni contrée',
  resultsForKind('serve').map((r) => r.id).join(',') === 'point,continuite,faute,out',
  resultsForKind('serve').map((r) => r.id).join(',')
);
check('contrée : proposée à l’attaque', isResultForKind('contree', 'attack') === true);
check('contrée : jamais au service', isResultForKind('contree', 'serve') === false);
check('feinte : seulement à l’attaque', isResultForKind('feinte_point', 'attack') === true && isResultForKind('feinte_point', 'serve') === false);
check('dehors : dans les deux onglets', isResultForKind('out', 'serve') && isResultForKind('out', 'attack'));

console.log('\n== Sélection d’une zone (consultation) ==');
check('violet « flashy » de la sélection', SELECTION_COLOR === '#c026ff', SELECTION_COLOR);
const zone = normalizeRect({ x: 40, y: 30 }, { x: 10, y: 60 });
check('rectangle normalisé', zone.x === 10 && zone.y === 30 && zone.w === 30 && zone.h === 30, JSON.stringify(zone));
check(
  'rectangle insensible au sens du glissement',
  JSON.stringify(normalizeRect({ x: 10, y: 60 }, { x: 40, y: 30 })) === JSON.stringify(zone)
);

const flecheDroite = { start: { x: 0, y: 40 }, end: { x: 100, y: 40 }, result: 'point' };
check('flèche qui traverse la zone : désignée', shotHitsRect(flecheDroite, zone) === true);
check(
  'flèche entièrement dans la zone : désignée',
  shotHitsRect({ start: { x: 15, y: 35 }, end: { x: 25, y: 45 }, result: 'point' }, zone) === true
);
check('flèche hors de la zone : ignorée', shotHitsRect(flecheDroite, { x: 0, y: 0, w: 20, h: 20 }) === false);
check('flèche sans coordonnées : ignorée', shotHitsRect({ result: 'point' }, zone) === false);

// Une feinte est un arc : c’est l’arc qui compte, pas la corde.
const feinte = { start: { x: 10, y: 20 }, end: { x: 90, y: 20 }, result: 'feinte_point' };
const arcFeinte = arcPath(feinte.start, feinte.end);
const sommet = {
  x: (feinte.start.x + 2 * arcFeinte.control.x + feinte.end.x) / 4,
  y: (feinte.start.y + 2 * arcFeinte.control.y + feinte.end.y) / 4,
};
const zoneSommet = { x: sommet.x - 2, y: sommet.y - 2, w: 4, h: 4 };
check('arc de feinte détecté au sommet', shotHitsRect(feinte, zoneSommet) === true);
check(
  'même tracé en flèche droite : hors de la zone du sommet',
  shotHitsRect({ ...feinte, result: 'point' }, zoneSommet) === false
);

check('simple clic (zone vide) : aucune flèche', selectedShotIndexes([flecheDroite], { x: 50, y: 50, w: 0, h: 0 }).length === 0);
check(
  'index des flèches désignées',
  selectedShotIndexes([flecheDroite, { start: { x: 0, y: 0 }, end: { x: 5, y: 5 }, result: 'point' }], zone).join(',') === '0'
);
check('plusieurs flèches désignées', selectedShotIndexes([flecheDroite, feinte], { x: 0, y: 0, w: 200, h: 120 }).join(',') === '0,1');
check('aucune flèche : liste vide', selectedShotIndexes([], zone).length === 0);
check('liste absente acceptée', selectedShotIndexes(null, zone).length === 0);
check('zone absente acceptée', selectedShotIndexes([flecheDroite], null).length === 0);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
