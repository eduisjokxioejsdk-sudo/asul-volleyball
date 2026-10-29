// ============================================================================
// Export / import DataVolley .dvw (format texte officiel et interopérable).
// Sections délimitées par [3XXX], champs séparés par ';'.
//   [3DATAVOLLEY] version · [3MATCH] infos · [3MORE] métadonnées de salle/arbitres
//   [3TEAMS] équipes · [3PLAYERS]* / [3PLAYERS]a effectifs · [3SET] sets
//   [3ATTACKCOMBINATION] combinaisons · [3SETTERCALL] appels du passeur
//   [3SCOUT] actions codées
// Une ligne [3SCOUT] décrit une action : le CODE DataVolley en premier champ,
// puis les champs annexes (rotations P1-P6, temps, phases, timecodes vidéo).
// Compatible 100% avec DataVolley 4 Pro, Click&Scout, VolleyStation et openvolley.
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

/** Combinaisons d'attaque par défaut (DataVolley standard). */
export const DEFAULT_ATTACK_COMBINATIONS = [
  ['X1', '3', 'F', 'Q', 'Fixe avant centrale'],
  ['X2', '4', 'F', 'T', 'Haute poste 4'],
  ['X5', '2', 'B', 'Q', 'Fixe arriere'],
  ['V5', '4', 'B', 'M', 'Attaque pipe poste 8'],
  ['V6', '4', 'B', 'M', 'Attaque pipe poste 6'],
  ['X7', '2', 'B', 'T', 'Haute poste 2'],
  ['X6', '1', 'B', 'T', 'Arriere poste 1'],
  ['X8', '3', 'F', 'Q', 'Decalee poste 3'],
  ['PP', '3', 'F', 'Q', 'Passe directe feinte'],
];

/** Appels du passeur par défaut (DataVolley standard). */
export const DEFAULT_SETTER_CALLS = [
  ['K1', '3', 'Fixe avant centrale'],
  ['K2', '3', 'Fixe arriere'],
  ['K7', '4', 'Haute 4 ecart'],
  ['KE', '2', 'Passe arriere 2'],
];

/**
 * Construit le contenu d'un fichier .dvw.
 * @param {Object} data - { match, teams, rosters, sets, actions, combinations, setterCalls }
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

  out.push('[3MORE]');
  out.push(
    [
      clean(match.referees || ''),
      clean(match.city || ''),
      clean(match.hall || ''),
      clean(match.arena || ''),
      clean(match.scout || ''),
    ].join(';') + ';'
  );

  out.push('[3TEAMS]');
  out.push(`*;${clean(teams.home || 'Domicile')};0;`);
  out.push(`a;${clean(teams.away || 'Extérieur')};0;`);

  out.push('[3SET]');
  for (let i = 1; i <= 5; i += 1) {
    const s = (sets || []).find((x) => Number(x.number) === i);
    const sc = (a, b) => (s && a != null && b != null ? `${a}-${b}` : '');
    out.push(
      ['', sc(s?.home8, s?.away8), sc(s?.home16, s?.away16), sc(s?.home21, s?.away21), sc(s?.home, s?.away), clean(s?.duration)].join(';')
    );
  }

  for (const [key, teamId] of [['home', '*'], ['away', 'a']]) {
    const roster = rosters[key] || [];
    out.push(`[3PLAYERS]${teamId}`);
    for (const p of roster) {
      const num = String(Number(p.number) || 0).padStart(2, '0');
      const [last, first] = splitName(p.name);
      out.push([teamId, num, '', '', '', '', '', '', `${teamId}${num}`, last, first].join(';'));
    }
  }

  out.push('[3ATTACKCOMBINATION]');
  const combos = data.combinations || DEFAULT_ATTACK_COMBINATIONS;
  for (const c of combos) {
    out.push(Array.isArray(c) ? c.map(clean).join(';') + ';;' : clean(c));
  }

  out.push('[3SETTERCALL]');
  const calls = data.setterCalls || DEFAULT_SETTER_CALLS;
  for (const c of calls) {
    out.push(Array.isArray(c) ? c.map(clean).join(';') + ';;' : clean(c));
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
 * Analyse un contenu .dvw et en extrait l'effectif, les combinaisons, les sets et les actions.
 * Tolérant : les sections absentes sont ignorées et le format officiel DataVolley 4
 * est supporté conjointement avec le format interne compact.
 * @returns {{ teams:{home:string,away:string}, rosters:{home:Array,away:Array},
 *            sets:Array, actions:Array<{code:string,set_number:number,rally_number:number}>,
 *            combinations:Array, setterCalls:Array }}
 */
