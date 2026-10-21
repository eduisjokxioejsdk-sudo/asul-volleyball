// ============================================================================
// CALQUE DE DESSIN SUR LA VIDÉO — annotation façon DataVolley.
//
// Un SVG est superposé au lecteur vidéo. Les tracés sont faits en coordonnées
// normalisées (0..1) de l'image, ils restent donc valides si la vidéo est
// redimensionnée. Le texte libre est saisi dans une petite invite.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Type, Undo2 } from './icons';
import {
  DRAW_COLORS,
  DRAW_WIDTHS,
  clearAnnotations,
  createAnnotation,
  pushAnnotation,
  toNormalized,
  undoAnnotation,
  updateDraft,
} from '../utils/videoAnnotations';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children - le lecteur vidéo (rendu dessous)
 * @param {boolean} props.enabled - le calque est-il actif ?
 * @param {Function} props.onAnnotationsChange - (annotations) => void
 */
export default function VideoAnnotationLayer({ children, enabled = false, onAnnotationsChange }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);

  const [annotations, setAnnotations] = useState([]);
  const [history, setHistory] = useState([]);
  const [tool, setTool] = useState('arrow');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [width, setWidth] = useState(DRAW_WIDTHS[1]);
  const [draft, setDraft] = useState(null);
  const [textInput, setTextInput] = useState(null);

  // Les annotations courantes sont exposées au parent pour l'export.
  useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  const pointFromEvent = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const box = svg.getBoundingClientRect();
    return toNormalized(e.clientX - box.left, e.clientY - box.top, {
      x: 0,
      y: 0,
      width: box.width,
      height: box.height,
    });
  }, []);


  // --- Tracé -------------------------------------------------------------

  const startDraw = (e) => {
    if (!enabled) return;
    e.preventDefault();
    if (tool === 'text') {
      const p = pointFromEvent(e);
      setTextInput({ x: p.x, y: p.y, value: '' });
      return;
    }
    const p = pointFromEvent(e);
    setDraft(
      createAnnotation(
        tool,
        { x: p.x, y: p.y, x2: p.x, y2: p.y, points: tool === 'freehand' ? [p] : undefined },
        { color, width }
      )
    );
  };

  const moveDraw = (e) => {
    if (!draft) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    setDraft((d) => updateDraft(d, p));
  };

  const endDraw = () => {
    if (!draft) return;
    // On ignore les tracés trop courts (clic simple sans déplacement).
    const meaningful =
      draft.tool === 'freehand'
        ? (draft.points || []).length > 1
        : Math.abs(draft.x2 - draft.x) > 0.004 || Math.abs(draft.y2 - draft.y) > 0.004;
    if (meaningful) {
      const { annotations: next, history: nextHist } = pushAnnotation(annotations, history, draft);
      setAnnotations(next);
      setHistory(nextHist);
    }
    setDraft(null);
  };

  const commitText = () => {
    const value = (textInput?.value || '').trim();
    if (value && textInput) {
      const ann = createAnnotation('text', { x: textInput.x, y: textInput.y, text: value }, { color, width });
      const { annotations: next, history: nextHist } = pushAnnotation(annotations, history, ann);
      setAnnotations(next);
      setHistory(nextHist);
    }
    setTextInput(null);
  };

  const doUndo = () => {
    const { annotations: next, history: nextHist } = undoAnnotation(annotations, history);
    setAnnotations(next);
    setHistory(nextHist);
  };

  const doClear = () => {
    const { annotations: next, history: nextHist } = clearAnnotations(annotations, history);
    setAnnotations(next);
    setHistory(nextHist);
  };


  // --- Rendu des formes ---------------------------------------------------

  const renderShape = (a, isDraft = false) => {
    const op = isDraft ? 0.7 : 1;
    if (a.tool === 'freehand') {
      const pts = a.points || [];
      if (pts.length < 2) return null;
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * 1000} ${p.y * 1000}`).join(' ');
      return (
        <path
          key={a.id}
          d={d}
          fill="none"
          stroke={a.color}
          strokeWidth={a.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={op}
        />
      );
    }
    if (a.tool === 'text') {
      return (
        <text
          key={a.id}
          x={a.x * 1000}
          y={a.y * 1000}
          fill={a.color}
          fontSize={a.width * 6}
          fontWeight="700"
          stroke="#000"
          strokeWidth={a.width * 0.3}
          style={{ paintOrder: 'stroke' }}
        >
          {a.text}
        </text>
      );
    }
    const x = Math.min(a.x, a.x2) * 1000;
    const y = Math.min(a.y, a.y2) * 1000;
    const w = Math.abs(a.x2 - a.x) * 1000;
    const h = Math.abs(a.y2 - a.y) * 1000;
    const common = {
      fill: 'none',
      stroke: a.color,
      strokeWidth: a.width,
      vectorEffect: 'non-scaling-stroke',
      opacity: op,
    };
    if (a.tool === 'rect') return <rect key={a.id} x={x} y={y} width={w} height={h} {...common} />;
    if (a.tool === 'ellipse') return <ellipse key={a.id} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
    if (a.tool === 'line') return <line key={a.id} x1={a.x * 1000} y1={a.y * 1000} x2={a.x2 * 1000} y2={a.y2 * 1000} {...common} />;
    if (a.tool === 'arrow') {
      const ang = Math.atan2(a.y2 - a.y, a.x2 - a.x);
      const head = Math.max(6, a.width * 3);
      const bx1 = a.x2 * 1000 - head * Math.cos(ang - Math.PI / 7);
      const by1 = a.y2 * 1000 - head * Math.sin(ang - Math.PI / 7);
      const bx2 = a.x2 * 1000 - head * Math.cos(ang + Math.PI / 7);
      const by2 = a.y2 * 1000 - head * Math.sin(ang + Math.PI / 7);
      return (
        <g key={a.id}>
          <line x1={a.x * 1000} y1={a.y * 1000} x2={a.x2 * 1000} y2={a.y2 * 1000} {...common} />
          <polygon points={`${a.x2 * 1000},${a.y2 * 1000} ${bx1},${by1} ${bx2},${by2}`} fill={a.color} stroke="none" opacity={op} />
        </g>
      );
    }
    return null;
  };

  const shapes = draft ? [...annotations, draft] : annotations;


  return (
    <div className={`video-annot-layer ${enabled ? 'active' : ''}`} ref={wrapRef}>
      {children}

      {enabled && (
        <>
          <svg
            ref={svgRef}
            className="video-annot-svg"
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          >
            {shapes.map((a) => renderShape(a, a === draft))}
          </svg>

          <div className="video-annot-tools" onPointerDown={(e) => e.stopPropagation()}>
            <select value={tool} onChange={(e) => setTool(e.target.value)} title="Outil" aria-label="Outil de dessin">
              <option value="arrow">Flèche</option>
              <option value="line">Ligne</option>
              <option value="rect">Rectangle</option>
              <option value="ellipse">Ellipse</option>
              <option value="freehand">Main levée</option>
              <option value="text">Texte</option>
            </select>

            <div className="video-annot-colors">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`video-annot-swatch ${color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  title={`Couleur ${c}`}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>

            <div className="video-annot-widths">
              {DRAW_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`video-annot-width ${width === w ? 'active' : ''}`}
                  onClick={() => setWidth(w)}
                  title={`Épaisseur ${w}`}
                  aria-label={`Épaisseur ${w}`}
                >
                  <span style={{ height: w }} />
                </button>
              ))}
            </div>

            <button type="button" className="btn btn-secondary btn-sm" onClick={doUndo} disabled={!history.length} title="Annuler">
              <Undo2 size={12} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={doClear} disabled={!annotations.length} title="Effacer tout">
              <Eraser size={12} />
            </button>
          </div>
        </>
      )}

      {textInput && (
        <div className="video-annot-text-pop" onPointerDown={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={textInput.value}
            onChange={(e) => setTextInput((t) => ({ ...t, value: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText();
              if (e.key === 'Escape') setTextInput(null);
            }}
            placeholder="Texte…"
            aria-label="Texte de l'annotation"
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={commitText}>
            <Type size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
