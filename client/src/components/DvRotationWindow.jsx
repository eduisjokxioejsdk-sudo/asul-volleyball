// ============================================================================
// FENÊTRE DE ROTATION (façon DataVolley) : le terrain des deux équipes avec le
// score, le set, la rotation de chacune et le ballon de service. Utilisée dans
// le mode Saisie (état courant) et en Consultation (état au point choisi).
// ============================================================================

import { POSITION_LABELS } from '../utils/rotation';
import { rotationNumber } from '../utils/codingTools';

/** Une équipe : ses 6 postes, du filet (P4 P3 P2) vers l'arrière (P5 P6 P1). */
function TeamCourt({ side, label, lineup, rotation, serving, setterPos, roster, compact }) {
  const nameOf = (n) => {
    const p = (roster || []).find((r) => Number(r.number) === Number(n));
    return p?.name ? p.name : '';
  };
  const cell = (pos) => {
    const n = lineup?.[pos] ?? null;
    const isSetter = setterPos === pos;
    return (
      <div
        key={pos}
        className={`dvr-cell ${isSetter ? 'setter' : ''} ${n ? '' : 'empty'}`}
        title={`${pos} — ${POSITION_LABELS[pos]}${n ? ` · n°${n}${nameOf(n) ? ` ${nameOf(n)}` : ''}` : ''}`}
      >
        <span className="dvr-pos">{pos}</span>
        <span className="dvr-num">{n ?? '—'}</span>
        {!compact && nameOf(n) && <span className="dvr-name">{nameOf(n)}</span>}
      </div>
    );
  };
  return (
    <div className={`dvr-team ${side}`}>
      <div className="dvr-team-head">
        <strong>{label}</strong>
        <span className="dvr-rot" title="Rotation (poste du passeur)">
          {rotation ? `P${rotation}` : '—'}
        </span>
      </div>
      <div className="dvr-court">
        <div className="dvr-row">{['P4', 'P3', 'P2'].map(cell)}</div>
        <div className="dvr-row">{['P5', 'P6', 'P1'].map(cell)}</div>
      </div>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.state - { setNumber, score, server, homeLineup, awayLineup,
 *        homeRotation, awayRotation, homeSetterPos, awaySetterPos }
 * @param {string} props.team1 - nom de l'équipe à domicile
 * @param {string} props.team2 - nom de l'équipe extérieure
 * @param {Object} [props.homeConfig] - fiche équipe ({ roster })
 * @param {Object} [props.awayConfig]
 * @param {Array} [props.events] - temps morts et remplacements (compteurs)
 * @param {number} [props.setsWon1] / [props.setsWon2] - sets gagnés
 * @param {boolean} [props.compact] - version réduite (pas de noms)
 */
export default function DvRotationWindow({
  state,
  team1,
  team2,
  homeConfig,
  awayConfig,
  events = [],
  setsWon1 = 0,
  setsWon2 = 0,
  compact = false,
}) {
  const s = state || {};
  const score = s.score || { team1: 0, team2: 0 };
  const timeouts = { home: 0, away: 0 };
  const subs = { home: 0, away: 0 };
  for (const ev of events) {
    const key = ev.team === 'away' ? 'away' : 'home';
    if (ev.kind === 'timeout') timeouts[key] += 1;
    if (ev.kind === 'substitution') subs[key] += 1;
  }

  return (
    <div className="dvr">
      <div className="dvr-score">
        <div className={`dvr-side ${s.server === 'team1' ? 'serving' : ''}`}>
          <span className="dvr-ball" title={s.server === 'team1' ? 'Au service' : ''}>
            {s.server === 'team1' ? '●' : ''}
          </span>
          <strong>{team1}</strong>
          <span className="dvr-sets">{setsWon1}</span>
        </div>
        <div className="dvr-points">
          <span className="dvr-point">{score.team1 ?? 0}</span>
          <span className="dvr-dash">–</span>
          <span className="dvr-point">{score.team2 ?? 0}</span>
          <span className="dvr-set">Set {s.setNumber ?? 1}</span>
        </div>
        <div className={`dvr-side away ${s.server === 'team2' ? 'serving' : ''}`}>
          <span className="dvr-ball" title={s.server === 'team2' ? 'Au service' : ''}>
            {s.server === 'team2' ? '●' : ''}
          </span>
          <strong>{team2}</strong>
          <span className="dvr-sets">{setsWon2}</span>
        </div>
      </div>

      <div className="dvr-courts">
        <TeamCourt
          side="home"
          label={team1}
          lineup={s.homeLineup}
          rotation={s.homeRotation ?? rotationNumber(s.homeSetterPos)}
          serving={s.server === 'team1'}
          setterPos={s.homeSetterPos}
          roster={homeConfig?.roster}
          compact={compact}
        />
        <div className="dvr-net" aria-hidden="true" />
        <TeamCourt
          side="away"
          label={team2}
          lineup={s.awayLineup}
          rotation={s.awayRotation ?? rotationNumber(s.awaySetterPos)}
          serving={s.server === 'team2'}
          setterPos={s.awaySetterPos}
          roster={awayConfig?.roster}
          compact={compact}
        />
      </div>

      {!compact && (
        <div className="dvr-meta">
          <span title="Temps morts utilisés">Temps morts : {timeouts.home} / {timeouts.away}</span>
          <span title="Remplacements enregistrés">Remplacements : {subs.home} / {subs.away}</span>
          <span title="Postes du terrain : filet en haut">P4 P3 P2 / P5 P6 P1</span>
        </div>
      )}
    </div>
  );
}
