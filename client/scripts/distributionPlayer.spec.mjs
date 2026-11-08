// Distribution par attaquant. Exécution : node client/scripts/distributionPlayer.spec.mjs
import { computeDistributionByPlayer } from '../src/utils/distribution.js';

const mk = (uid, team, n, action, extra = {}) => ({ uid, team, player_number: n, action, ...extra });
const actions = [
  mk(1, 'away', 1, 'S', { evaluation: '+' }),
  mk(2, 'home', 5, 'R', { evaluation: '#' }),
  mk(3, 'home', 2, 'E'),
  mk(4, 'home', 9, 'A', { start_zone: '4', evaluation: '#' }),
];
const out = computeDistributionByPlayer(actions, null, { home: 2 }, { phase: 'ALL' });
let bad = 0;
const check = (l, ok) => { if (!ok) bad++; console.log((ok ? '  ok   ' : '  FAIL ') + l); };
check('une ligne domicile', out.home.length === 1);
check('attaquant n°9', out.home[0]?.number === 9 && out.home[0].count === 1);
check('part 100% et point', out.home[0]?.pct === 100 && out.home[0].points === 1);
check('situation + comptée', out.home[0]?.bySituation['+'] === 1);
check('extérieur vide', out.away.length === 0);
if (bad) process.exit(1);

import { computeSetterTendencies } from '../src/utils/distribution.js';
const T = [
  mk(1, 'home', 1, 'S', { evaluation: '+' }),
  mk(2, 'away', 5, 'R', { evaluation: '+' }),
  mk(3, 'away', 2, 'E'),
  mk(4, 'away', 9, 'A', { start_zone: '4', evaluation: '/' }),
  mk(5, 'home', 3, 'D', { evaluation: '+' }),
  mk(6, 'home', 2, 'E'),
  mk(7, 'home', 8, 'A', { start_zone: '4', evaluation: '#' }),
  mk(8, 'home', 1, 'S', { evaluation: '+' }),
  mk(9, 'away', 5, 'R', { evaluation: '+' }),
  mk(10, 'away', 2, 'E'),
  mk(11, 'away', 9, 'A', { start_zone: '4', evaluation: '#' }),
];
const tr = computeSetterTendencies(T, null, { phase: 'ALL' });
check('tendances : après point perdu (extérieur)', tr.away.afterLoss.total === 1 && tr.away.afterLoss.rows[0].number === 9);
check('tendances : même attaquant resollicité', tr.away.afterFail.total === 1 && tr.away.afterFail.same === 1);
if (bad) process.exit(1);
