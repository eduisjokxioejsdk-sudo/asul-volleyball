// ============================================================================
// MOTEUR DE CODES AUTOMATIQUES (COMPOUND CODES) & MACROS CLAVIER (Points 10 & 11)
//
// Dans DataVolley 4 Pro, un scout n'écrit jamais séparément toutes les actions
// en miroir (service + réception, attaque + contre, attaque + défense, passe
// automatique avant une combinaison d'attaque).
// Ce module gère :
//   1. La matrice d'équivalence personnalisable (S↔R, A↔B, A↔D) persistée en localStorage.
//   2. La génération automatique de la passe (E) avant une attaque avec combinaison
//      lorsqu'un passeur est identifié sur le terrain (Auto-Setter E→A).
//   3. Les macros clavier personnalisées (ex. Alt+1 → K1, F7 → V5#).
// ============================================================================

import {
  DV_SERVE_RECEPTION_PAIR,
  DV_RECEPTION_SERVE_PAIR,
  DV_ATTACK_BLOCK_PAIR,
  DV_ATTACK_DIG_PAIR,
  decomposeCode,
  formatCode,
  makeAction,
  oppositeTeamKey,
  teamKeyFromId,
} from './datavolley.js';

const AUTO_CODES_CONFIG_KEY = 'pancake_auto_codes_config_v1';
const KEYBOARD_MACROS_KEY = 'pancake_keyboard_macros_v1';

export const DEFAULT_AUTO_CODES_CONFIG = {
  enabled: true,
  // Règles d'activation des miroirs automatiques
  serveToReception: true,    // S.R ou S avec récepteur → génère S + R avec éval opposée
  receptionToServe: true,    // R seule en début de point → met à jour l'éval du S précédent
  attackToBlock: true,       // A.B ou A/ → génère A + B avec éval opposée
  attackToDig: true,         // A.D → génère A + D avec éval opposée
  autoSetterBeforeAttack: true, // Génère automatiquement *07E[call]# avant *09AX1# si pas de E
  defaultReceptionPlayer: '00', // Joueur par défaut si S= ou S# génère R sans numéro connu
  // Tables de correspondance personnalisables
  serveFromReception: { ...DV_SERVE_RECEPTION_PAIR },       // R eval -> S eval
  receptionFromServe: { ...DV_RECEPTION_SERVE_PAIR },       // S eval -> R eval
  attackFromBlock: { ...DV_ATTACK_BLOCK_PAIR },             // B eval -> A eval
  blockFromAttack: { '#': '=', '+': '-', '!': '+', '-': '+', '/': '#', '=': '/' }, // A eval -> B eval
  attackFromDig: { ...DV_ATTACK_DIG_PAIR },                 // D eval -> A eval
  digFromAttack: { '#': '=', '+': '-', '!': '!', '-': '+', '/': '/', '=': '#' },   // A eval -> D eval
};

export const DEFAULT_KEYBOARD_MACROS = [
  { id: 'm1', shortcut: 'Alt+1', label: 'Appel K1 (Fixation Devant)', snippet: 'EK1#', category: 'Passeur' },
  { id: 'm2', shortcut: 'Alt+2', label: 'Appel K2 (Fixation Derrière)', snippet: 'EK2#', category: 'Passeur' },
  { id: 'm3', shortcut: 'Alt+3', label: 'Appel K7 (Tendue 3m)', snippet: 'EK7#', category: 'Passeur' },
  { id: 'm4', shortcut: 'Alt+4', label: 'Appel KE (Sans Central)', snippet: 'EKE#', category: 'Passeur' },
  { id: 'm5', shortcut: 'Alt+5', label: 'Haute Poste 4 Gagnante', snippet: 'AV5#', category: 'Attaque' },
  { id: 'm6', shortcut: 'Alt+6', label: 'Super Poste 4 (X5)', snippet: 'AX5', category: 'Attaque' },
  { id: 'm7', shortcut: 'Alt+7', label: 'Super Poste 2 (X6)', snippet: 'AX6', category: 'Attaque' },
  { id: 'm8', shortcut: 'Alt+8', label: 'Pipe Centrale (XP)', snippet: 'AXP', category: 'Attaque' },
  { id: 'm9', shortcut: 'Alt+9', label: '1re Temps Devant (X1)', snippet: 'AX1', category: 'Attaque' },
  { id: 'm10', shortcut: 'Alt+0', label: 'Block-Out Gagnant (#B)', snippet: '#B', category: 'Étendu' },
];

