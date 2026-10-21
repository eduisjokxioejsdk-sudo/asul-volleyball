// ============================================================================
// PUPITRE DE SAISIE « façon DataVolley 4 » — logique pure.
//
// L'écran de saisie de DataVolley 4 se pilote à la souris : on clique le joueur
// sur le terrain, puis l'action, la ou les zones et l'évaluation. Ce module
// calcule ce que le pupitre doit proposer à chaque instant, sans React :
//   • le six sur le terrain, dans l'ordre du terrain (filet en haut) ;
//   • les actions encore possibles après [équipe][n° joueur] ;
//   • les évaluations de l'action en cours ;
//   • les zones encore saisissables et leur rôle (départ / arrivée) ;
//   • la fusion d'un clic dans le tampon de saisie existant.
//
// Le tampon reste celui du langage DataVolley (utils/datavolley.js) : le
// pupitre ne fait que produire les mêmes caractères qu'au clavier.
// ============================================================================

import {
  DV_ACTIONS,
  DV_EVALUATIONS,
  DV_EVAL_KEYS,
  DV_SUBZONE_KEYS,
  DV_ZONE_GRID,
  currentInputBlock,
  dvTypeKeys,
  expectedForBuffer,
  tryAppendChar,
  zoneRoleLabel,
} from './datavolley.js';
import { resolveOnCourt, roleShort } from './lineup.js';

/** Postes du terrain, du filet (P4 P3 P2) vers l'arrière (P5 P6 P1). */
export const PAD_COURT_ROWS = [
  ['P4', 'P3', 'P2'],
  ['P5', 'P6', 'P1'],
];

/** Libellés du champ attendu, affichés en tête du pupitre. */
export const PAD_EXPECTED_LABELS = {
  team: 'Équipe / joueur',
  player: 'Numéro de joueur',
  action: 'Action',
  suffix: 'Type, zone ou évaluation',
  reception: 'Réception (formule combinée)',
};

/** Code d'équipe + numéro de joueur, ex. « *07 » (domicile) / « a12 ». */
export function playerToken(team, number) {
  const n = Number(number);
  if (!n || n < 0 || n > 99) return '';
  return `${team === 'away' ? 'a' : '*'}${String(n).padStart(2, '0')}`;
}

/**
 * Six sur le terrain, prêt à afficher : une entrée par poste, dans l'ordre du
 * terrain. Les postes vides restent présents (number = null) pour que le
 * pupitre garde toujours la même géométrie.
 *
 * @param {Object} lineup - { P1..P6 } (positions DataVolley)
 * @param {Object} config - fiche équipe ({ roster, libero, liberoFor })
 * @param {'home'|'away'} team
 * @returns {Array<{position:string,number:number|null,name:string,role:string|null,
 *                  roleShort:string,isLibero:boolean,replaced:number|string|null,code:string}>}
 */
export function padLineup(lineup, config, team) {
  const onCourt = resolveOnCourt(lineup, config);
  return PAD_COURT_ROWS.flat().map((position) => {
    const p = onCourt?.[position];
    if (!p || !p.number) {
      return {
        position,
        number: null,
        name: '',
        role: null,
        roleShort: '',
        isLibero: false,
        replaced: null,
        code: '',
      };
    }
    return {
      position,
      number: p.number,
      name: p.name || '',
      role: p.role || 'universal',
      roleShort: roleShort(p.role),
      isLibero: !!p.isLibero,
      replaced: p.replaced ?? null,
      code: playerToken(team, p.number),
    };
  });
}

/**
 * Zones déjà tapées dans le bloc courant (départ, arrivée, sous-zone).
 * @returns {{start:string|null,end:string|null,sub:string|null}}
 */
export function typedZones(text) {
  const m = /^[a*]?\d{1,2}([SRABDEF])(.*)$/i.exec(String(text || ''));
  if (!m) return { start: null, end: null, sub: null };
  const action = m[1].toUpperCase();
  const types = dvTypeKeys(action).map((t) => String(t).toUpperCase());
  let rest = m[2] || '';
  if (rest && types.includes(rest[0].toUpperCase())) rest = rest.slice(1);
  const zones = [];
  while (zones.length < 2 && /[1-9]/.test(rest[0] || '')) {
    zones.push(rest[0]);
    rest = rest.slice(1);
  }
  const sub =
    zones.length === 2 && DV_SUBZONE_KEYS.includes(String(rest[0] || '').toUpperCase())
      ? rest[0].toUpperCase()
      : null;
  return { start: zones[0] || null, end: zones[1] || null, sub };
}

