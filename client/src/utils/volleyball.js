// Volleyball rotation logic utility

// Rotation order: P6 -> P5 -> P4 -> P3 -> P2 -> P1 -> P6 (loop)
const ROTATION_ORDER = ['P6', 'P5', 'P4', 'P3', 'P2', 'P1'];

/**
 * Get the next position in rotation
 * @param {string} currentPosition - e.g. 'P1', 'P6'
 * @returns {string} next position
 */
export function getNextPosition(currentPosition) {
  const index = ROTATION_ORDER.indexOf(currentPosition);
  if (index === -1) return 'P1';
  return ROTATION_ORDER[(index + 1) % ROTATION_ORDER.length];
}

/**
 * Determine the serving team for point N+1 based on point N result
 * If a team wins point N, they serve for point N+1
 * @param {string} winner - 'team1' or 'team2'
 * @param {string} previousServingTeam - 'team1' or 'team2'
 * @returns {{ servingTeam: string, receivingTeam: string, teamRotates: boolean }}
 */
export function determineNextService(winner, previousServingTeam) {
  const previousReceivingTeam = previousServingTeam === 'team1' ? 'team2' : 'team1';
  
  // If the serving team wins the point, they keep serving (no rotation for them)
  // If the receiving team wins the point (side-out), they take over serving AND rotate
  if (winner === previousServingTeam) {
    return {
      servingTeam: previousServingTeam,
      receivingTeam: previousReceivingTeam,
      teamRotates: false
    };
  } else {
    // Side-out: receiving team wins, they become serving team and rotate
    return {
      servingTeam: previousReceivingTeam,
      receivingTeam: previousServingTeam,
      teamRotates: true
    };
  }
}

/**
 * Auto-fill data for point N+1 based on point N data
 * @param {Object} previousPoint - The previous point's annotation data
 * @param {string} winner - Winner of the current point N
 * @returns {Object} Auto-filled data for point N+1
 */
export function autoFillNextPoint(previousPoint, winner) {
  if (!previousPoint) return null;

  const { serving_team } = previousPoint;
  let prevTeam1Pos = previousPoint.team1_position || '';
  let prevTeam2Pos = previousPoint.team2_position || '';

  const { servingTeam, receivingTeam, teamRotates } = determineNextService(winner, serving_team);

  // Apply rotation to the team that won (if they were receiving and did side-out)
  let newTeam1Pos = prevTeam1Pos;
  let newTeam2Pos = prevTeam2Pos;

  if (teamRotates) {
    if (winner === 'team1') {
      newTeam1Pos = getNextPosition(prevTeam1Pos);
    } else {
      newTeam2Pos = getNextPosition(prevTeam2Pos);
    }
  }

  return {
    serving_team: servingTeam,
    receiving_team: receivingTeam,
    team1_position: newTeam1Pos,
    team2_position: newTeam2Pos
  };
}

/**
 * Get the rotation order array
 */
export function getRotationOrder() {
  return ROTATION_ORDER;
}

/**
 * Compute set-based scores from points.
 * A set is won when a team reaches 25 points with at least a 2-point lead.
 * If the score reaches 24-24, play continues until one team leads by 2.
 * The score resets to 0 for the next set once a set is won.
 *
 * @param {Array} points - Array of point objects with a 'winner' field ('team1' or 'team2')
 * @returns {Object} { currentSet, team1Score, team2Score, sets }
 *   - currentSet: the current set number (1-based)
 *   - team1Score: current set score for team1
 *   - team2Score: current set score for team2
 *   - sets: array of completed sets, each { team1, team2, winner, setNumber }
 */
export function computeSetScores(points) {
  const sets = [];
  let team1Score = 0;
  let team2Score = 0;
  let currentSet = 1;

  for (const point of points) {
    if (!point.winner) continue;

    if (point.winner === 'team1') {
      team1Score++;
    } else if (point.winner === 'team2') {
      team2Score++;
    }

    // A set is won when a team reaches 25+ points AND leads by 2+
    if (team1Score >= 25 && team1Score - team2Score >= 2) {
      sets.push({ team1: team1Score, team2: team2Score, winner: 'team1', setNumber: currentSet });
      team1Score = 0;
      team2Score = 0;
      currentSet++;
    } else if (team2Score >= 25 && team2Score - team1Score >= 2) {
      sets.push({ team1: team1Score, team2: team2Score, winner: 'team2', setNumber: currentSet });
      team1Score = 0;
      team2Score = 0;
      currentSet++;
    }
  }

  return {
    currentSet,
    team1Score,
    team2Score,
    sets,
  };
}

/**
 * Compute the cumulative match score point by point.
 * Each point gets its score context (score before the point, score after).
 *
 * @param {Array} points - Array of point objects with a 'winner' field ('team1' or 'team2')
 * @param {Object} initialScore - { team1: 0, team2: 0 } optional starting score
 * @returns {Array} Each point enriched with { scoreBefore: { team1, team2 }, scoreAfter: { team1, team2 } }
 */
export function computeMatchTimeline(points, initialScore = { team1: 0, team2: 0 }) {
  const timeline = [];
  let t1 = initialScore.team1 || 0;
  let t2 = initialScore.team2 || 0;

  for (const point of points) {
    const scoreBefore = { team1: t1, team2: t2 };

    if (point.winner === 'team1') {
      t1++;
    } else if (point.winner === 'team2') {
      t2++;
    }

    const scoreAfter = { team1: t1, team2: t2 };

    timeline.push({
      ...point,
      scoreBefore,
      scoreAfter,
    });
  }

  return timeline;
}



