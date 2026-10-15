// ============================================================================
// Export d'une fiche de trajectoire en dossier ZIP autonome (lecture seule).
//
// Le ZIP contient :
//   • trajectoires.html  la page (s'ouvre au double-clic, sans serveur) ;
//   • trajectoires.css   les styles du visualiseur ;
//   • trajectoires.js    la logique du visualiseur (vanilla JS, lecture seule) ;
//   • data.js            les données du match (window.TRAJ_DATA = {...}) ;
//   • lisez-moi.txt      deux mots d'explication.
//
// Seul data.js change d'un match à l'autre : les trois autres fichiers sont
// statiques, ce qui garde le visualiseur identique partout.
//
// Les données sont chargées par <script src="data.js"> et non par fetch() :
// un fetch d'un fichier local est bloqué sous file:// par les navigateurs.
// ============================================================================

import { rosterOf } from './trajectory.js';

/** Nom de fichier sûr pour un nom de match (« A vs B » → « a-vs-b »). */
export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Une flèche acceptée telle quelle (start/end) ou en colonnes (start_x…). */
function normalizeShot(shot) {
  const start = shot?.start || { x: shot?.start_x, y: shot?.start_y };
  const end = shot?.end || { x: shot?.end_x, y: shot?.end_y };
  return {
    team_side: shot?.team_side === 'away' ? 'away' : 'home',
    player_number: Number(shot?.player_number) || 0,
    kind: shot?.kind === 'attack' ? 'attack' : 'serve',
    start: { x: Number(start?.x) || 0, y: Number(start?.y) || 0 },
    end: { x: Number(end?.x) || 0, y: Number(end?.y) || 0 },
    result: shot?.result || 'out',
  };
}

/**
 * Données du visualiseur : nom du match, les deux équipes (avec effectif) et
 * toutes les flèches. `away` vaut null quand la fiche n'a qu'une équipe.
 */
export function buildTrajectoryData(match, shots = []) {
  const homeTeam = match?.home_team || null;
  const awayTeam = match?.away_team || null;
  const hasAway = !!(awayTeam || match?.away_team_id);
  const teamOf = (s) => (s === 'home' ? homeTeam : awayTeam);
  const nameOf = (s) =>
    teamOf(s)?.name ||
    (s === 'home' ? match?.team1_name : match?.team2_name) ||
    (s === 'home' ? 'Équipe 1' : 'Équipe 2');
  const players = (s) => rosterOf(teamOf(s)).map((p) => ({ number: p.number, name: p.name, role: p.role }));

  return {
    name: match?.name || 'Fiche de trajectoire',
    generatedAt: new Date().toISOString(),
    home: { name: nameOf('home'), players: players('home') },
    away: hasAway ? { name: nameOf('away'), players: players('away') } : null,
    shots: (shots || []).map(normalizeShot),
  };
}

/** Contenu du fichier data.js (le '<' est échappé : jamais de balise fermante). */
export function renderDataScript(data) {
  return `window.TRAJ_DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`;
}

/** Page du visualiseur : un conteneur, la fenêtre d'agrandissement, 3 scripts. */
export const VIEWER_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fiche de trajectoire</title>
  <link rel="stylesheet" href="trajectoires.css">
</head>
<body>
  <div id="app"></div>
  <div id="zoom" class="tj-zoom-overlay" hidden></div>
  <script src="data.js"></script>
  <script src="trajectoires.js"></script>
</body>
</html>
`;

/** Styles du visualiseur : mêmes couleurs et mêmes teintes que l'application. */
export const VIEWER_CSS = `/* Visualiseur de trajectoires — lecture seule, hors ligne. */
:root {
  --bg-deep: #151311;
  --bg-primary: #1b1917;
  --bg-secondary: #201e1b;
  --bg-tertiary: #262420;
  --accent: #c8965c;
  --accent-soft: #d4a76a;
  --text-primary: #e8e0d5;
  --text-secondary: #d4ccc0;
  --text-muted: #a09888;
  --border-subtle: rgba(232, 224, 213, 0.06);
  --border-hover: rgba(232, 224, 213, 0.12);
  --border-accent: rgba(200, 150, 92, 0.25);
  --radius: 10px;
  --radius-lg: 14px;
  --font-body: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body); background: var(--bg-deep); color: var(--text-primary); font-size: 15px; line-height: 1.5; min-height: 100vh; }
