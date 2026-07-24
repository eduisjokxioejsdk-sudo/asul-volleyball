import { useRef } from 'react';
import { motion } from 'framer-motion';
import { computeSetTimeline } from '../utils/volleyball';

function PointTimeline({ points, team1, team2, initialScore = { team1: 0, team2: 0 }, onScoreEdit }) {
  const { 
    timeline, 
    sets, 
    currentSet, 
    currentSetScore,
    team1SetsWon,
    team2SetsWon,
    matchOver,
    matchWinner,
  } = computeSetTimeline(points, initialScore);

  const scrollRefs = useRef({});

  if (points.length === 0) {
    return (
      <div className="timeline-empty">
        <span className="timeline-empty-icon">📊</span>
        <p>Aucun point annoté pour générer la frise.</p>
        <p className="timeline-empty-hint">Annotez d'abord les points dans l'onglet "Annoter".</p>
      </div>
    );
  }

  const timelineBySet = {};
  timeline.forEach(pt => {
    const s = pt.setNumber;
    if (!timelineBySet[s]) timelineBySet[s] = [];
    timelineBySet[s].push(pt);
  });

  const setNumbers = Object.keys(timelineBySet).map(Number).sort((a,b) => a-b);

  const scrollRow = (setNum, direction) => {
    const el = scrollRefs.current[setNum];
    if (el) {
      el.scrollBy({ left: direction * 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="timeline-container" style={{ gap: 16 }}>
      {/* Header */}
      <div className="timeline-header">
        <div className="timeline-score-display">
          <div className="timeline-score-team timeline-score-team1">
            <span className="timeline-team-name">{team1}</span>
            <span className="timeline-score-number">{currentSetScore.team1}</span>
          </div>
          <span className="timeline-score-separator">−</span>
          <div className="timeline-score-team timeline-score-team2">
            <span className="timeline-score-number">{currentSetScore.team2}</span>
            <span className="timeline-team-name">{team2}</span>
          </div>
        </div>
        <div className="timeline-sets-indicator">
          <span className="score-display-badge team1 active">{team1SetsWon}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 6px' }}>−</span>
          <span className="score-display-badge team2 active">{team2SetsWon}</span>
          <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--text-muted)' }}>sets</span>
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

      {/* Completed sets badges (compact) */}
      <div className="timeline-sets-summary">
        {sets.map(set => (
          <div
            key={set.setNumber}
            className={`tube-set-badge ${set.winner === 'team1' ? 'tube-set-team1' : 'tube-set-team2'}`}
          >
            <span className="tube-set-label">Set {set.setNumber}</span>
            <span className="tube-set-score">{set.team1}−{set.team2}</span>
          </div>
        ))}
        {!matchOver && (
          <div className="tube-set-badge tube-set-current">
            <span className="tube-set-label">Set {currentSet}</span>
            <span className="tube-set-score">{currentSetScore.team1}−{currentSetScore.team2}</span>
          </div>
        )}
        {matchOver && (
          <div className="tube-set-badge tube-set-over">
            <span className="tube-set-label">🏆</span>
            <span className="tube-set-score">
              {matchWinner === 'team1' ? team1 : team2}
            </span>
          </div>
        )}
      </div>

      {/* Set rows — 2 sets visible, scroll for more */}
      <div className="timeline-scroll" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {setNumbers.map((setNum) => {
          const pts = timelineBySet[setNum];
          const isCurrent = setNum === currentSet && !sets.find(s => s.setNumber === setNum);
          const setInfo = sets.find(s => s.setNumber === setNum);
          const setResult = setInfo
            ? `${setInfo.team1}−${setInfo.team2}`
            : `${currentSetScore.team1}−${currentSetScore.team2}`;

          return (
            <div key={setNum} className="set-timeline-row">
              {/* SET label */}
              <div className="set-timeline-label">
                <span className="set-timeline-label-num">SET {setNum}</span>
                <span className={`set-timeline-label-score ${setInfo?.winner === 'team1' ? 'set-score-team1' : setInfo?.winner === 'team2' ? 'set-score-team2' : ''}`}>
                  {setResult}
                </span>
                {setInfo && <span className="set-timeline-label-check">✓</span>}
                {isCurrent && <span className="set-timeline-label-dot" />}
              </div>

              {/* Scroll arrows + timeline */}
              <div className="set-timeline-scroll-wrapper">
                <motion.button
                  className="scroll-arrow scroll-arrow-left"
                  onClick={() => scrollRow(setNum, -1)}
                  whileHover={{ scale: 1.1, background: 'rgba(232,72,72,0.15)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  ◀
                </motion.button>
                
                <div
                  className="set-timeline-scroll"
                  ref={el => { scrollRefs.current[setNum] = el; }}
                >
                  <div className="timeline-track" style={{ padding: '0 12px' }}>
                    {/* Top row: team1 scores */}
                    <div className="timeline-row timeline-row-top">
                      {pts.map((pt, idx) => (
                        <motion.span
                          key={idx}
                          className={`timeline-number-bold ${
                            pts.length <= 25 
                              ? 'timeline-number-large' 
                              : ''
                          } ${pt.winner === 'team1' ? 'timeline-bold-won timeline-bold-blue' : 'timeline-bold-lost'}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.15, delay: idx * 0.01 }}
                          title={`${pt.winner === 'team1' ? team1 : team2} gagne (${pt.scoreBefore.team1}-${pt.scoreBefore.team2} → ${pt.scoreAfter.team1}-${pt.scoreAfter.team2})`}
                        >
                          {pt.scoreAfter.team1}
                        </motion.span>
                      ))}
                    </div>

                    {/* Center line */}
                    <div className="timeline-center-line">
                      <div className="timeline-center-line-inner" />
                    </div>

                    {/* Bottom row: team2 scores */}
                    <div className="timeline-row timeline-row-bottom">
                      {pts.map((pt, idx) => (
                        <motion.span
                          key={idx}
                          className={`timeline-number-bold ${
                            pts.length <= 25 
                              ? 'timeline-number-large' 
                              : ''
                          } ${pt.winner === 'team2' ? 'timeline-bold-won timeline-bold-red' : 'timeline-bold-lost'}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.15, delay: idx * 0.01 }}
                          title={`${pt.winner === 'team2' ? team2 : team1} gagne (${pt.scoreBefore.team1}-${pt.scoreBefore.team2} → ${pt.scoreAfter.team1}-${pt.scoreAfter.team2})`}
                        >
                          {pt.scoreAfter.team2}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                </div>

                <motion.button
                  className="scroll-arrow scroll-arrow-right"
                  onClick={() => scrollRow(setNum, 1)}
                  whileHover={{ scale: 1.1, background: 'rgba(232,72,72,0.15)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  ▶
                </motion.button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PointTimeline;