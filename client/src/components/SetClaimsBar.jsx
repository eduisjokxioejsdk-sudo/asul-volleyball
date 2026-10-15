// ============================================================================
// Barre d'attribution de sets (codage collaboratif).
//
// Chaque set d'une vidéo peut être revendiqué par un statisticien (partagé via
// Supabase) ; les sets des autres apparaissent comme pris. Le composant est
// volontairement sans dépendance au reste de l'interface (styles inline).
// ============================================================================

import { useState } from 'react';

/**
 * @param {Array} props.claims - [{ set_number, claimed_by_name, claimed_by_email, deleted }]
 * @param {number} [props.currentSet]
 * @param {number} [props.maxSets]
 * @param {string} [props.userEmail]
 * @param {boolean} [props.disabled]
 * @param {(n: number) => void} props.onClaim
 * @param {(n: number) => void} props.onRelease
 */
export default function SetClaimsBar({
  claims = [],
  currentSet = 1,
  maxSets = 5,
  userEmail = '',
  disabled = false,
  onClaim,
  onRelease,
}) {
  const [busy, setBusy] = useState(false);

  const claimFor = (n) =>
    claims.find((c) => Number(c.set_number) === n && Number(c.deleted) !== 1) || null;

  const act = async (fn) => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const btnStyle = {
    border: '1px solid var(--border-subtle)',
    background: 'transparent',
    color: 'var(--text-muted)',
    borderRadius: 6,
    padding: '2px 8px',
    fontSize: 11,
    cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 0.5 }}>
        Attribution des sets
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: maxSets }, (_, i) => i + 1).map((n) => {
          const claim = claimFor(n);
          const mine = claim && claim.claimed_by_email === userEmail;
          const isCurrent = n === currentSet;
          return (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '4px 8px',
                background: mine ? 'rgba(40, 104, 184, 0.18)' : claim ? 'rgba(232, 72, 72, 0.12)' : 'transparent',
                outline: isCurrent ? '1px solid var(--accent)' : 'none',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>S{n}</span>
              <span style={{ fontSize: 11, color: claim ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {claim ? (mine ? 'Toi' : claim.claimed_by_name || claim.claimed_by_email) : 'Libre'}
              </span>
              {!claim && (
                <button type="button" style={btnStyle} disabled={busy || disabled} onClick={() => act(() => onClaim(n))}>
                  Prendre
                </button>
              )}
              {mine && (
                <button type="button" style={btnStyle} disabled={busy || disabled} onClick={() => act(() => onRelease(n))}>
                  Libérer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