/** Lit la configuration des codes automatiques depuis localStorage. */
export function getAutoCodesConfig() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_AUTO_CODES_CONFIG };
    const raw = window.localStorage.getItem(AUTO_CODES_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AUTO_CODES_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_AUTO_CODES_CONFIG,
      ...parsed,
      serveFromReception: { ...DEFAULT_AUTO_CODES_CONFIG.serveFromReception, ...(parsed.serveFromReception || {}) },
      receptionFromServe: { ...DEFAULT_AUTO_CODES_CONFIG.receptionFromServe, ...(parsed.receptionFromServe || {}) },
      attackFromBlock: { ...DEFAULT_AUTO_CODES_CONFIG.attackFromBlock, ...(parsed.attackFromBlock || {}) },
      blockFromAttack: { ...DEFAULT_AUTO_CODES_CONFIG.blockFromAttack, ...(parsed.blockFromAttack || {}) },
      attackFromDig: { ...DEFAULT_AUTO_CODES_CONFIG.attackFromDig, ...(parsed.attackFromDig || {}) },
      digFromAttack: { ...DEFAULT_AUTO_CODES_CONFIG.digFromAttack, ...(parsed.digFromAttack || {}) },
    };
  } catch {
    return { ...DEFAULT_AUTO_CODES_CONFIG };
  }
}

/** Sauvegarde la configuration des codes automatiques dans localStorage. */
export function saveAutoCodesConfig(config) {
  const merged = { ...DEFAULT_AUTO_CODES_CONFIG, ...(config || {}) };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AUTO_CODES_CONFIG_KEY, JSON.stringify(merged));
    }
  } catch { /* ignore */ }
  return merged;
}

/** Réinitialise la configuration des codes automatiques aux valeurs DataVolley 4 officielles. */
export function resetAutoCodesConfig() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(AUTO_CODES_CONFIG_KEY);
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_AUTO_CODES_CONFIG };
}

/** Lit les macros clavier personnalisées. */
export function getKeyboardMacros() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [...DEFAULT_KEYBOARD_MACROS];
    const raw = window.localStorage.getItem(KEYBOARD_MACROS_KEY);
    if (!raw) return [...DEFAULT_KEYBOARD_MACROS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...DEFAULT_KEYBOARD_MACROS];
  } catch {
    return [...DEFAULT_KEYBOARD_MACROS];
  }
}

/** Sauvegarde la liste des macros clavier. */
export function saveKeyboardMacros(macros) {
  const list = Array.isArray(macros) ? macros : DEFAULT_KEYBOARD_MACROS;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(KEYBOARD_MACROS_KEY, JSON.stringify(list));
    }
  } catch { /* ignore */ }
  return list;
}

/**
 * Vérifie si un événement clavier correspond à une macro configurée.
 * @param {KeyboardEvent} e
 * @param {Array} macros
 * @returns {Object|null} macro correspondante
 */
export function matchMacroShortcut(e, macros = null) {
  if (!e || !e.key) return null;
  const list = macros || getKeyboardMacros();
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(keyName)) {
    parts.push(keyName);
  }
  const combo = parts.join('+');
  return list.find((m) => String(m.shortcut || '').toLowerCase() === combo.toLowerCase()) || null;
}

/**
 * Enrichit une liste d'actions nouvellement créées avec les règles de codes
 * automatiques (Compound Codes) :
 *   - Marque `is_auto: 1` sur les actions générées par une formule combinée (`.`).
 *   - Si `autoSetterBeforeAttack` est actif et qu'une attaque `A` est codée sans
 *     qu'une passe `E` de la même équipe ne la précède dans l'échange (sauf sur
 *     attaque de 2e main PP / P2 / PR), insère automatiquement l'action de passe
 *     (`*07E#`) du passeur présent sur le terrain (`homeSetter` / `awaySetter`).
 *   - Si `receptionToServe` est actif et qu'une réception `R` suit un service `S`
 *     dont l'évaluation était neutre ou absente, synchronise l'évaluation du service.
 *
 * @param {Array} existingActions - actions déjà présentes dans le match
 * @param {Array} newActions - nouvelles actions issues de la saisie courante
 * @param {Object} [ctx] - { homeSetter, awaySetter, config, rawInput }
 * @returns {Array} liste finale des nouvelles actions (avec actions auto insérées)
 */
