import { computeSetScores } from '../utils/volleyball';

/**
 * ScoreDisplay — Affiche le score set par set en fonction des gagnants annotés.
 *
 * - Calcule les sets gagnés (25 points avec 2 points d'écart minimum).
 * - Remet le score à 0 pour le set suivant une fois un set remporté.
 * - Affiche l'historique des sets et le score du set en cours.
 *
 * @param {Array}  points  - Tous les points annotés (avec `winner`).
 * @param {string} team1   - Nom de l'équipe 1.
 * @param {string} team2   - Nom de l'équipe 2.
 */
function ScoreDisplay({ points, team1, team2 }) {
  const { sets, team1Score, team2Score, currentSet } = computeSetScores(points);

  const team1SetsWon = sets.filter((s) => s.winner === 'team1').length;
  const team2SetsWon = sets.filter((s) => s.winner === 'team2').length;
  const hasCurrentSet = team1Score > 0 || team2Score > 0;
  const matchOver = team1SetsWon >= 3 || team2SetsWon >= 3;
  const matchWinner = team1SetsWon >= 3 ? team1 : team2SetsWon >= 3 ? team2 : null;

  return (
    <div className="score-display-card">
      {/* Header: team names + sets won */}
      <div className="score-display-header">
        <span className="score-display-team">{team1}</span>
        <span className={`score-display-badge team1 ${team1SetsWon > 0 ? 'active' : ''}`}>{team1SetsWon}</span>
        <span className="score-display-vs">VS</span>
        <span className={`score-display-badge team2 ${team2SetsWon > 0 ? 'active' : ''}`}>{team2SetsWon}</span>
        <span className="score-display-team">{team2}</span>
      </div>

      {/* Match over indicator */}
      {matchOver && (
        <div className="score-match-over">
          🏆 Match terminé — {matchWinner} gagne la rencontre
        </div>
      )}

      {/* Completed sets history */}
      {sets.length > 0 && (
        <div className="score-sets-history">
          {sets.map((set) => (
            <div
              key={set.setNumber}
              className={`score-set-item ${set.winner === 'team1' ? 'score-set-team1' : 'score-set-team2'}`}
            >
              <span className="score-set-label">Set {set.setNumber}</span>
              <span className="score-set-score">{set.team1} − {set.team2}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current set score */}
      <div className="score-current-set">
        <div className="score-current-label">
          Set {currentSet}{hasCurrentSet ? ' (en cours)' : ''}
        </div>
        <div className="score-current-scores">
          <span className={`score-current-number ${team1Score > team2Score ? 'score-leading' : ''}`}>{team1Score}</span>
          <span className="score-current-separator"> − </span>
          <span className={`score-current-number ${team2Score > team1Score ? 'score-leading' : ''}`}>{team2Score}</span>
        </div>
      </div>
    </div>
  );
}

export default ScoreDisplay;
