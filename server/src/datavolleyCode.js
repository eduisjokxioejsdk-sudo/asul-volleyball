// ============================================================================
// Lecture des codes DataVolley côté serveur (miroir de client/src/utils/datavolley.js).
//
//   [équipe][joueur 1-2 chiffres][action][type?][zones?][évaluation]
//   a04SM.06#  -> service a04SM (éval déduite) + réception *06R#
//
// Les actions S R A B D E F sont celles du standard DataVolley :
//   F = ballon libre (et NON une faute). Une faute se code avec '='.
// ============================================================================

const DV_ACTION_KEYS = ['S', 'R', 'A', 'B', 'D', 'E', 'F'];
const DV_EVAL_KEYS = ['#', '+', '!', '-', '/', '='];
const DV_SUBZONE_KEYS = ['A', 'B', 'C', 'D'];
const DV_COMBINED_SEPARATOR = '.';
const DV_TEAM_KEYS = ['*', 'a'];

const DV_TYPES = {
  S: ['H', 'Q', 'M', 'T'],
  A: ['H', 'P', 'T'],
};
const DV_TYPE_ALIASES = { S: { F: 'Q', S: 'M' } };

// Combinaisons d'attaque (2 caractères) — miroir du client (datavolley.js).
// code -> [position de l'attaquant (= zone de départ), type de geste].
const DV_ATTACK_COMBOS = {
  X1: [3, 'Q'], X2: [2, 'Q'], X3: [3, 'M'], XB: [8, 'M'], XC: [3, 'Q'], XD: [3, 'Q'],
  XF: [2, 'N'], XG: [3, 'Q'], XL: [2, 'Q'], XM: [3, 'Q'], XO: [2, 'Q'], XP: [8, 'M'],
  XQ: [2, 'M'], XR: [8, 'M'], XS: [2, 'Q'], XT: [3, 'M'], XZ: [4, 'Q'], X0: [7, 'T'],
  C0: [7, 'U'], C5: [4, 'U'], C6: [2, 'U'], C8: [9, 'U'], CB: [2, 'N'], CD: [2, 'N'],
  CF: [2, 'N'], II: [4, 'M'], JJ: [2, 'M'], PP: [3, 'O'], P2: [3, 'O'], PR: [3, 'O'],
  VB: [8, 'H'], VJ: [4, 'H'], VP: [8, 'H'], VR: [8, 'H'], V0: [7, 'H'], V3: [3, 'O'],
  V4: [2, 'H'], V5: [4, 'H'], V6: [2, 'H'], V8: [9, 'H'],
};

// Appels passeur (2 caractères, après une passe E) — miroir du client.
const DV_SETTER_CALLS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'KM', 'KP'];

// Correspondance officielle service ⇄ réception.
const SERVE_RECEPTION_PAIR = { '=': '#', '/': '+', '-': '+', '!': '!', '+': '-', '#': '-' };

function isDigitChar(c) {
  return typeof c === 'string' && c >= '0' && c <= '9';
}

function resolveTypeAlias(action, char) {
  const up = typeof char === 'string' ? char.toUpperCase() : '';
  if (!up) return null;
  if ((DV_TYPES[action] || []).includes(up)) return up;
  return (DV_TYPE_ALIASES[action] || {})[up] || null;
}

function teamIdFromKey(key) {
  return key === 'a' ? 'away' : 'home';
}

/**
 * Lit un code à partir de `start`, sans lever d'erreur.
 * @returns {{end:number, team:string|null, teamKey:string, player_number:number,
 *            action:string, type:string, start_zone:string, end_zone:string,
 *            end_subzone:string, evaluation:string, complete:boolean}}
 */
