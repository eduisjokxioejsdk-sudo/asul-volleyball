// ============================================================================
// PUPITRE DE SAISIE « façon DataVolley 4 ».
//
// Le geste de DataVolley 4 : on clique le joueur, puis l'action, la zone et
// l'évaluation. Ce panneau complète le clavier virtuel (DvKeypad) : au lieu de
// taper le numéro, on clique le six réellement sur le terrain, avec les noms.
//
// Il ne modifie jamais le tampon directement : il en propose un nouveau via
// onChange (logique pure dans utils/scoutPad.js), donc les contrôles et les
// timecodes par code restent exactement ceux de la saisie au clavier.
// ============================================================================

import { useMemo } from 'react';
import { Check, Delete, X } from './icons';
import { zoneLabel } from '../utils/datavolley';
import { padInsert, padLineup, padState, PAD_COURT_ROWS, withPlayer } from '../utils/scoutPad';

/** Un joueur du six : numéro, nom, poste et rôle. */
function PlayerButton({ player, team, active, disabled, onPick }) {
  if (!player.number) {
    return (
      <span className="dvp-player empty" title={`${player.position} — poste vide`}>
        {player.position}
      </span>
    );
  }
  const label = [
    player.position,
    `n°${String(player.number).padStart(2, '0')}`,
    player.name || null,
    player.roleShort || null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <button
      type="button"
      className={`dvp-player${active ? ' active' : ''}${player.isLibero ? ' libero' : ''}`}
      title={`${label} — cliquer pour commencer un code`}
      onClick={() => onPick(team, player.number)}
      disabled={disabled}
    >
      <span className="dvp-player-num">{String(player.number).padStart(2, '0')}</span>
      <span className="dvp-player-meta">
        <span className="dvp-player-name">{player.name || '—'}</span>
        <span className="dvp-player-pos">
          {player.position} · {player.roleShort}
        </span>
      </span>
    </button>
  );
}

/** Une équipe : son nom, le ballon de service et ses six postes. */
function TeamPad({ label, side, players, serving, activeTeam, activeNumber, disabled, onPick }) {
  return (
    <div className={`dvp-team ${side}`}>
      <div className="dvp-team-head">
        <span className={`dvp-ball${serving ? '' : ' off'}`} title={serving ? 'Au service' : ''} />
        <span className="dvp-team-name">{label}</span>
        <span className="dvp-team-side">{side === 'away' ? 'ext.' : 'dom.'}</span>
      </div>
      <div className="dvp-court">
        {PAD_COURT_ROWS.flat().map((position) => {
          const player = players.find((p) => p.position === position);
          return (
            <PlayerButton
              key={position}
              player={player || { position, number: null }}
              team={side}
              active={activeTeam === side && Number(activeNumber) === Number(player?.number)}
              disabled={disabled}
              onPick={onPick}
            />
          );
        })}
      </div>
    </div>
  );
}


/**
 * @param {Object} props
 * @param {string} props.buffer - tampon de saisie DataVolley courant
 * @param {string} [props.team1] / [props.team2] - noms des équipes
 * @param {Object} [props.homeLineup] / [props.awayLineup] - six (P1..P6)
 * @param {Object} [props.homeConfig] / [props.awayConfig] - fiches équipe
 * @param {'team1'|'team2'} [props.serving] - équipe au service
 * @param {boolean} [props.lightMode] - saisie sans évaluation
 * @param {boolean} [props.disabled] - match terminé
 * @param {Function} props.onChange - (nouveau tampon) => void
 * @param {Function} [props.onBackspace] / [props.onClear] / [props.onCommit]
 */
