// Barre empilée de répartition des évaluations (#, +, !, -, /, =), mêmes
// couleurs que les trajectoires. Reste lisible à l'impression (couleurs forcées).

import { EVAL_COLORS, EVAL_ORDER } from '../utils/dvTrajectories.js';

export default function EvalBar({ byEval = {}, total = 0, width = 90 }) {
  const sum = total || EVAL_ORDER.reduce((s, e) => s + (byEval[e] || 0), 0);
  if (!sum) return <span style={{ opacity: 0.4 }}>—</span>;
  const title = EVAL_ORDER.filter((e) => byEval[e])
    .map((e) => `${e} ${byEval[e]} (${Math.round((byEval[e] / sum) * 100)}%)`)
    .join(' · ');
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        width,
        height: 9,
        verticalAlign: 'middle',
        overflow: 'hidden',
        borderRadius: 2,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      {EVAL_ORDER.map((e) =>
        byEval[e] ? (
          <i key={e} style={{ display: 'block', width: `${(byEval[e] / sum) * 100}%`, background: EVAL_COLORS[e] }} />
        ) : null
      )}
    </span>
  );
}
