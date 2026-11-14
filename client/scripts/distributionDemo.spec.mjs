// ============================================================================
// Vérifie le jeu de données du mode Démo de l'onglet Distribution.
//
// Exécution : node client/scripts/distributionDemo.spec.mjs
// ============================================================================

import {
  DEMO_MATCHES,
  DEMO_SETTERS,
  buildDemoDistributionPossessions,
} from '../src/utils/distributionDemo.js';
import {
  mapDistribToCourtBox,
  computeExcelDistributionReport,
} from '../src/utils/excelDistributionEngine.js';

let bad = 0;
const check = (label, ok, detail = '') => {
  if (!ok) bad += 1;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label + (ok ? '' : ' ' + detail));
};

console.log('\n== Mode démo : structure des possessions ==');
const possessions = buildDemoDistributionPossessions({ seed: 1 });
const perMatch = 45;
check('6 matchs fictifs', DEMO_MATCHES.length === 6);
check('2 passeurs fictifs', DEMO_SETTERS.length === 2);
check('270 possessions générées', possessions.length === DEMO_MATCHES.length * perMatch);
check(
  'chaque possession a une boîte de distribution valide',
  possessions.every((p) => !!mapDistribToCourtBox(p.distribCode, null))
);
check('6 rotations représentées', new Set(possessions.map((p) => p.rotation)).size === 6);
check(
  'les deux passeurs et NP sont présents',
  ['6', '12', 'NP'].every((s) => possessions.some((p) => p.setterNumber === s))
);
check(
  'bases offensives 0 / 1 / 2 / 7 présentes',
  ['0', '1', '2', '7'].every((b) => possessions.some((p) => p.baseOff === b))
);
check(
  'phases K1 et K2 présentes',
  possessions.some((p) => p.serviceType !== 'C') && possessions.some((p) => p.serviceType === 'C')
);
check(
  'aucune réception sur les contre-attaques',
  possessions.filter((p) => p.serviceType === 'C').every((p) => !p.receptionZone && !p.receptionQuality)
);
check(
  'résultats d’attaque du modèle',
  possessions.every((p) => ['#', '+', '0', '/', 'ERR'].includes(p.attackResult))
);

console.log('\n== Mode démo : rapport Excel ==');
const report = computeExcelDistributionReport(possessions, { setterFilter: 'ALL', phaseFilter: 'ALL' });
check('toutes les possessions sont comptées', report.globalCourt.totalActions === possessions.length);
check('les 8 boîtes du terrain global sont remplies', report.globalCourt.boxes && Object.values(report.globalCourt.boxes).every((b) => b.q > 0));
check('les 6 rotations ont des actions', report.byRotation.every((c) => c.totalActions > 0));
check('les 4 bases offensives ont des actions', report.baseCourts.every((c) => c.totalActions > 0));
check('les 3 couloirs de réception ont des actions', report.byReceptionGroup.every((c) => c.totalActions > 0));
check('les 3 groupes de zones de passe ont des actions', [...report.passZonesMini, ...report.passZonesMoyenne, ...report.passZonesBonne].every((c) => c.totalActions > 0));
check('les 13 zones de passe sont couvertes', report.saisieSummary.totalWithPassZone === possessions.length);
check('la synthèse attaquant est remplie', report.saisieSummary.attackerBreakdown.length >= 4);

const k1 = computeExcelDistributionReport(possessions, { setterFilter: 'ALL', phaseFilter: 'K1' });
const k2 = computeExcelDistributionReport(possessions, { setterFilter: 'ALL', phaseFilter: 'K2' });
check('K1 + K2 = total', k1.globalCourt.totalActions + k2.globalCourt.totalActions === possessions.length);
check('K2 ne contient que des contre-attaques', k2.filteredPossessions.every((p) => p.serviceType === 'C'));

const setter6 = computeExcelDistributionReport(possessions, { setterFilter: '6', phaseFilter: 'ALL' });
check('filtre passeur 6', setter6.filteredPossessions.every((p) => p.setterNumber === '6'));
check('filtre passeur 6 non vide', setter6.globalCourt.totalActions > 0);

console.log('\n== Mode démo : reproductibilité ==');
const again = buildDemoDistributionPossessions({ seed: 1 });
check('même graine = même tableau', JSON.stringify(again) === JSON.stringify(possessions));
const other = buildDemoDistributionPossessions({ seed: 2 });
check('graine différente = tableau différent', JSON.stringify(other) !== JSON.stringify(possessions));

console.log(bad === 0 ? '\nTOUT EST OK\n' : `\n${bad} ÉCHEC(S)\n`);
process.exit(bad === 0 ? 0 : 1);
