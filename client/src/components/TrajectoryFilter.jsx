// ============================================================================
// Menu de filtre de la consultation des fiches de trajectoire.
//
// Il liste les issues du type de frappe en cours (point, feinte, continuité,
// faute, contrée, dehors) : chaque entrée est une case à cocher qui masque ou
// affiche les flèches correspondantes sur les terrains.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eye, EyeOff, Funnel, X } from './icons';

/** Largeur du menu (voir .tj-filter-dropdown) + marge de sécurité. */
const MENU_WIDTH = 240;
const MENU_MARGIN = 12;

/**
 * @param {Object} props
 * @param {Array<{id:string,label:string,color:string}>} props.results issues du type de frappe
 * @param {Array<string>} props.hidden ids d'issues masquées
 * @param {(id:string)=>void} props.onToggle masquer / afficher une issue
 * @param {(ids:Array<string>)=>void} props.onSetAll masquer (ou plus) toutes les issues
 */
export default function TrajectoryFilter({ results, hidden, onToggle, onSetAll }) {
  const [open, setOpen] = useState(false);
  const [openRight, setOpenRight] = useState(false);
  const wrapRef = useRef(null);

  // Le menu s'ouvre vers la gauche ; près du bord gauche il s'ouvre vers la droite.
  const placeMenu = useCallback(() => {
    const button = wrapRef.current?.querySelector('button');
    if (!button || typeof window === 'undefined') return;
    const rect = button.getBoundingClientRect();
    setOpenRight(rect.right - (MENU_WIDTH + MENU_MARGIN) < 8);
  }, []);

  // Ferme le menu au clic extérieur ou sur Échap.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    placeMenu();
    window.addEventListener('resize', placeMenu);
    return () => window.removeEventListener('resize', placeMenu);
  }, [open, placeMenu]);

  const masked = new Set(hidden || []);
  const hiddenCount = (results || []).filter((r) => masked.has(r.id)).length;

  return (
    <div className="tj-filter-menu" ref={wrapRef}>
      <button
        type="button"
        className={`btn btn-sm ${hiddenCount > 0 ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Choisir les types de flèches affichés sur les terrains"
      >
        <Funnel size={14} /> Filtres{hiddenCount > 0 ? ` (${hiddenCount} masqué${hiddenCount > 1 ? 's' : ''})` : ''}
      </button>

      {open && (
        <div className={`tj-filter-dropdown ${openRight ? 'open-right' : ''}`} role="menu">
          <div className="tj-filter-head">
            <strong>Flèches affichées</strong>
            <button type="button" className="fp-close" onClick={() => setOpen(false)} aria-label="Fermer le menu">
              <X size={13} />
            </button>
          </div>

          <ul className="tj-filter-list">
            {(results || []).map((r) => {
              const visible = !masked.has(r.id);
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`tj-filter-item ${visible ? 'on' : 'off'}`}
                    onClick={() => onToggle(r.id)}
                    title={visible ? 'Masquer ces flèches' : 'Afficher ces flèches'}
                  >
                    <span className="tj-filter-check">{visible ? <Check size={13} /> : <EyeOff size={13} />}</span>
                    <span className="tj-filter-dot" style={{ background: r.color }} />
                    <span className="tj-filter-label">{r.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="tj-filter-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSetAll([])}>
              <Eye size={13} /> Tout afficher
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onSetAll((results || []).map((r) => r.id))}
            >
              <EyeOff size={13} /> Tout masquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