function scanCode(str, start) {
  const s = String(str || '');
  let i = start || 0;
  const out = {
    start: i,
    end: i,
    team: null,
    teamKey: '',
    player_number: 0,
    action: '',
    type: '',
    combo: '',
    call: '',
    start_zone: '',
    end_zone: '',
    end_subzone: '',
    evaluation: '',
    complete: false,
    issues: [],
  };

  const first = s[i];
  if (first === '*' || first === 'a') {
    out.teamKey = first;
    out.team = teamIdFromKey(first);
    i += 1;
  } else if (isDigitChar(first)) {
    // Clé d'équipe omise : un code commençant par un chiffre est « domicile ».
    out.teamKey = '*';
    out.team = 'home';
  } else {
    out.end = i + 1;
    return out;
  }

  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  out.player_number = digits ? parseInt(digits, 10) : 0;

  const action = s[i];
  if (!DV_ACTION_KEYS.includes(action)) {
    out.end = i + 1;
    return out;
  }
  out.action = action;
  i += 1;

  // Combinaison d'attaque (2 caractères) : *09AX1# = attaque « A Quick ».
  // Appel passeur après une passe : *07EK1#.
  if (action === 'A') {
    const two = s.slice(i, i + 2).toUpperCase();
    if (DV_ATTACK_COMBOS[two]) {
      out.combo = two;
      i += 2;
    }
  } else if (action === 'E') {
    const two = s.slice(i, i + 2).toUpperCase();
    if (DV_SETTER_CALLS.includes(two)) {
      out.call = two;
      i += 2;
    }
  }

  if (!out.combo && !out.call) {
    const ty = resolveTypeAlias(action, s[i]);
    if (ty) {
      out.type = ty;
      i += 1;
    } else if (s[i] && !DV_TEAM_KEYS.includes(s[i]) && /[A-Za-z]/.test(s[i]) && !DV_EVAL_KEYS.includes(s[i])) {
      // Lettre non-type : consommée mais signalée (aligné sur le client).
      out.issues.push('bad_type');
      i += 1;
    }
  }

  const zones = [];
  while (i < s.length && zones.length < 2 && /[1-9]/.test(s[i])) {
    zones.push(s[i]);
    i += 1;
  }
  if (zones.length === 2 && i < s.length && DV_SUBZONE_KEYS.includes(s[i].toUpperCase())) {
    out.end_subzone = s[i].toUpperCase();
    i += 1;
  }
  if (out.combo) {
    out.start_zone = String(DV_ATTACK_COMBOS[out.combo][0]);
    if (zones.length === 1) out.end_zone = zones[0];
    else if (zones.length === 2) {
      out.start_zone = zones[0];
      out.end_zone = zones[1];
    }
  } else if (action === 'S' && zones.length === 1) {
    out.start_zone = '1';
    out.end_zone = zones[0];
  } else if (zones.length === 2) {
    out.start_zone = zones[0];
    out.end_zone = zones[1];
  } else if (zones.length === 1) {
    out.start_zone = zones[0];
  }

  const ev = s[i];
  if (ev && DV_EVAL_KEYS.includes(ev)) {
    out.evaluation = ev;
    i += 1;
    out.complete = true;
  }
  out.end = i;
  return out;
}

/** Décomposition tolérante : renvoie les champs exploitables pour la base. */
function decomposeCode(code) {
  const sc = scanCode(code, 0);
  return {
    team: sc.team,
    player_number: sc.player_number,
    action: sc.action,
    type: sc.type,
    combo: sc.combo,
    call: sc.call,
    start_zone: sc.start_zone,
    end_zone: sc.end_zone,
    end_subzone: sc.end_subzone,
    evaluation: sc.evaluation,
  };
}

/** Code complet (formule compacte conforme) ? */
function isValidCode(code) {
  if (typeof code !== 'string' || code.length === 0 || code.length > 40) return false;
  const sc = scanCode(code, 0);
  return sc.complete && sc.end >= code.length && (sc.issues || []).length === 0;
}

/** Saisie en cours acceptable au stockage (préfixe valide) ? */
function isDraftCode(code) {
  if (typeof code !== 'string' || code.length === 0 || code.length > 40) return false;
  const sc = scanCode(code, 0);
  return !!sc.team && sc.end >= code.length && !(sc.issues || []).includes('bad_type');
}

function formatCode(fields) {
  const f = fields || {};
  const num = String(f.player_number || 0).padStart(2, '0');
  const parts = [f.teamKey || (f.team === 'away' ? 'a' : '*'), num, f.action || ''];
  if (f.combo) {
    parts.push(String(f.combo).toUpperCase());
    if (f.end_zone) parts.push(f.end_zone);
  } else if (f.call) {
    parts.push(String(f.call).toUpperCase());
    if (f.start_zone) parts.push(f.start_zone);
    if (f.end_zone) parts.push(f.end_zone);
  } else {
    if (f.type) parts.push(f.type);
    if (f.action === 'S') {
      if (f.end_zone) parts.push(f.end_zone);
    } else {
      if (f.start_zone) parts.push(f.start_zone);
      if (f.end_zone) parts.push(f.end_zone);
    }
  }
  if (f.end_subzone) parts.push(f.end_subzone);
  parts.push(f.evaluation || '');
  return parts.join('');
}

function reverseTeamKey(key) {
  return key === 'a' ? '*' : 'a';
}