export function applyCompoundAutoCodes(existingActions = [], newActions = [], ctx = {}) {
  // Support appel à 2 arguments : applyCompoundAutoCodes(actions, ctx)
  if (Array.isArray(existingActions) && !Array.isArray(newActions)) {
    ctx = newActions || {};
    newActions = existingActions;
    existingActions = [];
  }
  const cfg = ctx.config || getAutoCodesConfig();
  if (!cfg.enabled) return newActions;

  const result = [];
  const rawInput = String(ctx.rawInput || '');
  const hadCombinedDot = rawInput.includes('.');

  for (let i = 0; i < newActions.length; i += 1) {
    const act = { ...newActions[i] };
    const prevAction = result.length > 0
      ? result[result.length - 1]
      : (existingActions.length > 0 ? existingActions[existingActions.length - 1] : null);

    // 1. Marquer comme auto la 2e action d'une saisie combinée S.R ou A.B / A.D
    if (hadCombinedDot && i > 0 && prevAction) {
      if (
        (prevAction.action === 'S' && act.action === 'R') ||
        (prevAction.action === 'A' && (act.action === 'B' || act.action === 'D'))
      ) {
        act.is_auto = 1;
        // Applique la table d'équivalence personnalisée sur l'action précédente si souhaité
        if (prevAction.action === 'S' && act.action === 'R' && cfg.serveToReception) {
          const customServeEval = cfg.serveFromReception[act.evaluation];
          if (customServeEval && customServeEval !== prevAction.evaluation) {
            prevAction.evaluation = customServeEval;
            prevAction.code = formatCode(prevAction);
          }
        } else if (prevAction.action === 'A' && act.action === 'B' && cfg.attackToBlock) {
          const customAtkEval = cfg.attackFromBlock[act.evaluation];
          if (customAtkEval && customAtkEval !== prevAction.evaluation) {
            prevAction.evaluation = customAtkEval;
            prevAction.code = formatCode(prevAction);
          }
        } else if (prevAction.action === 'A' && act.action === 'D' && cfg.attackToDig) {
          const customAtkEval = cfg.attackFromDig[act.evaluation];
          if (customAtkEval && customAtkEval !== prevAction.evaluation) {
            prevAction.evaluation = customAtkEval;
            prevAction.code = formatCode(prevAction);
          }
        }
      }
    }

    // 2. Synchronisation R -> S quand S et R sont saisis à la suite sans '.'
    if (
      cfg.receptionToServe &&
      act.action === 'R' &&
      prevAction &&
      prevAction.action === 'S' &&
      prevAction.team !== act.team
    ) {
      const derivedEval = cfg.serveFromReception[act.evaluation];
      if (derivedEval && (!prevAction.evaluation || prevAction.evaluation !== derivedEval)) {
        prevAction.evaluation = derivedEval;
        prevAction.code = formatCode(prevAction);
      }
    }

    // 3. Auto-Setter (E -> A) : insère automatiquement la passe du passeur connu
    //    avant une attaque si aucune passe (E) n'a été codée avant l'attaque.
    if (
      cfg.autoSetterBeforeAttack &&
      act.action === 'A' &&
      !['PP', 'P2', 'PR'].includes(String(act.combo || '').toUpperCase())
    ) {
      const hasPrecedingSet = prevAction && prevAction.action === 'E' && prevAction.team === act.team;
      const setterNum = act.team === 'away' ? Number(ctx.awaySetter) : Number(ctx.homeSetter);
      if (!hasPrecedingSet && Number.isInteger(setterNum) && setterNum > 0) {
        const teamKey = teamKeyFromId(act.team);
        const setEval = '#';
        const setCode = formatCode({
          teamKey,
          player_number: setterNum,
          action: 'E',
          start_zone: prevAction && prevAction.team === act.team ? (prevAction.end_zone || '') : '',
          end_zone: act.start_zone || '',
          evaluation: setEval,
        });
        const autoSetAction = makeAction(setCode, act.timecode, {
          set_number: act.set_number ?? null,
          is_auto: 1,
          ...decomposeCode(setCode),
        });
        result.push(autoSetAction);
      }
    }

    result.push(act);
  }

  return result;
}

/**
 * Simule en temps réel ce qu'une saisie clavier va générer (pour le bac à sable
 * interactif de la page de configuration spéciale `CodeAutomationPage.jsx`).
 *
 * @param {string} rawSequence - ex: "a04SM5.06# *09AX14#"
 * @param {Object} [opts] - { homeSetter: 7, awaySetter: 2, config }
 * @returns {Array<{code:string, isAuto:boolean, reason:string, description:string}>}
 */