export default function DvScoutPad({
  buffer = '',
  team1 = 'Domicile',
  team2 = 'Extérieur',
  homeLineup = null,
  awayLineup = null,
  homeConfig = null,
  awayConfig = null,
  serving = 'team1',
  lightMode = false,
  disabled = false,
  onChange,
  onBackspace,
  onClear,
  onCommit,
}) {
  const state = useMemo(() => padState(buffer, { lightMode }), [buffer, lightMode]);
  const home = useMemo(() => padLineup(homeLineup, homeConfig, 'home'), [homeLineup, homeConfig]);
  const away = useMemo(() => padLineup(awayLineup, awayConfig, 'away'), [awayLineup, awayConfig]);

  const apply = (next) => {
    if (next != null && next !== buffer) onChange?.(next);
  };
  const pick = (team, number) => apply(withPlayer(buffer, team, number));
  const insert = (token) => apply(padInsert(buffer, token));

  const zoneClass = (zone) => {
    if (zone === state.zones.start) return ' start';
    if (zone === state.zones.end) return ' end';
    return '';
  };
  const hasPlayers = [...home, ...away].some((p) => p.number);

  return (
    <div className="dvp">
      <div className="dvp-head">
        <code className="dvp-code" title="Code en cours de saisie">
          {state.text || '·'}
        </code>
        <span className="dvp-expected">{state.expectedLabel}</span>
      </div>

      <div className="dvp-body">
        {!hasPlayers && (
          <p className="dvp-hint">
            Aucun six renseigné : ouvrez <strong>Six &amp; rôles</strong> pour cliquer les joueurs. Le clavier
            virtuel et la frappe au clavier restent disponibles.
          </p>
        )}
        <div className="dvp-teams">
          <TeamPad
            label={team1}
            side="home"
            players={home}
            serving={serving === 'team1'}
            activeTeam={state.activeTeam}
            activeNumber={state.activeNumber}
            disabled={disabled}
            onPick={pick}
          />
          <TeamPad
            label={team2}
            side="away"
            players={away}
            serving={serving === 'team2'}
            activeTeam={state.activeTeam}
            activeNumber={state.activeNumber}
            disabled={disabled}
            onPick={pick}
          />
        </div>

        <div className="dvp-controls">
          <div className="dvp-skills" role="group" aria-label="Actions">
            {state.skills.map((a) => (
              <button
                key={a.code}
                type="button"
                className={`dvp-skill${a.enabled ? ' next' : ''}`}
                title={`${a.code} — ${a.label} : ${a.desc}`}
                onClick={() => insert(a.code)}
                disabled={disabled || !a.enabled}
              >
                {a.code}
                <small>{a.short}</small>
              </button>
            ))}
          </div>

          <div className="dvp-zone-head">
            <span>Zones</span>
            {state.zoneHint && <small>{state.zoneHint}</small>}
          </div>
          <div className="dvp-zones" role="group" aria-label="Zones">
            {state.zoneCells.map((row, i) =>
              row.map((cell) => (
                <button
                  key={`${i}-${cell.zone}`}
                  type="button"
                  className={`dvp-zone${zoneClass(cell.zone)}`}
                  title={zoneLabel(cell.zone)}
                  onClick={() => insert(cell.zone)}
                  disabled={disabled || !cell.enabled}
                >
                  {cell.zone}
                </button>
              ))
            )}
          </div>

          {state.subzonesEnabled && (
            <div className="dvp-subzones" role="group" aria-label="Sous-zones d’arrivée">
              {state.subzones.map((s) => (
                <button
                  key={s.sym}
                  type="button"
                  className="dvp-subzone"
                  title={`Sous-zone ${s.sym}`}
                  onClick={() => insert(s.sym)}
                  disabled={disabled || !s.enabled}
                >
                  {s.sym}
                </button>
              ))}
            </div>
          )}

          {!lightMode && state.evaluations.length > 0 && (
            <div className="dvp-evals" role="group" aria-label="Évaluations">
              {state.evaluations.map((e) => (
                <button
                  key={e.sym}
                  type="button"
                  className="dvp-eval"
                  data-eval={e.sym}
                  title={e.label ? `${e.sym} — ${e.label} : ${e.desc}` : `Évaluation ${e.sym}`}
                  onClick={() => insert(e.sym)}
                  disabled={disabled || !e.enabled}
                >
                  <span className="dvp-eval-sym">{e.sym}</span>
                  {e.label && <span className="dvp-eval-label">{e.label}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="dvp-foot">
        <button
          type="button"
          className="dvp-btn"
          title="Effacer le dernier caractère"
          onClick={onBackspace}
          disabled={disabled || !buffer}
        >
          <Delete size={13} /> Retour
        </button>
        <button
          type="button"
          className="dvp-btn"
          title="Vider le tampon de saisie"
          onClick={onClear}
          disabled={disabled || !buffer}
        >
          <X size={13} /> Vider
        </button>
        <button
          type="button"
          className="dvp-btn commit"
          title="Valider le ou les codes (Entrée)"
          onClick={onCommit}
          disabled={disabled || !buffer}
        >
          <Check size={13} /> Valider
        </button>
      </div>
    </div>
  );
}