/**
 * État complet du pupitre pour un tampon donné.
 *
 * @param {string} buffer
 * @param {{lightMode?:boolean}} [opts] - lightMode : saisie sans évaluation
 * @returns {Object} état prêt à afficher (aucun calcul dans le composant)
 */
export function padState(buffer, opts = {}) {
  const raw = String(buffer || '');
  const { text } = currentInputBlock(raw);
  const exp = expectedForBuffer(raw);
  const lightMode = !!opts.lightMode;

  const first = text[0] || '';
  const activeTeam = first === 'a' ? 'away' : first === '*' || /^\d/.test(first) ? 'home' : null;
  const playerMatch = /^[a*]?(\d{1,2})/.exec(text);
  const activeNumber = playerMatch ? Number(playerMatch[1]) : null;
  const actionMatch = /^[a*]?\d{1,2}([SRABDEF])/i.exec(text);
  const action = actionMatch ? actionMatch[1].toUpperCase() : null;
  const zones = typedZones(text);

  const skills = DV_ACTIONS.map((a) => ({
    ...a,
    enabled: exp.type === 'action' && (exp.allowed || []).includes(a.code),
  }));

  // En mode « sans évaluation » (consultation), le pupitre n'affiche pas les
  // évaluations : le match se découpe au service.
  const evaluations = lightMode
    ? []
    : DV_EVAL_KEYS.map((sym) => {
        const info = action ? (DV_EVALUATIONS[action] || []).find((e) => e.sym === sym) : null;
        return {
          sym,
          label: info?.label || '',
          desc: info?.desc || '',
          enabled: exp.type === 'suffix' && (exp.allowed || []).includes(sym),
        };
      });

  const zonesEnabled = exp.type === 'suffix';
  const zoneCells = DV_ZONE_GRID.map((row) =>
    row.map((zone) => ({
      zone,
      enabled: zonesEnabled && (exp.allowed || []).includes(zone),
    }))
  );

  const subzonesEnabled =
    zonesEnabled && (exp.allowed || []).some((c) => DV_SUBZONE_KEYS.includes(c));
  const subzones = DV_SUBZONE_KEYS.map((sym) => ({
    sym,
    enabled: subzonesEnabled,
  }));

  // Rôle de la zone à saisir (départ / arrivée) — utile pour les attaques.
  let zoneHint = '';
  if (action && zonesEnabled) {
    zoneHint = zones.start ? zoneRoleLabel(action, 1) : zoneRoleLabel(action, 0);
    if (zones.end) zoneHint = 'sous-zone d’arrivée (facultative)';
  }

  return {
    text,
    expected: exp.type,
    expectedLabel: PAD_EXPECTED_LABELS[exp.type] || 'Saisie',
    activeTeam,
    activeNumber,
    action,
    zones,
    zoneHint,
    skills,
    evaluations,
    zoneCells,
    subzones,
    subzonesEnabled,
    canPickPlayer: !lightMode || exp.type !== 'suffix',
  };
}

/**
 * Clic sur un joueur : remplace un code en cours de frappe (équipe / numéro)
 * ou démarre un nouveau code après une action évaluée. C'est le geste de
 * DataVolley : on choisit d'abord le joueur, puis l'action.
 */
export function withPlayer(buffer, team, number) {
  const raw = String(buffer || '');
  const token = playerToken(team, number);
  if (!token) return raw;
  const { text, start } = currentInputBlock(raw);
  // Un code déjà évalué est terminé : le clic ouvre le code suivant.
  const finished = /[#+!=\/-]$/.test(text);
  if (!text || !finished) return `${raw.slice(0, start)}${token}`;
  return `${raw}${token}`;
}

/**
 * Insère un jeton (action, évaluation, zone, sous-zone) dans le tampon.
 * @returns {string|null} nouveau tampon, ou null si le jeton n'est pas attendu
 */
export function padInsert(buffer, token) {
  const t = String(token || '');
  if (/^[a*]\d{2}$/.test(t)) {
    return withPlayer(buffer, t[0] === 'a' ? 'away' : 'home', Number(t.slice(1)));
  }
  const next = tryAppendChar(buffer, t);
  return next == null ? null : next;
}