export function simulateCompoundExpansion(rawSequence, opts = {}) {
  const cfg = opts.config || getAutoCodesConfig();
  const homeSetter = Number(opts.homeSetter) || 7;
  const awaySetter = Number(opts.awaySetter) || 2;
  const clean = String(rawSequence || '').trim().replace(/\s+/g, '');
  if (!clean) return [];

  // Utilise parseSequence de datavolley via makeAction
  const blocks = [];
  // Découpage simple par séquences commençant par * ou a ou chiffre au début
  let i = 0;
  while (i < clean.length) {
    let j = i + 1;
    while (j < clean.length && clean[j] !== '*' && clean[j] !== 'a') {
      j += 1;
    }
    blocks.push(clean.slice(i, j));
    i = j;
  }

  const out = [];
  for (const b of blocks) {
    if (b.includes('.')) {
      const [left, right] = b.split('.');
      const scLeft = decomposeCode(left + '#'); // ajoute éval temporaire pour décomposer
      const teamKey = b.startsWith('a') ? 'a' : '*';
      const oppKey = oppositeTeamKey(teamKey);

      if (scLeft.action === 'S') {
        const m = /^(\d{1,2})([#+\-!/=])$/.exec(right);
        if (m) {
          const recPlayer = Number(m[1]);
          const recEval = m[2];
          const srvEval = cfg.serveFromReception[recEval] || '-';
          const srvCode = formatCode({
            teamKey,
            player_number: scLeft.player_number,
            action: 'S',
            type: scLeft.type,
            start_zone: scLeft.start_zone,
            end_zone: scLeft.end_zone,
            evaluation: srvEval,
          });
          const recCode = formatCode({
            teamKey: oppKey,
            player_number: recPlayer,
            action: 'R',
            start_zone: scLeft.end_zone || '',
            evaluation: recEval,
          });
          out.push({
            code: srvCode,
            isAuto: false,
            reason: `Évaluation '${srvEval}' déduite automatiquement de la réception '${recEval}' (S↔R)`,
          });
          out.push({
            code: recCode,
            isAuto: true,
            reason: `Réception générée automatiquement depuis l'opérateur '.' (joueur n°${String(recPlayer).padStart(2, '0')})`,
          });
          continue;
        }
      }

      if (scLeft.action === 'A') {
        const m = /^(\d{1,2})([Dd]?)([#+\-!/=])$/.exec(right);
        if (m) {
          const defPlayer = Number(m[1]);
          const isDig = Boolean(m[2]);
          const defEval = m[3];
          const atkEval = isDig
            ? (cfg.attackFromDig[defEval] || '-')
            : (cfg.attackFromBlock[defEval] || '/');

          if (cfg.autoSetterBeforeAttack && !['PP', 'P2', 'PR'].includes(scLeft.combo)) {
            const prev = out[out.length - 1];
            const prevSc = prev ? decomposeCode(prev.code) : null;
            if (!prevSc || prevSc.action !== 'E' || prevSc.team !== scLeft.team) {
              const setter = teamKey === 'a' ? awaySetter : homeSetter;
              const setCode = formatCode({
                teamKey,
                player_number: setter,
                action: 'E',
                end_zone: scLeft.start_zone || '',
                evaluation: '#',
              });
              out.push({
                code: setCode,
                isAuto: true,
                reason: `Passe du passeur n°${String(setter).padStart(2, '0')} insérée automatiquement avant l'attaque (Auto-Setter E→A)`,
              });
            }
          }

          const atkCode = formatCode({
            teamKey,
            player_number: scLeft.player_number,
            action: 'A',
            combo: scLeft.combo,
            type: scLeft.type,
            start_zone: scLeft.start_zone,
            end_zone: scLeft.end_zone,
            end_subzone: scLeft.end_subzone,
            evaluation: atkEval,
          });
          const defCode = formatCode({
            teamKey: oppKey,
            player_number: defPlayer,
            action: isDig ? 'D' : 'B',
            evaluation: defEval,
          });
          out.push({
            code: atkCode,
            isAuto: false,
            reason: `Évaluation d'attaque '${atkEval}' déduite du ${isDig ? 'défenseur' : 'contreur'} '${defEval}' (${isDig ? 'A↔D' : 'A↔B'})`,
          });
          out.push({
            code: defCode,
            isAuto: true,
            reason: `${isDig ? 'Défense' : 'Contre'} généré automatiquement depuis l'opérateur '.'`,
          });
          continue;
        }
      }
    }

    const sc = decomposeCode(b);
    const teamKey = b.startsWith('a') ? 'a' : '*';
    if (
      cfg.autoSetterBeforeAttack &&
      sc.action === 'A' &&
      !['PP', 'P2', 'PR'].includes(sc.combo)
    ) {
      const prev = out[out.length - 1];
      const prevSc = prev ? decomposeCode(prev.code) : null;
      if (!prevSc || prevSc.action !== 'E' || prevSc.team !== sc.team) {
        const setter = teamKey === 'a' ? awaySetter : homeSetter;
        const setCode = formatCode({
          teamKey,
          player_number: setter,
          action: 'E',
          end_zone: sc.start_zone || '',
          evaluation: '#',
        });
        out.push({
          code: setCode,
          isAuto: true,
          reason: `Passe du passeur n°${String(setter).padStart(2, '0')} insérée automatiquement avant l'attaque (Auto-Setter E→A)`,
        });
      }
    }

    out.push({
      code: formatCode({ ...sc, teamKey }),
      isAuto: false,
      reason: 'Action saisie directement au clavier',
    });
  }

  return out;
}
