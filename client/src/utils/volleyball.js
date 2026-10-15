// ============================================================================
// Points et frise chronologique (score par set).
// La logique de rotation (six de départ, rotations, remplacements) vit dans
// utils/rotation.js ; ce fichier ne garde que ce qui sert à la frise des points.
// ============================================================================

/**
 * Types de points affichés dans la frise.
 * `type` est l'identifiant stable sauvegardé en base ; `letter` est
 * l'identifiant visuel compact.
 */
export const POINT_TYPES = [
  { type: 'block', label: 'Bloc', letter: 'B', desc: 'Bloc gagnant' },
  { type: 'attack', label: 'Attaque', letter: 'A', desc: 'Attaque gagnante' },
  { type: 'service', label: 'Service', letter: 'S', desc: 'Ace / Service gagnant' },
  { type: 'fault_service', label: 'Faute service adverse', letter: 'F', desc: 'Faute de service adverse' },
  { type: 'fault_attack', label: 'Faute attaque adverse', letter: 'G', desc: "Faute d'attaque adverse" },
  { type: 'fault_other', label: 'Faute autre adverse', letter: 'D', desc: 'Autre faute adverse' },
];

/**
 * Retourne la lettre d'affichage associée à un type de point.
 * @param {string} type - ex. 'attack', 'fault_service'
 * @returns {string} lettre (ex. 'A', 'F') ou '' si inconnu
 */
export function getPointTypeLetter(type) {
  const found = POINT_TYPES.find((p) => p.type === type);
  return found ? found.letter : '';
}

/**
 * Compute set-aware timeline: each point knows its set, per-set scores,
 * and the function tracks completed sets + match state.
 *
 * @param {Array} points - All annotated points
 * @param {Object} initialScore - { team1: 0, team2: 0 } for the first set
 * @returns {Object} { timeline, sets, currentSet, currentSetScore, team1SetsWon, team2SetsWon, matchOver }
 */
export function computeSetTimeline(points, initialScore = { team1: 0, team2: 0 }) {
  const timeline = [];
  const sets = [];
  let currentSet = 1;
  let t1 = initialScore.team1 || 0;
  let t2 = initialScore.team2 || 0;

  for (const point of points) {
    // Début de set manuel (set_start = 2..5) : force le passage au set indiqué.
    const manualSet = point.set_start ? Number(point.set_start) : 0;
    if (manualSet > currentSet) {
      if (t1 > 0 || t2 > 0) {
        sets.push({
          team1: t1,
          team2: t2,
          winner: t1 > t2 ? 'team1' : 'team2',
          setNumber: currentSet,
        });
      }
      currentSet = manualSet;
      t1 = 0;
      t2 = 0;
    }

    // If no winner, skip (don't affect score)
    if (!point.winner || (point.winner !== 'team1' && point.winner !== 'team2')) {
      timeline.push({
        ...point,
        setNumber: currentSet,
        scoreBefore: { team1: t1, team2: t2 },
        scoreAfter: { team1: t1, team2: t2 },
        isSetBreak: false,
      });
      continue;
    }

    const scoreBefore = { team1: t1, team2: t2 };

    if (point.winner === 'team1') t1++;
    else t2++;

    const scoreAfter = { team1: t1, team2: t2 };

    // Check if this point ends the set (15 points au 5e set, 25 sinon)
    let isSetBreak = false;
    const target = currentSet >= 5 ? 15 : 25;
    if (t1 >= target && t1 - t2 >= 2) {
      sets.push({ team1: t1, team2: t2, winner: 'team1', setNumber: currentSet });
      isSetBreak = true;
    } else if (t2 >= target && t2 - t1 >= 2) {
      sets.push({ team1: t1, team2: t2, winner: 'team2', setNumber: currentSet });
      isSetBreak = true;
    }

    timeline.push({
      ...point,
      setNumber: currentSet,
      scoreBefore,
      scoreAfter,
      isSetBreak,
    });

    // Reset for next set
    if (isSetBreak) {
      t1 = 0;
      t2 = 0;
      currentSet++;
    }
  }

  const team1SetsWon = sets.filter(s => s.winner === 'team1').length;
  const team2SetsWon = sets.filter(s => s.winner === 'team2').length;
  const matchOver = team1SetsWon >= 3 || team2SetsWon >= 3;
  const currentSetScore = { team1: t1, team2: t2 };

  return {
    timeline,
    sets,
    currentSet,
    currentSetScore,
    team1SetsWon,
    team2SetsWon,
    matchOver,
    matchWinner: team1SetsWon >= 3 ? 'team1' : team2SetsWon >= 3 ? 'team2' : null,
  };
}
