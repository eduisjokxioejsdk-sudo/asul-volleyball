// ============================================================================
// Fenêtre flottante de la page de codage : déplaçable par sa barre de titre,
// redimensionnable par ses poignées, fermable si ce n'est pas une ancre
// (la vidéo et la zone de code ne peuvent pas être fermées).
// Le suivi du pointeur se fait au niveau de la fenêtre (window) : le
// déplacement reste fluide même si le curseur sort de la fenêtre ou de la page.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PANEL_MIN, clampRect } from '../utils/panelLayout';
import { GripVertical, X } from './icons';

/** Poignées de redimensionnement : bord droit, bord bas, coin bas-droit. */
const HANDLES = [
  { id: 'e', className: 'fp-handle-e', cursor: 'ew-resize' },
  { id: 's', className: 'fp-handle-s', cursor: 'ns-resize' },
  { id: 'se', className: 'fp-handle-se', cursor: 'nwse-resize' },
];

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.title
 * @param {React.ComponentType} [props.icon]
 * @param {{x:number,y:number,w:number,h:number}} props.rect
 * @param {(patch:Object)=>void} props.onRectChange
 * @param {()=>void} [props.onClose]
 * @param {boolean} [props.closable]
 * @param {React.ReactNode} [props.headerExtra] - boutons supplémentaires
 * @param {{width:number,height:number}} [props.size] - taille du canevas
 * @param {string} [props.className]
 * @param {React.ReactNode} props.children
 */
export default function FloatingPanel({
  id,
  title,
  icon = null,
  rect,
  onRectChange,
  onClose,
  closable = true,
  headerExtra = null,
  size,
  className = '',
  children,
}) {
  const dragRef = useRef(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [mode, setMode] = useState(null);
  const min = useMemo(() => PANEL_MIN[id] || { minW: 200, minH: 80 }, [id]);
  const IconComp = icon;

  const startDrag = useCallback((dragMode, event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode: dragMode,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...rect },
    };
    setMode(dragMode);
  }, [rect]);

  // Suivi global : le glissement reste actif même hors de la fenêtre.
  useEffect(() => {
    if (!mode) return undefined;

    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (drag.mode === 'move') {
        onRectChange(clampRect({ ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy }, sizeRef.current, min));
        return;
      }
      const next = { ...drag.rect };
      if (drag.mode === 'e' || drag.mode === 'se') next.w = Math.max(min.minW, drag.rect.w + dx);
      if (drag.mode === 's' || drag.mode === 'se') next.h = Math.max(min.minH, drag.rect.h + dy);
      onRectChange(clampRect(next, sizeRef.current, min));
    };

    const onEnd = () => {
      dragRef.current = null;
      setMode(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('blur', onEnd);
    // Évite de sélectionner du texte (ou de déclencher le clic) pendant le glissement.
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = mode === 'move' ? 'grabbing' : HANDLES.find((h) => h.id === mode)?.cursor || 'default';

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('blur', onEnd);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [mode, min, onRectChange]);

  const stopKeys = (e) => {
    // La barre de titre ne doit pas avaler les raccourcis de codage.
    if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
  };

  return (
    <section
      className={`floating-panel${mode ? ' dragging' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      aria-label={title}
    >
      <header
        className="fp-header"
        onPointerDown={(e) => {
          if (e.target.closest('button, a, input, select, textarea')) return;
          startDrag('move', e);
        }}
        onKeyDown={stopKeys}
        title={`${title} — glisser pour déplacer`}
      >
        <span className="fp-title">
          <GripVertical size={12} />
          {IconComp ? <IconComp size={13} /> : null}
          {title}
        </span>
        <span className="fp-actions">
          {headerExtra}
          {closable && (
            <button
              type="button"
              className="fp-close"
              onClick={onClose}
              title={`Fermer « ${title} » (réouverture via le menu Fenêtres)`}
              aria-label={`Fermer ${title}`}
            >
              <X size={13} />
            </button>
          )}
        </span>
      </header>

      <div className="fp-body">{children}</div>

      {HANDLES.map((h) => (
        <span
          key={h.id}
          className={`fp-handle ${h.className}`}
          style={{ cursor: h.cursor }}
          onPointerDown={(e) => startDrag(h.id, e)}
          title="Redimensionner"
          aria-hidden="true"
        />
      ))}
    </section>
  );
}