export function parseDvw(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = {
    teams: { home: '', away: '' },
    rosters: { home: [], away: [] },
    sets: [],
    actions: [],
    combinations: [],
    setterCalls: [],
  };
  let section = '';
  let currentSet = 1;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (line.startsWith('[3')) {
      section = line.trim().toUpperCase();
      continue;
    }

    if (section === '[3TEAMS]') {
      const f = splitLine(line);
      if (f[0] === '*' || f[0] === '1') {
        result.teams.home = f[1] || result.teams.home;
      } else if (f[0] === 'a' || f[0] === '2') {
        result.teams.away = f[1] || result.teams.away;
      }
    } else if (section.startsWith('[3PLAYERS')) {
      const f = splitLine(line);
      const isAway = section.includes('-V') || section.endsWith('A') || f[0] === 'a' || f[0] === '2';
      const side = isAway ? 'away' : 'home';
      const rawNum0 = parseInt(f[0], 10);
      const rawNum1 = parseInt(f[1], 10);
      const number = (!Number.isNaN(rawNum1) && rawNum1 > 0) ? rawNum1 : (!Number.isNaN(rawNum0) && rawNum0 > 0 ? rawNum0 : NaN);

      let name = [f[10], f[9]].filter(Boolean).join(' ');
      if (!name) name = [f[5], f[4]].filter(Boolean).join(' ');
      if (!name && f[1] && Number.isNaN(rawNum1)) name = f[1];

      if (Number.isInteger(number) && number > 0) {
        result.rosters[side].push({ number, name });
      }
    } else if (section === '[3ATTACKCOMBINATION]') {
      const f = splitLine(line);
      if (f[0]) {
        result.combinations.push({
          code: f[0],
          start_zone: f[1] || '',
          target: f[2] || '',
          tempo: f[3] || '',
          description: f[4] || '',
        });
      }
    } else if (section === '[3SETTERCALL]') {
      const f = splitLine(line);
      if (f[0]) {
        result.setterCalls.push({
          code: f[0],
          zone: f[1] || '',
          description: f[2] || '',
        });
      }
    } else if (section === '[3SCOUT]') {
      const f = splitLine(line);
      if (!f[0]) continue;

      // Détecte si la ligne est un code officiel DataVolley 4 étendu (22+ champs ou phase en champ 1)
      const isOfficialDv = f[1] === 'p' || f[1] === 's' || (f.length >= 22 && !/^\d+$/.test(f[1]));

      let setNumber = currentSet;
      let rallyNumber = 0;
      let time = '';
      const action = { code: f[0] };

      if (isOfficialDv) {
        setNumber = Number(f[7]) || currentSet;
        currentSet = setNumber;
        time = f[6] || '';
        const homeScore = Number(f[22]) || 0;
        const awayScore = Number(f[23]) || 0;
        rallyNumber = homeScore + awayScore;
        action.point_phase = f[1] || '';
        action.attack_phase = f[2] || '';
        // Six en jeu dans DV4 : home à l'indice 10 (f[9 + p]), vis à l'indice 16 (f[15 + p])
        for (let p = 1; p <= 6; p += 1) {
          action[`home_p${p}`] = f[9 + p] || '';
          action[`visiting_p${p}`] = f[15 + p] || '';
        }
      } else {
        setNumber = Number(f[1]) || currentSet;
        currentSet = setNumber;
        rallyNumber = Number(f[2]) || 0;
        time = f[3] || '';
        // Format interne compact : home à l'indice 4 (f[3 + p]), vis à l'indice 10 (f[9 + p])
        for (let p = 1; p <= 6; p += 1) {
          action[`home_p${p}`] = f[3 + p] || '';
          action[`visiting_p${p}`] = f[9 + p] || '';
        }
        action.point_phase = f[16] || '';
        action.attack_phase = f[17] || '';
        action.video_time = f[18] || '';
      }

      action.set_number = setNumber;
      action.rally_number = rallyNumber;
      action.time = time;
      result.actions.push(action);
    }
  }
  return result;
}
