import { motion } from 'framer-motion';
import { computeMatchTimeline } from '../utils/volleyball';

/**
 * PointTimeline — Frise chronologique horizontale des points du match.
 *
 * Affiche une frise de gauche à droite :
 * - Haut (bleu) : points gagnés par l'équipe 1
 * - Bas (rouge) : points gagnés par l'équipe 2
 * - Score actuel affiché à droite
 *
 * @param {Array}  points - Tous les points annotés (avec `winner`)
 * @param {string} team1  - Nom de l'équipe 1
 * @param {string} team2  - Nom de l'équipe 2
 * @param {Object} initialScore - Score de départ { team1, team2 }
 * @param {function} onScoreEdit - Callback quand le score de départ est modifié
 */
function PointTimeline({ points, team1, team2, initialScore = { team1: 0, team2: 0 }, onScoreEdit }) {
  const timeline = computeMatchTimeline(points, initialScore);
  const lastPoint = timeline[timeline.length - 1];
  const finalScore = lastPoint ? lastPoint.scoreAfter : initialScore;

  if (points.length === 0) {
    return (
      <div className="timeline-empty">
        <span className="timeline-empty-icon">📊</span>
        <p>Aucun point annoté pour générer la frise.</p>
        <p className="timeline-empty-hint">Annotez d'abord les points dans l'onglet "Annoter".</p>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      {/* Header with editable initial score */}
      <div className="timeline-header">
        <div className="timeline-score-display">
          <div className="timeline-score-team timeline-score-team1">
            <span className="timeline-team-name">{team1}</span>
            <span className="timeline-score-number">{finalScore.team1}</span>
          </div>
          <span className="timeline-score-separator">−</span>
          <div className="timeline-score-team timeline-score-team2">
            <span className="timeline-score-number">{finalScore.team2}</span>
            <span className="timeline-team-name">{team2}</span>
          </div>
        </div>
        <div className="timeline-initial-score">
          <span className="timeline-initial-label">Score de départ :</span>
          <span
            className="timeline-initial-value"
            onClick={() => {
              const newVal = prompt(
                `Score de départ (format: ${team1}-${team2})\nExemple: 2-2`,
                `${initialScore.team1}-${initialScore.team2}`
              );
              if (newVal) {
                const parts = newVal.split('-').map(s => parseInt(s.trim(), 10));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                  onScoreEdit({ team1: parts[0], team2: parts[1] });
                }
              }
            }}
            title="Cliquez pour modifier le score de départ"
          >
            {initialScore.team1}−{initialScore.team2}
          </span>
        </div>
      </div>

      {/* Timeline scrollable */}
      <div className="timeline-scroll">
        <div className="timeline-track">
          {/* Team 1 points (top - blue) */}
          <div className="timeline-row timeline-row-top">
            {timeline.map((pt, idx) => (
              <motion.div
                key={idx}
                className={`timeline-point ${pt.winner === 'team1' ? 'timeline-point-won' : 'timeline-point-lost'}`}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                title={`Point ${idx + 1}: ${pt.winner === 'team1' ? team1 : team2} gagne (${pt.scoreBefore.team1}-${pt.scoreBefore.team2} → ${pt.scoreAfter.team1}-${pt.scoreAfter.team2})`}
              >
                <div className="timeline-point-dot" />
                <span className="timeline-point-label">{pt.scoreAfter.team1}</span>
              </motion.div>
            ))}
          </div>

          {/* Center line */}
          <div className="timeline-center-line">
            <div className="timeline-center-line-inner" />
          </div>

          {/* Point numbers */}
          <div className="timeline-numbers">
            {timeline.map((pt, idx) => (
              <motion.span
                key={idx}
                className="timeline-number"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
              >
                {idx + 1}
              </motion.span>
            ))}
          </div>

          {/* Center line (bottom) */}
          <div className="timeline-center-line">
            <div className="timeline-center-line-inner" />
          </div>

          {/* Team 2 points (bottom - red) */}
          <div className="timeline-row timeline-row-bottom">
            {timeline.map((pt, idx) => (
              <motion.div
                key={idx}
                className={`timeline-point ${pt.winner === 'team2' ? 'timeline-point-won' : 'timeline-point-lost'}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                title={`Point ${idx + 1}: ${pt.winner === 'team2' ? team2 : team1} gagne (${pt.scoreBefore.team1}-${pt.scoreBefore.team2} → ${pt.scoreAfter.team1}-${pt.scoreAfter.team2})`}
              >
                <div className="timeline-point-dot" />
                <span className="timeline-point-label">{pt.scoreAfter.team2}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="timeline-legend">
        <div className="timeline-legend-item">
          <span className="timeline-legend-dot timeline-legend-dot-won" />
          <span>Point gagné</span>
        </div>
        <div className="timeline-legend-item">
          <span className="timeline-legend-dot timeline-legend-dot-lost" />
          <span>Point perdu</span>
        </div>
      </div>
    </div>
  );
}

export default PointTimeline;