// ============================================================================
// Tableau de match : bandeau de score + vrai terrain de volley (SVG) avec le
// six des deux équipes, les rôles, le serveur et le passeur.
// ============================================================================

import { resolveOnCourt } from '../utils/lineup';
import VolleyCourt from './VolleyCourt';
import { Shield, Trophy, Volleyball, Crosshair } from './icons';

/**
 * @param {Object} props
 * @param {Object} props.state - { currentSet, score, setsWon, server,
 *                                homeLineup, awayLineup, homeSetterPos, awaySetterPos, matchOver }
 * @param {string} [props.team1]
 * @param {string} [props.team2]
 * @param {Object} [props.homeConfig] - { roster, libero, liberoFor }
 * @param {Object} [props.awayConfig]
 * @param {boolean} [props.compact] - version réduite (sous la vidéo)
 * @param {boolean} [props.showScore] - affiche le bandeau de score
 * @param {boolean} [props.showCourt] - affiche le terrain (positions/numéros)
 * @param {string} [props.activeTeam] - 'home' | 'away' : joueur en cours de saisie
 * @param {number} [props.activeNumber] - numéro du joueur en cours de saisie
 */
export default function MatchBoard({
  state,
  team1 = 'Domicile',
  team2 = 'Extérieur',
  homeConfig = null,
  awayConfig = null,
  compact = false,
  showScore = true,
  showCourt = true,
  activeTeam = null,
  activeNumber = null,
}) {
  const server = state?.server || 'team1';
  const score = state?.score || { team1: 0, team2: 0 };
  const setsWon = state?.setsWon || { team1: 0, team2: 0 };
  const setNumber = state?.currentSet ?? 1;
  const matchOver = !!state?.matchOver;

  const home = resolveOnCourt(state?.homeLineup, homeConfig);
  const away = resolveOnCourt(state?.awayLineup, awayConfig);

  return (
    <div className={`mb-board${compact ? ' compact' : ''}`}>
      {showScore && (
        <div className="mb-score">
          <span className="mb-set">SET {setNumber}</span>
          <span className={`mb-team${server === 'team1' ? ' serving' : ''}`}>
            {server === 'team1' ? <Volleyball size={13} /> : null} {team1}
          </span>
          <span className="mb-scoreline">
            {score.team1} <span className="mb-dash">–</span> {score.team2}
          </span>
          <span className={`mb-team${server === 'team2' ? ' serving' : ''}`}>
            {team2} {server === 'team2' ? <Volleyball size={13} /> : null}
          </span>
          <span className="mb-set">SETS {setsWon.team1}–{setsWon.team2}</span>
          {matchOver && (
            <span className="mb-over">
              <Trophy size={12} /> Terminé
            </span>
          )}
        </div>
      )}

      {showCourt && (
        <VolleyCourt
          home={home}
          away={away}
          serving={server}
          homeSetter={state?.homeSetterPos}
          awaySetter={state?.awaySetterPos}
          homeName={team1}
          awayName={team2}
          compact={compact}
          activeTeam={activeTeam}
          activeNumber={activeNumber}
        />
      )}

      {!compact && (
        <div className="mb-legend">
          <span>
            <Volleyball size={11} /> au service
          </span>
          <span>
            <Crosshair size={11} /> passeur
          </span>
          <span>
            <Shield size={11} /> trait pointillé = libéro
          </span>
          <span>PAS passeur · POI pointu · RÉC réceptionneur · CEN central · LIB libéro</span>
        </div>
      )}
    </div>
  );
}
