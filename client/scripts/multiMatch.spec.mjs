// Cumul multi-matchs. Exécution : node client/scripts/multiMatch.spec.mjs
import { prepareMatches, matchSummaries, sideOfTeamInMatch, playerActionsOf } from '../src/utils/multiMatch.js';
import { cumulativeSideOutBreak, cumulativeMoneyTime } from '../src/utils/multiMatchAnalytics.js';
import { computeSideOutBreak } from '../src/utils/dvAnalytics.js';

let bad = 0;
const check = (l, ok) => { if (!ok) bad += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

function makeActions(points) {
  const out = []; let uid = 0;
  const add = (team, n, action, extra = {}) => { uid += 1; out.push({ uid, action_index: uid, team, player_number: n, action, ...extra }); };
  for (let p = 0; p < points; p += 1) {
    const srv = p % 2 === 0 ? 'home' : 'away'; const rec = srv === 'home' ? 'away' : 'home';
    const ev = pick(['#', '=', '+', '!']);
    add(srv, 1, 'S', { evaluation: ev, start_zone: '1', end_zone: pick(['1', '5', '6']) });
    if (ev === '#' || ev === '=') continue;
    add(rec, 5, 'R', { evaluation: pick(['#', '+', '-']), end_zone: '6' });
    add(rec, 2, 'E', { evaluation: '+' });
    add(rec, 9, 'A', { evaluation: pick(['#', '=', '/', '+']), start_zone: '4', end_zone: pick(['1', '5']) });
  }
  return out;
}

const v1 = { id: 1, team1_name: 'ASUL', team2_name: 'Lyon' };
const v2 = { id: 2, team1_name: 'Paris', team2_name: 'ASUL' };
const v3 = { id: 3, team1_name: 'Autre', team2_name: 'Club' };
const matches = [
  { video: v1, actions: makeActions(30), setups: {}, events: [] },
  { video: v2, actions: makeActions(26), setups: {}, events: [] },
  { video: v3, actions: makeActions(10), setups: {}, events: [] },
];

check('côté : équipe 1', sideOfTeamInMatch(v1, 'asul') === 'home');
check('côté : équipe 2', sideOfTeamInMatch(v2, 'ASUL') === 'away');
check('côté : absente', sideOfTeamInMatch(v3, 'ASUL') === null);

const prepared = prepareMatches(matches, 'ASUL');
check('match sans l’équipe exclu', prepared.length === 2);
check('adversaires', prepared[0].opponent === 'Lyon' && prepared[1].opponent === 'Paris');

const a2 = prepared[1].actions.find((a) => a.action === 'S');
const raw2 = matches[1].actions.find((a) => a.action === 'S');
check('match 2 inversé : équipe cible = home', raw2.team === 'away' ? a2.team === 'home' : a2.team === 'away');
check('uid uniques entre matchs', new Set(prepared.flatMap((m) => m.actions.map((a) => a.uid))).size === prepared.reduce((s, m) => s + m.actions.length, 0));

// --- Toutes les actions d'un même joueur sur les matchs sélectionnés ---
const expected9 = prepared.reduce(
  (s, m) => s + m.actions.filter((a) => a.team === 'home' && Number(a.player_number) === 9).length,
  0
);
const p9 = playerActionsOf(prepared, 9);
check('joueur : actions réunies sur tous les matchs', p9.length === expected9 && expected9 > 0);
check('joueur : uniquement le côté de l’équipe analysée', p9.every((a) => a.team === 'home'));
check(
  'joueur : chaque action connaît son match vidéo',
  p9.every((a) => a.match_video_id === v1.id || a.match_video_id === v2.id)
);
check('joueur : numéro en chaîne accepté', playerActionsOf(prepared, '9').length === expected9);
check('joueur absent : aucune action', playerActionsOf(prepared, 99).length === 0);
check('joueur sans numéro : aucune action', playerActionsOf(prepared, null).length === 0);

const cum = cumulativeSideOutBreak(prepared);
const p1 = computeSideOutBreak(prepared[0].actions, {});
const p2 = computeSideOutBreak(prepared[1].actions, {});
check('cumul = somme (side-out gagnés)', cum.home.Total.sideOutWon === p1.home.Total.sideOutWon + p2.home.Total.sideOutWon);
check('cumul = somme (break joués)', cum.home.Total.breakOpp === p1.home.Total.breakOpp + p2.home.Total.breakOpp);
check('cumul = somme (rallies)', cum.away.Total.rallies === p1.away.Total.rallies + p2.away.Total.rallies);
check('pourcentage recalculé (pas sommé)', cum.home.Total.sideOutPct <= 100 && cum.home.Total.breakPct <= 100);
check('somme des points = rallies gagnées des deux équipes', cum.home.Total.points + cum.away.Total.points === cum.home.Total.rallies);

const mt = cumulativeMoneyTime(prepared);
check('money-time : rallies = cumul', mt.home.money.rallies + mt.home.rest.rallies === cum.home.Total.rallies);

const sum = matchSummaries(prepared);
check('résumés : 2 matchs', sum.length === 2 && sum[0].rallies > 0);
check('résumé : points = échanges', sum[0].rallies === prepared[0].rallies.length);
if (bad) process.exit(1);
console.log('TOUT EST OK');

// --- Contexte calculé match par match (correction du bug de fusion) ---
import { buildMultiContext, allActions } from '../src/utils/multiMatch.js';
import { buildShots } from '../src/utils/dvTrajectories.js';
import { buildActionContext } from '../src/utils/dvContext.js';
let bad5 = 0;
const c5 = (l, ok) => { if (!ok) bad5 += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const mctx = buildMultiContext(prepared);
const acts = allActions(prepared);
c5('contexte : une entrée par action', acts.every((a) => mctx.has(a.uid)));
c5('contexte : matchId conservé', acts.every((a) => String(mctx.get(a.uid).matchId) === String(a.match_video_id)));
const perMatch = prepared.map((m) => buildShots(m.actions, { team: 'home', skill: 'A', set: 1, context: buildActionContext(m.actions, m.setups, {}, m.rallies) }).length);
const merged = buildShots(acts, { team: 'home', skill: 'A', set: 1, context: mctx }).length;
c5('filtre set 1 multi-matchs = somme des matchs', merged === perMatch.reduce((s, n) => s + n, 0));
const naive = buildShots(acts, { team: 'home', skill: 'A', set: 1, context: buildActionContext(acts, {}, {}) }).length;
const merged2 = buildShots(acts, { team: 'home', skill: 'A', set: 2, context: mctx }).length;
const naive2 = buildShots(acts, { team: 'home', skill: 'A', set: 2, context: buildActionContext(acts, {}, {}) }).length;
c5('set 2 : calcul par match <= calcul sur flux fusionné (le fusionné sur-compte)', merged2 <= naive2);
c5('set 2 : calcul par match = somme des matchs', merged2 === prepared.map((m) => buildShots(m.actions, { team: 'home', skill: 'A', set: 2, context: buildActionContext(m.actions, m.setups, {}, m.rallies) }).length).reduce((s, n) => s + n, 0));
const oneMatch = buildShots(acts, { team: 'home', skill: 'A', match: prepared[0].id, context: mctx }).length;
c5('filtre match', oneMatch === buildShots(prepared[0].actions, { team: 'home', skill: 'A' }).length);
c5('somme des filtres match = total', prepared.reduce((s, m) => s + buildShots(acts, { team: 'home', skill: 'A', match: m.id, context: mctx }).length, 0) === buildShots(acts, { team: 'home', skill: 'A' }).length);
if (bad5) process.exit(1);

// --- Contexte accessible aux actions préparées (plan de jeu) ---
let bad6 = 0;
const c6 = (l, ok) => { if (!ok) bad6 += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const withRot = acts.filter((a) => a.team === 'home' && a.action === 'A' && mctx.get(a.uid)?.rotation);
c6('plan de jeu : les attaques préparées retrouvent leur contexte', acts.filter((a) => a.action === 'A').every((a) => mctx.has(a.uid)));
c6('plan de jeu : phase K1 ou K2 connue pour les attaques', acts.filter((a) => a.action === 'A').every((a) => ['K1', 'K2', 'FREEBALL'].includes(mctx.get(a.uid).phase)));
if (bad6) process.exit(1);

// --- Montage multi-matchs ---
import { playlistItemsFromActions } from '../src/utils/multiMatch.js';
import { getAdaptiveMargins } from '../src/utils/datavolley.js';
let bad7 = 0;
const c7 = (l, ok) => { if (!ok) bad7 += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const withTc = acts.filter((a) => a.action === 'A').slice(0, 5).map((a, i) => ({ ...a, timecode: 10 + i, code: '*09A#' }));
const pl = playlistItemsFromActions([...withTc, { ...withTc[0], timecode: undefined }], getAdaptiveMargins);
c7('playlist : actions avec moment retenues', pl.items.length === 5);
c7('playlist : sans moment ignorée', pl.skipped === 1);
c7('playlist : vidéo d origine conservée', pl.items.every((it, i) => it.video_id === withTc[i].match_video_id));
c7('playlist : marges de l attaque (2,5 s)', pl.items.every((it) => it.lead_in === 2.5 && it.lead_out === 2.5));
if (bad7) process.exit(1);

// --- Rapports cumulés supplémentaires : cumul = somme des matchs ---
import { cumulativeAttackByReception, cumulativeServeReceptionDuel, cumulativeBlockAndSet } from '../src/utils/multiMatchAnalytics.js';
import { attackByReception, serveReceptionDuel } from '../src/utils/dvAnalytics2.js';
import { computeBlockAnalysis } from '../src/utils/dvAnalytics3.js';
let bad8 = 0;
const c8 = (l, ok) => { if (!ok) bad8 += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const ca = cumulativeAttackByReception(prepared);
const pa = prepared.map((m) => attackByReception(m.actions, m.setups));
const totalOf = (r, side) => Object.values(r[side].byQuality).reduce((s, c) => s + c.total, 0);
c8('attaque vs réception : total cumulé = somme', totalOf(ca, 'home') === pa.reduce((s, r) => s + totalOf(r, 'home'), 0));
c8('attaque vs réception : efficacité recalculée (bornée)', Object.values(ca.home.byQuality).every((c) => c.efficiency >= -100 && c.efficiency <= 100));
const cd = cumulativeServeReceptionDuel(prepared);
const pd = prepared.map((m) => serveReceptionDuel(m.actions));
const servesOf = (r, side) => Object.values(r[side].servers).reduce((s, v) => s + v.total, 0);
c8('duel : services cumulés = somme', servesOf(cd, 'home') === pd.reduce((s, r) => s + servesOf(r, 'home'), 0));
const cb = cumulativeBlockAndSet(prepared);
const pb = prepared.map((m) => computeBlockAnalysis(m.actions));
c8('contre : total cumulé = somme', cb.block.home.total === pb.reduce((s, r) => s + r.home.total, 0));
c8('contre : % points recalculé (<= 100)', cb.block.home.pointsPct <= 100);
if (bad8) process.exit(1);

// --- Distribution cumulée : mêmes compteurs que la somme des matchs ---
import { cumulativeDistributionReport } from '../src/utils/multiMatchAnalytics.js';
import { buildDistributionReport } from '../src/utils/distributionReport.js';
let bad9 = 0;
const c9 = (l, ok) => { if (!ok) bad9 += 1; console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + l); };
const cd9 = cumulativeDistributionReport(prepared, { phase: 'K1' });
const rd9 = prepared.map((m) => buildDistributionReport(m.actions, m.rallies, m.setups, {}, { phase: 'K1' }));
c9('distribution : inclus = somme des matchs', cd9.meta.home.included === rd9.reduce((s, r) => s + r.meta.home.included, 0));
c9('distribution : brutes = somme des matchs', cd9.meta.home.rawAttacks === rd9.reduce((s, r) => s + r.meta.home.rawAttacks, 0));
c9('distribution : zones = somme des matchs', ['4','3','2','7','8','9','5','6','1'].every((z) => cd9.home.Total.ALL[z].count === rd9.reduce((s, r) => s + r.home.Total.ALL[z].count, 0)));
c9('distribution : exclusions = somme des matchs', cd9.meta.home.excluded.UNKNOWN_SITUATION === rd9.reduce((s, r) => s + r.meta.home.excluded.UNKNOWN_SITUATION, 0));
if (bad9) process.exit(1);