/** Partie « réception » d'une formule combinée : [joueur][évaluation]. */
function scanReceptionPart(s, start) {
  let i = start;
  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  if (!digits) return null;
  const ev = s[i];
  if (!ev || !DV_EVAL_KEYS.includes(ev)) return null;
  return { player_number: parseInt(digits, 10), evaluation: ev, end: i + 1 };
}

// Formule combinée attaque → contre (défaut) ou défense (D). Miroir du client.
const ATTACK_BLOCK_PAIR = { '#': '/', '+': '!', '!': '-', '-': '-', '/': '+', '=': '#' };
const ATTACK_DIG_PAIR = { '#': '-', '+': '-', '!': '/', '-': '/', '/': '+', '=': '#' };
function deriveAttackEvaluation(ev, kind) {
  const map = kind === 'dig' ? ATTACK_DIG_PAIR : ATTACK_BLOCK_PAIR;
  return map[ev] || '';
}

/** Partie « contre / défense » : [joueur][D?][évaluation]. Sans D = contre. */
function scanCombinedDefensePart(s, start) {
  let i = start;
  let digits = '';
  while (i < s.length && digits.length < 2 && isDigitChar(s[i])) {
    digits += s[i];
    i += 1;
  }
  if (!digits) return null;
  let kind = 'block';
  if (s[i] === 'D' || s[i] === 'd') {
    kind = 'dig';
    i += 1;
  }
  const ev = s[i];
  if (!ev || !DV_EVAL_KEYS.includes(ev)) return null;
  return { player_number: parseInt(digits, 10), kind, evaluation: ev, end: i + 1 };
}

/**
 * Développe une saisie libre en codes d'actions (gère la formule combinée
 * `a04SM.06#`). Les blocs incomplets sont renvoyés tels quels.
 * @returns {string[]}
 */
function expandSequence(str) {
  const s = String(str || '');
  const codes = [];
  let i = 0;
  while (i < s.length) {
    const sc = scanCode(s, i);
    if (!sc.team) {
      codes.push(s[i]);
      i += 1;
      continue;
    }
    if (s[sc.end] === DV_COMBINED_SEPARATOR && sc.action === 'S' && !sc.evaluation) {
      const rc = scanReceptionPart(s, sc.end + 1);
      if (rc) {
        codes.push(
          formatCode({
            teamKey: sc.teamKey,
            player_number: sc.player_number,
            action: 'S',
            type: sc.type,
            start_zone: sc.start_zone,
            end_zone: sc.end_zone,
            evaluation: SERVE_RECEPTION_PAIR[rc.evaluation] || '',
          })
        );
        codes.push(
          `${reverseTeamKey(sc.teamKey)}${String(rc.player_number).padStart(2, '0')}R${rc.evaluation}`
        );
        i = rc.end;
        continue;
      }
      codes.push(s.slice(i, sc.end + 1));
      i = sc.end + 1;
      continue;
    }
    if (s[sc.end] === DV_COMBINED_SEPARATOR && sc.action === 'A' && !sc.evaluation) {
      const rc = scanCombinedDefensePart(s, sc.end + 1);
      if (rc) {
        codes.push(
          formatCode({
            teamKey: sc.teamKey,
            player_number: sc.player_number,
            action: 'A',
            combo: sc.combo,
            type: sc.type,
            start_zone: sc.start_zone,
            end_zone: sc.end_zone,
            end_subzone: sc.end_subzone,
            evaluation: deriveAttackEvaluation(rc.evaluation, rc.kind),
          })
        );
        const defAction = rc.kind === 'dig' ? 'D' : 'B';
        codes.push(
          `${reverseTeamKey(sc.teamKey)}${String(rc.player_number).padStart(2, '0')}${defAction}${rc.evaluation}`
        );
        i = rc.end;
        continue;
      }
      codes.push(s.slice(i, sc.end + 1));
      i = sc.end + 1;
      continue;
    }
    codes.push(s.slice(i, sc.end > i ? sc.end : i + 1));
    i = sc.end > i ? sc.end : i + 1;
  }
  return codes.filter(Boolean);
}

module.exports = {
  DV_ACTION_KEYS,
  DV_EVAL_KEYS,
  DV_TYPES,
  DV_TYPE_ALIASES,
  DV_TEAM_KEYS,
  DV_COMBINED_SEPARATOR,
  SERVE_RECEPTION_PAIR,
  scanCode,
  decomposeCode,
  isValidCode,
  isDraftCode,
  formatCode,
  expandSequence,
};

