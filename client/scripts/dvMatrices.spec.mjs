// Matrices de rapport. Exécution : node client/scripts/dvMatrices.spec.mjs
import { attackCrossMatrix, receptionBoard } from '../src/utils/dvMatrices.js';

let bad = 0;
const check = (l, ok) => { if (!ok) bad += 1; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${l}`); };

const A = [
  { uid: 1, team: 'home', action: 'A', player_number: 4, start_zone: '4', end_zone: '5', end_subzone: 'A', evaluation: '#' },
  { uid: 2, team: 'home', action: 'A', player_number: 4, start_zone: '4', end_zone: '5', end_subzone: 'B', evaluation: '=' },
  { uid: 3, team: 'home', action: 'A', player_number: 7, start_zone: '2', end_zone: '1', evaluation: '/' },
  { uid: 4, team: 'home', action: 'A', player_number: 7, start_zone: '2', evaluation: '+' },
  { uid: 5, team: 'away', action: 'A', player_number: 9, start_zone: '4', end_zone: '5', evaluation: '#' },
  { uid: 6, team: 'home', action: 'R', player_number: 5, end_zone: '6', evaluation: '#' },
  { uid: 7, team: 'home', action: 'R', player_number: 5, end_zone: '6', evaluation: '-' },
  { uid: 8, team: 'home', action: 'R', player_number: 6, end_zone: '1', evaluation: '=' },
];

const m = attackCrossMatrix(A, 'home');
check('total sans arrivée exclu', m.total === 3);
check('cellule 4 -> 5', m.cells['4|5'].total === 2 && m.cells['4|5'].points === 1 && m.cells['4|5'].errors === 1);
check('efficacité 4 -> 5 = 0%', m.cells['4|5'].efficiency === 0);
check('contrée 2 -> 1 = -100%', m.cells['2|1'].efficiency === -100);
check('totaux de ligne', m.rowTotals['4'].total === 2 && m.rowTotals['2'].total === 1);
check('totaux de colonne', m.colTotals['5'].total === 2);
check('somme des lignes = total', Object.values(m.rowTotals).reduce((s, c) => s + c.total, 0) === m.total);
check('somme des colonnes = total', Object.values(m.colTotals).reduce((s, c) => s + c.total, 0) === m.total);

const sub = attackCrossMatrix(A, 'home', { bySubzone: true });
check('sous-zones : seules les attaques avec sous-zone', sub.total === 2 && sub.cells['4|5A'].total === 1 && sub.cells['4|5B'].total === 1);
check('sous-zones : 36 colonnes', sub.cols.length === 36);
check('filtre joueur', attackCrossMatrix(A, 'home', { player: 7 }).total === 1);
check('équipe adverse séparée', attackCrossMatrix(A, 'away').total === 1);

const r = receptionBoard(A, 'home');
check('réception : total', r.total === 3);
check('réception : réceptionneur 5', r.players[0].number === 5 && r.players[0].total === 2);
check('réception : % positif joueur 5 = 50', r.players[0].positivePct === 50);
check('réception : % faute joueur 6 = 100', r.players.find((p) => p.number === 6).errorPct === 100);
check('réception : zone 6', r.zones['6'].total === 2 && r.zones['6'].positivePct === 50);
if (bad) process.exit(1);
console.log('TOUT EST OK');
