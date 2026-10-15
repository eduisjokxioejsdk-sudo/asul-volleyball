// ============================================================================
// Générateur de match de démonstration (actions aléatoires) pour visualiser
// les onglets de consultation / stats / distribution / bilan une fois remplis.
// Les codes produits respectent le standard DataVolley 4 :
//   - pas de faute « F » : les fautes sont codées avec l'évaluation '='
//   - types de service (H/M/Q/T) et d'attaque (H/P/T)
//   - zones officielles 1 → 9
// Produit un set 1 terminé (25-20) et un set 2 en cours (12-8).
// ============================================================================

import { makeUid, decomposeCode, formatCode } from './datavolley.js';

// Zones officielles : 4 3 2 / 7 8 9 / 5 6 1 (filet en haut).
const ATTACK_ZONES = ['4', '3', '2', '7', '8', '9', '5', '6', '1'];
const SERVE_ZONES = ['1', '5', '6', '7', '9'];
const SERVE_TYPES = ['H', 'Q', 'M', 'T'];
const ATTACK_TYPES = ['H', 'P', 'T'];
const HOME_PLAYERS = [1, 4, 5, 7, 9, 11];
const AWAY_PLAYERS = [2, 3, 6, 8, 10, 12];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Évaluations de réception toujours non terminales pour garder une séquence
// S → R → A propre et alimenter la distribution (+ / 0 / -).
function recepEval() {
  return pick(['#', '+', '!', '-']);
}

function buildAction(team, player, code, timecode) {
  return {
    uid: makeUid(),
    code,
    timecode,
    system_time: null,
    set_number: null,
    note: null,
    ...decomposeCode(code),
  };
}

export function generateDemoActions() {
  const actions = [];
  let t = 0;

  const push = (team, player, fields) => {
    const code = formatCode({ teamKey: team, player_number: player, ...fields });
    actions.push(buildAction(team, player, code, t));
    t += 4;
  };

  const serveFields = (evaluation) => {
    const withZone = Math.random() < 0.7;
    return {
      action: 'S',
      type: pick(SERVE_TYPES),
      evaluation,
      start_zone: withZone ? '1' : '',
      end_zone: withZone ? pick(SERVE_ZONES) : '',
    };
  };

  const attackFields = (evaluation) => ({
    action: 'A',
    type: pick(ATTACK_TYPES),
    evaluation,
    start_zone: Math.random() < 0.85 ? pick(ATTACK_ZONES) : '',
    end_zone: '',
  });

  // Set 1 : 25-20 (le dernier point clôt le set). Set 2 : 12-8 (en cours).
  const winners1 = shuffle([...Array(24).fill('*'), ...Array(20).fill('a')]).concat('*');
  const winners2 = shuffle([...Array(12).fill('*'), ...Array(8).fill('a')]);
  const points = winners1.concat(winners2);

  let server = '*';

  points.forEach((winner) => {
    const receiver = server === '*' ? 'a' : '*';
    const sp = pick(server === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
    const rp = pick(receiver === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
    const ap = pick(receiver === '*' ? HOME_PLAYERS : AWAY_PLAYERS);

    if (winner === server) {
      // L'équipe au service gagne le point : elle conserve le service.
      if (Math.random() < 0.18) {
        push(server, sp, serveFields('#')); // ace
        return;
      }
      push(server, sp, serveFields(pick(['+', '!', '-', '/'])));
      push(receiver, rp, { action: 'R', evaluation: recepEval() });

      // Balle envoyée sans attaque (ballon libre) puis défense du serveur.
      if (Math.random() < 0.18) {
        push(receiver, ap, { action: 'F', evaluation: pick(['-', '!', '+']) });
        const dp = pick(server === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
        push(server, dp, { action: 'D', evaluation: pick(['#', '+', '!']) });
        const setter = pick(server === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
        push(server, setter, { action: 'E', evaluation: pick(['#', '+']) });
        push(server, ap, attackFields('#'));
        return;
      }

      const setter = pick(receiver === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
      push(receiver, setter, { action: 'E', evaluation: pick(['#', '+', '!']) });

      if (Math.random() < 0.5) {
        // Attaque contrée : le contre du serveur décide le point.
        push(receiver, ap, attackFields('/'));
        const bp = pick(server === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
        push(server, bp, { action: 'B', evaluation: '#' });
      } else {
        // Attaque défendue puis contre-attaque gagnante du serveur.
        push(receiver, ap, attackFields(pick(['-', '!'])));
        const dp = pick(server === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
        push(server, dp, { action: 'D', evaluation: pick(['#', '+', '!']) });
        push(server, ap, attackFields('#'));
      }
      return;
    }

    // Side-out : l'équipe en réception gagne le point et prend le service.
    if (Math.random() < 0.14) {
      push(server, sp, serveFields('=')); // faute de service
    } else {
      push(server, sp, serveFields(pick(['+', '!', '-', '/'])));
      push(receiver, rp, { action: 'R', evaluation: recepEval() });
      const setter = pick(receiver === '*' ? HOME_PLAYERS : AWAY_PLAYERS);
      push(receiver, setter, { action: 'E', evaluation: pick(['#', '+', '!']) });
      push(receiver, ap, attackFields('#'));
    }
    server = receiver;
  });

  return actions.map((a, i) => ({ ...a, action_index: i }));
}

