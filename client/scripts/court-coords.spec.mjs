// ============================================================================
// TEST : SYSTÈME DE COORDONNÉES 100x100 DATAVOLLEY 4 (Point 14)
// Exécution : node client/scripts/court-coords.spec.mjs
// ============================================================================

import {
  toDv100Coords,
  fromDv100Coords,
  subzoneFromPoint,
  zoneCenter,
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

console.log('\n== Test 1 : Conversion SVG Court Coordinates vers 100x100 ==');

// Centre du terrain côté Domicile (x ~ 55, y ~ 45)
const ptHome = { x: 55, y: 45 };
const coordsHome = toDv100Coords(ptHome);
check('Normalise x dans l’intervalle [0, 100]', coordsHome.x >= 0 && coordsHome.x <= 100, `obtenu: ${coordsHome.x}`);
check('Normalise y dans l’intervalle [0, 100]', coordsHome.y >= 0 && coordsHome.y <= 100, `obtenu: ${coordsHome.y}`);

console.log('\n== Test 2 : Conversion Inverse 100x100 vers SVG Point ==');

const dv100 = { x: 50, y: 50 };
const backSvg = fromDv100Coords(dv100.x, dv100.y);
check('Reconvertit les coordonnées 100x100 en coordonnées SVG valides', backSvg !== null && Number.isFinite(backSvg.x) && Number.isFinite(backSvg.y));

// Aller-retour
const roundTrip = toDv100Coords(backSvg);
check('Aller-retour préserve les coordonnées (±1%)', Math.abs(roundTrip.x - dv100.x) <= 1 && Math.abs(roundTrip.y - dv100.y) <= 1, `obtenu: ${JSON.stringify(roundTrip)}`);

console.log('\n== Test 3 : Dérivation des Sous-zones (A, B, C, D) d’une Zone ==');

// Zone 4 côté Domicile
const z4Center = zoneCenter('4', 'home');
check('Calcule le centre de zone 4', z4Center !== null);

const subA = subzoneFromPoint({ x: z4Center.x - 1, y: z4Center.y - 1 }, '4', 'home');
check('Dérive une sous-zone valide (A, B, C ou D)', ['A', 'B', 'C', 'D'].includes(subA), `obtenu: ${subA}`);

if (failures > 0) {
  console.error(`\n❌ ${failures} échec(s) dans le test des coordonnées 100x100.`);
  process.exit(1);
} else {
  console.log('\n✅ Tous les tests de coordonnées 100x100 ont réussi !');
}
