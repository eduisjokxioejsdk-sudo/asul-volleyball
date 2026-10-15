// Vérifie la géométrie du terrain de volley (proportions, postes, symétrie).
// Exécution : node client/scripts/court.spec.mjs
import {
  ATTACK,
  FREE,
  H,
  LEFT_X,
  M,
  NET_X,
  RIGHT_X,
  SPOTS,
  W,
  ZONE_CELLS,
  COURT_SPOTS,
  xyFrom,
  insideCourt,
  spotXY,
  distanceToNet,
} from '../src/utils/courtGeometry.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

console.log('\n== Dimensions ==');
check('largeur = 9 m', M === 9, `M=${M}`);
check('longueur totale = 18 m', RIGHT_X - LEFT_X === 18 * 10, `${RIGHT_X - LEFT_X}`);
check('hauteur totale = 9 m', H - FREE * 2 === 9 * 10, `${H - FREE * 2}`);
check('filet au milieu', NET_X - LEFT_X === 9 * 10, `${NET_X - LEFT_X}`);
check('ligne d attaque a 3 m du filet', ATTACK === 30, `${ATTACK}`);
check('zone libre autour', FREE > 0 && LEFT_X === FREE, `${LEFT_X}`);

console.log('\n== Postes : position par rapport au filet ==');
for (const side of ['left', 'right']) {
  const front = ['P2', 'P3', 'P4'].map((s) => distanceToNet(s, side));
  const back = ['P1', 'P5', 'P6'].map((s) => distanceToNet(s, side));
  check(`${side} : la ligne avant est plus proche du filet`, Math.max(...front) < Math.min(...back), JSON.stringify({ front, back }));
  check(`${side} : les 12 postes sont dans le terrain`, SPOTS.every((s) => insideCourt(spotXY(s, side))));
}

console.log('\n== Repere de chaque equipe ==');
// Cote « droit » de l equipe : meme ligne verticale pour P1 et P2, oppose a P4/P5.
for (const side of ['left', 'right']) {
  const p1 = spotXY('P1', side);
  const p2 = spotXY('P2', side);
  const p4 = spotXY('P4', side);
  const p5 = spotXY('P5', side);
  const p3 = spotXY('P3', side);
  const p6 = spotXY('P6', side);
  check(`${side} : P1 et P2 du meme cote (droit)`, p1.y === p2.y, `${p1.y} / ${p2.y}`);
  check(`${side} : cote droit oppose au cote gauche`, p1.y !== p4.y && p1.y !== p5.y, `${p1.y} / ${p4.y} / ${p5.y}`);
  check(`${side} : P4 et P5 du meme cote (gauche)`, p4.y === p5.y, `${p4.y} / ${p5.y}`);
  check(`${side} : P3 sur l axe du terrain`, p3.y === (p1.y + p4.y) / 2);
  check(`${side} : P6 sur l axe du terrain`, p6.y === (p1.y + p4.y) / 2);
}

console.log('\n== Symetrie par rapport au filet ==');
// Les deux camps sont en miroir : x symetrique autour du filet, y symetrique
// autour de l axe horizontal du terrain.
const MIRROR_X = 2 * NET_X;
const MIRROR_Y = 2 * (FREE + (M * 10) / 2);
for (const spot of SPOTS) {
  const l = spotXY(spot, 'left');
  const r = spotXY(spot, 'right');
  check(
    `${spot} : symetrique gauche/droite`,
    Math.abs(l.x + r.x - MIRROR_X) < 1e-9 && Math.abs(l.y + r.y - MIRROR_Y) < 1e-9,
    JSON.stringify({ l, r })
  );
}

console.log('\n== Zones ==');
check('9 zones par camp', Object.keys(ZONE_CELLS).length === 9);
check(
  'zones a 1,5 / 4,5 / 7,5 m du fond et du cote',
  Object.values(ZONE_CELLS).every(([d, w]) => [1.5, 4.5, 7.5].includes(d) && [1.5, 4.5, 7.5].includes(w))
);
const zoneOf = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5', 6: 'P6' };
for (const [zone, spot] of Object.entries(zoneOf)) {
  check(
    `zone ${zone} alignee sur ${spot}`,
    JSON.stringify(ZONE_CELLS[zone]) === JSON.stringify(COURT_SPOTS[spot]),
    JSON.stringify(ZONE_CELLS[zone])
  );
}
check('zones 7/8/9 = bande mediane (4,5 m du fond)', [7, 8, 9].every((z) => ZONE_CELLS[z][0] === 4.5));
check(
  'toutes les zones sont dans le terrain',
  Object.keys(ZONE_CELLS).every((z) => insideCourt(xyFrom(ZONE_CELLS[z][0], ZONE_CELLS[z][1], 'left')))
);

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