#app { max-width: 1500px; margin: 0 auto; padding: 20px 24px 64px; }

.tj-top { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 6px 0 16px; border-bottom: 1px solid var(--border-subtle); margin-bottom: 14px; }
.tj-title { display: flex; align-items: center; gap: 10px; font-size: 20px; }
.tj-badge { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--accent); border: 1px solid var(--border-accent); border-radius: 999px; padding: 2px 10px; }
.tj-teams { color: var(--text-muted); font-size: 13px; margin-left: auto; }

.tj-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }

.btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 7px 12px; cursor: pointer; transition: all 0.15s ease; }
.btn:hover { border-color: var(--border-hover); color: var(--text-primary); }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #151311; }
.tj-tab.active { background: var(--accent); border-color: var(--accent); color: #151311; }

.tj-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius); position: sticky; top: 0; z-index: 20; }
.tj-kindtabs { display: flex; gap: 4px; }
.tj-toolbar-team { color: var(--text-secondary); font-size: 13px; font-weight: 600; }
.tj-spacer { flex: 1; }

.tj-filter-menu { position: relative; }
.tj-filter-dropdown { position: absolute; right: 0; top: calc(100% + 6px); width: 250px; background: var(--bg-tertiary); border: 1px solid var(--border-hover); border-radius: var(--radius); padding: 8px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45); display: none; z-index: 30; }
.tj-filter-menu.open .tj-filter-dropdown { display: block; }
.tj-filter-item { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; color: var(--text-secondary); font: inherit; font-size: 13px; padding: 7px 8px; border-radius: 6px; cursor: pointer; text-align: left; }
.tj-filter-item:hover { background: rgba(255, 255, 255, 0.05); }
.tj-filter-item.off { opacity: 0.45; }
.tj-filter-dot { width: 10px; height: 10px; border-radius: 50%; }
.tj-filter-check { width: 14px; font-family: var(--font-mono); }
.tj-filter-actions { display: flex; gap: 6px; margin-top: 6px; border-top: 1px solid var(--border-subtle); padding-top: 6px; }

.tj-recap { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 12px 0; font-size: 13px; color: var(--text-muted); }
.tj-recap-label { font-weight: 600; color: var(--text-secondary); }
.tj-chip { font-size: 11px; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 2px 8px; }

.tj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.tj-card { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 10px; }
.tj-card.tj-kind-serve { border-top: 3px solid rgba(88, 124, 172, 0.65); }
.tj-card.tj-kind-attack { border-top: 3px solid rgba(200, 150, 92, 0.65); }
.tj-card-head { display: flex; align-items: center; gap: 8px; }
.tj-number { font-family: var(--font-mono); font-weight: 700; font-size: 13px; border: 2px solid; border-radius: 6px; padding: 0 5px; min-width: 26px; text-align: center; }
.tj-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tj-role { font-size: 11px; font-weight: 700; }
.tj-card-actions { display: inline-flex; gap: 4px; }
.tj-card-stats { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 20px; }
.tj-hint { color: var(--text-muted); font-size: 12px; }

.tj-court-svg { width: 100%; height: auto; border-radius: 8px; background: rgba(255, 255, 255, 0.02); }
.tj-court-svg.tj-kind-serve { background: rgba(88, 124, 172, 0.16); }
.tj-court-svg.tj-kind-attack { background: rgba(200, 150, 92, 0.15); }
.tj-court-free { fill: rgba(200, 150, 92, 0.05); }
.tj-kind-serve .tj-court-free { fill: rgba(88, 124, 172, 0.07); }
.tj-kind-attack .tj-court-free { fill: rgba(200, 150, 92, 0.07); }
.tj-court-field { fill: rgba(255, 255, 255, 0.03); }
.tj-kind-serve .tj-court-field { fill: rgba(140, 175, 215, 0.09); }
.tj-kind-attack .tj-court-field { fill: rgba(200, 150, 92, 0.1); }
.tj-court-kind { fill: #9fb4d0; letter-spacing: 0.6px; }
.tj-kind-attack .tj-court-kind { fill: var(--accent-soft); }
.tj-court-big { width: 100%; }

.tj-zoom-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.72); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 100; }
.tj-zoom-overlay[hidden] { display: none; }
.tj-zoom { background: var(--bg-primary); border: 1px solid var(--border-hover); border-radius: var(--radius-lg); padding: 16px 18px; width: min(1100px, 96vw); max-height: 92vh; overflow: auto; display: flex; flex-direction: column; gap: 10px; }

