// ============================================================================
// Export / import DataVolley .dvw (format texte).
// Sections délimitées par [3XXX], champs séparés par ';'.
//   [3DATAVOLLEY] version · [3MATCH] infos · [3TEAMS] équipes
//   [3PLAYERS]* / [3PLAYERS]a  effectifs · [3SET] sets · [3SCOUT] actions
// Une ligne [3SCOUT] décrit une action : le CODE DataVolley en premier champ,
// puis les champs annexes. Le CODE est la partie interopérable avec le reste de
// l'écosystème DataVolley (openvolley, VolleyStation…).
//   ordre des champs [3SCOUT] :
//   code;set;rally;time;home_p1..p6;vis_p1..p6;point_phase;attack_phase;video_time
// ============================================================================

const NL = '\r\n';

/** Nettoie un champ : pas de ';' ni de retour ligne (séparateurs du format). */
function clean(v) {
  return String(v ?? '').replace(/[;\r\n]/g, ' ').trim();
}

/** « Nom Prénom » → [NOM, Prénom] (le nom de famille est le dernier mot en DV). */
function splitName(name) {
  const parts = clean(name).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [clean(name), ''];
  return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
}

/**
 * Construit le contenu d'un fichier .dvw.
 * @param {Object} data - { match, teams, rosters, sets, actions }
 * @returns {string}
 */
export function buildDvw(data = {}) {
  const { match = {}, teams = {}, rosters = {}, sets = [], actions = [] } = data;
  const out = [];
  out.push('[3DATAVOLLEY]');
  out.push('version=2.1');
  out.push('[3MATCH]');
  out.push(`date=${clean(match.date)}`);
  out.push(`time=${clean(match.time)}`);
  out.push(`season=${clean(match.season)}`);
  out.push(`league=${clean(match.league)}`);
  out.push(`scout=${clean(match.scout)}`);
  out.push('[3TEAMS]');
  out.push(`*;${clean(teams.home || 'Domicile')};0;`);
  out.push(`a;${clean(teams.away || 'Extérieur')};0;`);

  for (const [key, teamId] of [['home', '*'], ['away', 'a']]) {
    const roster = rosters[key] || [];
    out.push(`[3PLAYERS]${teamId}`);
    for (const p of roster) {
      const num = String(Number(p.number) || 0).padStart(2, '0');
      const [last, first] = splitName(p.name);
      out.push([teamId, num, '', '', '', '', '', '', `${teamId}${num}`, last, first].join(';'));
    }
  }

  out.push('[3SET]');
  for (let i = 1; i <= 5; i += 1) {
    const s = (sets || []).find((x) => Number(x.number) === i);
    const sc = (a, b) => (s && a != null && b != null ? `${a}-${b}` : '');
    out.push(
      ['', sc(s?.home8, s?.away8), sc(s?.home16, s?.away16), sc(s?.home21, s?.away21), sc(s?.home, s?.away), clean(s?.duration)].join(';')
    );
  }

  out.push('[3SCOUT]');
  for (const a of actions) out.push(buildScoutLine(a));
  out.push('');
  return out.join(NL);
}

/** Une ligne [3SCOUT] pour une action. */
export function buildScoutLine(a) {
  const home = Array.from({ length: 6 }, (_, i) => clean(a[`home_p${i + 1}`]));
  const vis = Array.from({ length: 6 }, (_, i) => clean(a[`visiting_p${i + 1}`]));
  return [
    clean(a.code),
    clean(a.set_number ?? ''),
    clean(a.rally_number ?? ''),
    clean(a.time ?? a.system_time ?? ''),
    ...home,
    ...vis,
    clean(a.point_phase || ''),
    clean(a.attack_phase || ''),
    clean(a.video_time ?? ''),
  ].join(';');
}

/** Découpe une ligne en champs (le code peut contenir un '.', pas de ';'). */
function splitLine(line) {
  return String(line || '').split(';').map((s) => s.trim());
}

/**
 * Analyse un contenu .dvw et en extrait l'effectif et les actions.
 * Tolérant : les sections absentes sont ignorées.
 * @returns {{ teams:{home:string,away:string}, rosters:{home:Array,away:Array},
 *            actions:Array<{code:string,set_number:number,rally_number:number}> }}
 */
export function parseDvw(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = { teams: { home: '', away: '' }, rosters: { home: [], away: [] }, sets: [], actions: [] };
  let section = '';
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith('[3')) {
      section = line.trim();
      continue;
    }
    if (/^\[3TEAMS\]/i.test(section)) {
      const f = splitLine(line);
      if (f[0] === '*') result.teams.home = f[1] || '';
      else if (f[0] === 'a') result.teams.away = f[1] || '';
    } else if (/^\[3PLAYERS/i.test(section)) {
      const f = splitLine(line);
      const teamId = f[0];
      const side = teamId === 'a' ? 'away' : 'home';
      if (f[1] != null && f[1] !== '') {
        result.rosters[side].push({ number: Number(f[1]) || 0, name: [f[10], f[9]].filter(Boolean).join(' ') });
      }
    } else if (/^\[3SCOUT\]/i.test(section)) {
      const f = splitLine(line);
      if (!f[0]) continue;
      const action = {
        code: f[0],
        set_number: Number(f[1]) || 1,
        rally_number: Number(f[2]) || 0,
        time: f[3] || '',
      };
      // Six en jeu (rotation point par point) : home_p1..p6 puis visiting_p1..p6.
      for (let p = 1; p <= 6; p += 1) {
        action[`home_p${p}`] = f[3 + p] || '';
        action[`visiting_p${p}`] = f[9 + p] || '';
      }
      result.actions.push(action);
    }
  }
  return result;
}