.tj-foot { margin-top: 24px; color: var(--text-muted); font-size: 12px; text-align: center; }
@media (max-width: 720px) { .tj-grid { grid-template-columns: 1fr; } }
`;

/** Logique du visualiseur : terrains, onglets, filtre et agrandissement. */
export const VIEWER_JS = `(function () {
  'use strict';

  var D = window.TRAJ_DATA;
  var app = document.getElementById('app');
  var zoomEl = document.getElementById('zoom');
  if (!D || !app || !zoomEl) return;

  // ---- Catalogues (identiques à l'application) ---------------------------
  var RESULTS = {
    point: { label: 'Point', short: 'Point', color: '#34a853', arc: false },
    feinte_point: { label: 'Feinte point', short: 'Feinte pt', color: '#34a853', arc: true },
    continuite: { label: 'Continuité', short: 'Continuité', color: '#4285f4', arc: false },
    feinte_continuite: { label: 'Feinte continuité', short: 'Feinte cont', color: '#4285f4', arc: true },
    faute: { label: 'Faute', short: 'Faute', color: '#ea4335', arc: false },
    contree: { label: 'Contrée', short: 'Contrée', color: '#ff8f00', arc: false },
    out: { label: 'Dehors', short: 'Dehors', color: '#ea4335', arc: false }
  };
  var SERVE_RESULTS = ['point', 'continuite', 'faute', 'out'];
  var ATTACK_RESULTS = ['point', 'feinte_point', 'feinte_continuite', 'continuite', 'faute', 'contree', 'out'];
  var ROLE_COLORS = { setter: '#4c9be8', opposite: '#e8a33d', outside: '#5fbf87', middle: '#b06fd6', libero: '#e8734c', universal: '#8b8b8b' };
  var ROLE_SHORT = { setter: 'PAS', opposite: 'POI', outside: 'RÉC', middle: 'CEN', libero: 'LIB', universal: 'POL' };

  // ---- Géométrie du terrain (1 unité = 10 cm) ----------------------------
  var U = 10, M = 9, FREE = 5;
  var LEFT_X = FREE;
  var NET_X = FREE + M * U;
  var RIGHT_X = FREE + M * 2 * U;
  var ATTACK = 3 * U;
  var MARGIN = 22;
  var VIEWBOX = { x: LEFT_X - MARGIN, y: FREE - MARGIN, w: (RIGHT_X - LEFT_X) + MARGIN * 2, h: M * U + MARGIN * 2 };
  var COURT = { x: LEFT_X, y: FREE, w: RIGHT_X - LEFT_X, h: M * U, netX: NET_X, attack: ATTACK, top: FREE, bottom: FREE + M * U };
  var ZONE_CELLS = { 4: [7.5, 1.5], 3: [7.5, 4.5], 2: [7.5, 7.5], 7: [4.5, 1.5], 8: [4.5, 4.5], 9: [4.5, 7.5], 5: [1.5, 1.5], 6: [1.5, 4.5], 1: [1.5, 7.5] };
  var ARC_BULGE = 32;
  var COURT_MID_Y = FREE + (M * U) / 2;
  var seq = 0;

  function r1(v) { return Math.round(v * 10) / 10; }
  function xyFrom(depth, width, side) {
    if (side === 'left') return { x: LEFT_X + depth * U, y: FREE + width * U };
    return { x: RIGHT_X - depth * U, y: FREE + (M - width) * U };
  }
  function straightPath(from, to) {
    return 'M ' + r1(from.x) + ' ' + r1(from.y) + ' L ' + r1(to.x) + ' ' + r1(to.y);
  }
  function arcPath(from, to) {
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var midX = (from.x + to.x) / 2, midY = (from.y + to.y) / 2;
    var px = -dy / len, py = dx / len;
    var bas = py > 0;
    var haut = from.y <= COURT_MID_Y && to.y <= COURT_MID_Y;
    var dir = (haut ? !bas : bas) ? 1 : -1;
    var cx = midX + px * ARC_BULGE * dir, cy = midY + py * ARC_BULGE * dir;
    return 'M ' + r1(from.x) + ' ' + r1(from.y) + ' Q ' + r1(cx) + ' ' + r1(cy) + ' ' + r1(to.x) + ' ' + r1(to.y);
  }
  function shotPath(shot) {
    var meta = RESULTS[shot.result];
    return meta && meta.arc ? arcPath(shot.start, shot.end) : straightPath(shot.start, shot.end);
  }
  function resultColor(id) { return (RESULTS[id] && RESULTS[id].color) || '#8b8b8b'; }
  function resultLabel(id) { return (RESULTS[id] && RESULTS[id].label) || 'Issue inconnue'; }
  function resultsFor(kind) { return kind === 'serve' ? SERVE_RESULTS : ATTACK_RESULTS; }
  function roleColor(r) { return ROLE_COLORS[r] || ROLE_COLORS.universal; }
  function roleShort(r) { return ROLE_SHORT[r] || 'POL'; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- État --------------------------------------------------------------
  var hasAway = !!D.away;
  var state = { side: 'home', kind: 'serve', hidden: [], filterOpen: false };

  function teamOf(side) { return side === 'away' ? D.away : D.home; }
  function teamName(side) {
    var t = teamOf(side);
    return (t && t.name) || (side === 'away' ? 'Équipe 2' : 'Équipe 1');
  }
  function roster(side) {
    var t = teamOf(side);
    var list = (t && t.players) ? t.players.slice() : [];
    return list.filter(function (p) { return Number(p.number) > 0; })
      .sort(function (a, b) { return Number(a.number) - Number(b.number); });
  }
  function opponentSide(side) { return side === 'home' ? 'away' : 'home'; }
  function isHidden(id) { return state.hidden.indexOf(id) > -1; }
  function sideShots(side, kind) {
    return D.shots.filter(function (s) { return s.team_side === side && s.kind === kind; });
  }
  function shownShots(side, kind) {
    return sideShots(side, kind).filter(function (s) { return !isHidden(s.result); });
  }
  function playerShots(side, kind, number) {
    return shownShots(side, kind).filter(function (s) { return Number(s.player_number) === Number(number); });
  }
  function countBy(list) {
    var out = {};
    for (var i = 0; i < list.length; i += 1) { out[list[i].result] = (out[list[i].result] || 0) + 1; }
    return out;
  }
  function teamsLabels(side) {
    return { left: teamName(side), right: hasAway ? teamName(opponentSide(side)) : '' };
  }

  // ---- Terrain -----------------------------------------------------------
  function courtSvg(side, kind, shots, big) {
    seq += 1;
    var mid = 'tjm' + seq;
    var teams = teamsLabels(side);
    var out = [];
    out.push('<svg viewBox="' + VIEWBOX.x + ' ' + VIEWBOX.y + ' ' + VIEWBOX.w + ' ' + VIEWBOX.h + '" class="tj-court-svg tj-kind-' + kind + (big ? ' tj-court-big' : '') + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Terrain — ' + esc(teams.left) + '">');
    out.push('<defs>');
    Object.keys(RESULTS).forEach(function (rid) {
      out.push('<marker id="' + mid + '-' + rid + '" viewBox="0 0 8 8" refX="6.6" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="' + RESULTS[rid].color + '"></path></marker>');
    });
    out.push('</defs>');
    out.push('<rect class="tj-court-free" x="' + VIEWBOX.x + '" y="' + VIEWBOX.y + '" width="' + VIEWBOX.w + '" height="' + VIEWBOX.h + '" rx="4"></rect>');
    out.push('<rect class="tj-court-field" x="' + COURT.x + '" y="' + COURT.y + '" width="' + COURT.w + '" height="' + COURT.h + '" stroke="#e8e0d5" stroke-width="1.2"></rect>');
    out.push('<line x1="' + (COURT.netX - COURT.attack) + '" y1="' + COURT.top + '" x2="' + (COURT.netX - COURT.attack) + '" y2="' + COURT.bottom + '" stroke="#e8e0d5" stroke-width="0.8" opacity="0.8"></line>');
    out.push('<line x1="' + (COURT.netX + COURT.attack) + '" y1="' + COURT.top + '" x2="' + (COURT.netX + COURT.attack) + '" y2="' + COURT.bottom + '" stroke="#e8e0d5" stroke-width="0.8" opacity="0.8"></line>');
    out.push('<rect x="' + (COURT.netX - 0.8) + '" y="' + (COURT.top - 4) + '" width="1.6" height="' + (COURT.h + 8) + '" fill="#c8965c" opacity="0.3"></rect>');
    out.push('<line x1="' + COURT.netX + '" y1="' + COURT.top + '" x2="' + COURT.netX + '" y2="' + COURT.bottom + '" stroke="#e8e0d5" stroke-width="0.7" opacity="0.75"></line>');
    ['left', 'right'].forEach(function (s) {
      Object.keys(ZONE_CELLS).forEach(function (zone) {
        var cell = ZONE_CELLS[zone];
        var p = xyFrom(cell[0], cell[1], s);
        out.push('<text x="' + p.x + '" y="' + (p.y + 1.4) + '" text-anchor="middle" font-size="3.6" font-weight="700" fill="#a09888" opacity="0.35">' + zone + '</text>');
      });
    });
    out.push('<text class="tj-court-kind" x="' + (VIEWBOX.x + 2) + '" y="' + (VIEWBOX.y + 8) + '" font-size="6" font-weight="800">' + (kind === 'serve' ? 'SERVICES' : 'ATTAQUE') + '</text>');
    out.push('<text x="' + (COURT.x + 1) + '" y="' + (COURT.top - 6) + '" font-size="5" font-weight="800" fill="#d4ccc0">' + esc(teams.left) + '</text>');
    out.push('<text x="' + (COURT.x + COURT.w - 1) + '" y="' + (COURT.top - 6) + '" text-anchor="end" font-size="5" font-weight="800" fill="#a09888">' + esc(teams.right || 'Adversaire') + '</text>');
    shots.forEach(function (shot) {
      var color = resultColor(shot.result);
      out.push('<g><title>' + esc(resultLabel(shot.result)) + ' — de (' + shot.start.x + ' ; ' + shot.start.y + ') à (' + shot.end.x + ' ; ' + shot.end.y + ')</title>');
      out.push('<path d="' + shotPath(shot) + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" marker-end="url(#' + mid + '-' + shot.result + ')"></path>');
      out.push('<circle cx="' + shot.start.x + '" cy="' + shot.start.y + '" r="1.5" fill="' + color + '" fill-opacity="0.8"></circle>');
      out.push('<circle cx="' + shot.end.x + '" cy="' + shot.end.y + '" r="1.1" fill="' + color + '"></circle></g>');
    });
    out.push('</svg>');
    return out.join('');
  }

  // ---- Cartes et barres --------------------------------------------------
  function renderCard(side, kind, player) {
    var shots = playerShots(side, kind, player.number);
    var counts = countBy(shots);
    var rc = roleColor(player.role);
    var name = player.name || ('N°' + player.number);
    var out = [];
    out.push('<div class="tj-card tj-kind-' + kind + '">');
    out.push('<div class="tj-card-head">');
    out.push('<span class="tj-number" style="border-color:' + rc + '">' + player.number + '</span>');
    out.push('<span class="tj-name" title="' + esc(name) + '">' + esc(name) + '</span>');
    out.push('<span class="tj-role" style="color:' + rc + '">' + roleShort(player.role) + '</span>');
    out.push('<span class="tj-card-actions"><button type="button" class="btn btn-sm" data-zoom="' + side + '|' + kind + '|' + player.number + '" title="Agrandir le terrain">Agrandir</button></span>');
    out.push('</div>');
    out.push(courtSvg(side, kind, shots, false));
    out.push('<div class="tj-card-stats">');
    if (shots.length === 0) out.push('<span class="tj-hint">Aucune flèche pour ce joueur.</span>');
    resultsFor(kind).forEach(function (id) {
      if (counts[id] > 0) {
        out.push('<span class="tj-chip" style="border-color:' + RESULTS[id].color + ';color:' + RESULTS[id].color + '">' + esc(RESULTS[id].short) + ' ' + counts[id] + '</span>');
      }
    });
    out.push('</div></div>');
    return out.join('');
  }

  function renderTabs() {
    if (!hasAway) return '';
    var labels = { home: 'Équipe 1', away: 'Équipe 2' };
    var out = ['<nav class="tj-tabs">'];
    ['home', 'away'].forEach(function (side) {
      out.push('<button type="button" class="btn tj-tab' + (state.side === side ? ' active' : '') + '" data-side="' + side + '">' + labels[side] + ' · ' + esc(teamName(side)) + '</button>');
    });
    out.push('</nav>');
    return out.join('');
  }

  function renderToolbar() {
    var current = teamName(state.side);
    var opp = hasAway ? teamName(opponentSide(state.side)) : '';
    var hiddenCount = state.hidden.filter(function (id) { return resultsFor(state.kind).indexOf(id) > -1; }).length;
    var out = [];
    out.push('<div class="tj-toolbar tj-kind-' + state.kind + '">');
    out.push('<div class="tj-kindtabs">');
    [['serve', 'Services'], ['attack', 'Attaque']].forEach(function (k) {
      out.push('<button type="button" class="btn tj-tab' + (state.kind === k[0] ? ' active' : '') + '" data-kind="' + k[0] + '">' + k[1] + '</button>');
    });
    out.push('</div>');
    out.push('<span class="tj-toolbar-team">' + esc(current) + (opp ? ' vs ' + esc(opp) : '') + '</span>');
    out.push('<span class="tj-spacer"></span>');
    out.push('<div class="tj-filter-menu' + (state.filterOpen ? ' open' : '') + '">');
    out.push('<button type="button" class="btn btn-sm' + (hiddenCount > 0 ? ' primary' : '') + '" data-action="toggle-filter">Filtres' + (hiddenCount > 0 ? ' (' + hiddenCount + ' masqué' + (hiddenCount > 1 ? 's' : '') + ')' : '') + '</button>');
    out.push('<div class="tj-filter-dropdown">');
    resultsFor(state.kind).forEach(function (id) {
      var visible = !isHidden(id);
      out.push('<button type="button" class="tj-filter-item' + (visible ? '' : ' off') + '" data-result="' + id + '"><span class="tj-filter-check">' + (visible ? '✓' : '—') + '</span><span class="tj-filter-dot" style="background:' + RESULTS[id].color + '"></span><span>' + esc(RESULTS[id].label) + '</span></button>');
    });
    out.push('<div class="tj-filter-actions"><button type="button" class="btn btn-sm" data-action="show-all">Tout afficher</button><button type="button" class="btn btn-sm" data-action="hide-all">Tout masquer</button></div>');
    out.push('</div></div>');
    out.push('</div>');
    return out.join('');
  }

  function renderRecap() {
    var kindLabel = state.kind === 'serve' ? 'Services' : 'Attaque';
    var shots = shownShots(state.side, state.kind);
    var counts = countBy(shots);
    var out = ['<div class="tj-recap">'];
    out.push('<span class="tj-recap-label">' + kindLabel + ' — ' + esc(teamName(state.side)) + ' · ' + shots.length + ' flèche' + (shots.length > 1 ? 's' : '') + '</span>');
    resultsFor(state.kind).forEach(function (id) {
      if (counts[id] > 0) out.push('<span class="tj-chip" style="border-color:' + RESULTS[id].color + ';color:' + RESULTS[id].color + '">' + esc(RESULTS[id].label) + ' ' + counts[id] + '</span>');
    });
    out.push('</div>');
    return out.join('');
  }

  // ---- Rendu global ------------------------------------------------------
  function render() {
    var list = roster(state.side);
    var out = [];
    out.push('<header class="tj-top"><div class="tj-title"><strong>' + esc(D.name) + '</strong><span class="tj-badge">Consultation</span></div><div class="tj-teams">' + esc(teamName('home')) + (hasAway ? ' · ' + esc(teamName('away')) : '') + '</div></header>');
    out.push(renderTabs());
    out.push(renderToolbar());
    out.push('<p class="tj-hint" style="margin:10px 0">Lecture seule : aucune flèche ne peut être ajoutée ni modifiée. Cliquez sur « Agrandir » pour voir un terrain en grand.</p>');
    out.push(renderRecap());
    if (list.length === 0) {
      out.push('<div class="tj-hint">Aucun joueur dans l’effectif de cette équipe.</div>');
    } else {
      out.push('<div class="tj-grid">');
      list.forEach(function (p) { out.push(renderCard(state.side, state.kind, p)); });
      out.push('</div>');
    }
    out.push('<p class="tj-foot">Exporté le ' + esc((D.generatedAt || '').slice(0, 10)) + ' — consultation hors ligne.</p>');
    app.innerHTML = out.join('');
  }

  // ---- Agrandissement ----------------------------------------------------
  function closeZoom() { zoomEl.hidden = true; zoomEl.innerHTML = ''; }
  function openZoom(side, kind, number) {
    var player = roster(side).filter(function (p) { return Number(p.number) === Number(number); })[0];
    if (!player) return;
    var shots = playerShots(side, kind, number);
    var name = player.name || ('N°' + player.number);
    var rc = roleColor(player.role);
    var out = [];
    out.push('<div class="tj-zoom">');
    out.push('<div class="tj-card-head"><span class="tj-number" style="border-color:' + rc + '">' + player.number + '</span><span class="tj-name">' + esc(name) + '</span><span class="tj-card-actions"><button type="button" class="btn btn-sm" data-action="close-zoom">Fermer</button></span></div>');
    out.push(courtSvg(side, kind, shots, true));
    out.push('<p class="tj-hint">Consultation : les flèches sont en lecture seule.</p>');
    out.push('</div>');
    zoomEl.innerHTML = out.join('');
    zoomEl.hidden = false;
  }

  // ---- Interactions ------------------------------------------------------
  app.addEventListener('click', function (e) {
    var zoomBtn = e.target.closest('[data-zoom]');
    if (zoomBtn) {
      var parts = zoomBtn.getAttribute('data-zoom').split('|');
      openZoom(parts[0], parts[1], parts[2]);
      return;
    }
    var sideBtn = e.target.closest('[data-side]');
    if (sideBtn) { state.side = sideBtn.getAttribute('data-side'); state.hidden = []; render(); return; }
    var kindBtn = e.target.closest('[data-kind]');
    if (kindBtn) { state.kind = kindBtn.getAttribute('data-kind'); state.hidden = []; state.filterOpen = false; render(); return; }
    var resBtn = e.target.closest('[data-result]');
    if (resBtn) {
      var id = resBtn.getAttribute('data-result');
      state.hidden = isHidden(id) ? state.hidden.filter(function (x) { return x !== id; }) : state.hidden.concat([id]);
      render();
      return;
    }
    var actBtn = e.target.closest('[data-action]');
    if (actBtn) {
      var action = actBtn.getAttribute('data-action');
      if (action === 'toggle-filter') { state.filterOpen = !state.filterOpen; render(); }
      else if (action === 'show-all') { state.hidden = []; render(); }
      else if (action === 'hide-all') { state.hidden = resultsFor(state.kind).slice(); render(); }
    }
  });

  zoomEl.addEventListener('click', function (e) {
    if (e.target === zoomEl || e.target.closest('[data-action="close-zoom"]')) closeZoom();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !zoomEl.hidden) { closeZoom(); return; }
    if (e.key === 't' || e.key === 'T') {
      state.kind = state.kind === 'serve' ? 'attack' : 'serve';
      state.hidden = [];
      render();
    }
  });

  document.title = 'Trajectoires — ' + D.name;
  render();
})();
`;

/** Petit mode d'emploi livré dans le ZIP. */
export const README_TEXT = [
  'Fiche de trajectoire — consultation hors ligne',
  '',
  'Ouvrez trajectoires.html dans un navigateur (double-clic sur le fichier).',
  'La page est en lecture seule : on peut changer d’équipe, basculer',
  'Services / Attaque, filtrer les issues et agrandir un terrain, mais',
  'aucune flèche ne peut être ajoutée ni modifiée.',
  '',
  'Fichiers :',
  '  trajectoires.html  la page à ouvrir',
  '  trajectoires.css   les styles',
  '  trajectoires.js    la logique du visualiseur',
  '  data.js            les données du match (flèches, équipes, joueurs)',
  '',
  'Aucune connexion internet n’est nécessaire.',
].join('\n');

/** Contenu des fichiers du dossier ZIP, prêt à écrire. */
export function trajectoryZipFiles(match, shots = []) {
  return {
    'trajectoires.html': VIEWER_HTML,
    'trajectoires.css': VIEWER_CSS,
    'trajectoires.js': VIEWER_JS,
    'data.js': renderDataScript(buildTrajectoryData(match, shots)),
    'lisez-moi.txt': README_TEXT,
  };
}

/** Nom du fichier ZIP proposé au téléchargement. */
export function trajectoryZipName(match) {
  return `trajectoires-${slugify(match?.name) || 'match'}.zip`;
}

/**
 * Construit le ZIP (jszip est chargé à la demande : le module reste léger et
 * testable sans la dépendance).
 */
export async function buildTrajectoryZipBlob(match, shots = []) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const files = trajectoryZipFiles(match, shots);
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Télécharge le dossier ZIP (lecture seule) de la fiche. */
export async function downloadTrajectoryZip(match, shots = []) {
  if (typeof document === 'undefined') return false;
  const blob = await buildTrajectoryZipBlob(match, shots);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = trajectoryZipName(match);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  return true;
}
