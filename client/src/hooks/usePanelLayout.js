// ============================================================================
// Hook de gestion des fenêtres de la page de codage : état + persistance
// (localStorage) + bornage automatique quand le canevas change de taille.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyPanelPatch,
  canvasMinHeight,
  canvasMinWidth,
  defaultPanelLayout,
  fitPanelLayout,
  isClosable,
  openPanel,
  setPanelsOpen,
  togglePanel,
} from '../utils/panelLayout';

/** Charge une disposition enregistrée, sinon la disposition par défaut. */
function loadLayout(storageKey, size, skip = []) {
  // Tant que le canevas n'est pas mesuré, on part sur une taille de référence.
  const safe = {
    width: Number(size?.width) || 1200,
    height: Number(size?.height) || 800,
  };
  const base = defaultPanelLayout(safe.width, safe.height, skip);
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    const merged = { ...base };
    for (const id of Object.keys(base)) {
      const saved = parsed?.[id];
      if (!saved) continue;
      merged[id] = {
        ...base[id],
        x: Number(saved.x) || 0,
        y: Number(saved.y) || 0,
        w: Number(saved.w) || base[id].w,
        h: Number(saved.h) || base[id].h,
        open: saved.open !== undefined ? !!saved.open : base[id].open,
      };
      if (!isClosable(id)) merged[id].open = true;
    }
    return merged;
  } catch {
    return base;
  }
}

/**
 * @param {string} storageKey - clé de persistance
 * @param {{width:number,height:number}} size - taille courante du canevas
 * @param {string[]} [skip] - fenêtres absentes de la page (ex. « video » en live)
 */
export default function usePanelLayout(storageKey, size, skip = []) {
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const skipRef = useRef(skip);
  skipRef.current = skip;

  const [layout, setLayout] = useState(() => loadLayout(storageKey, size, skip));

  // Persistance
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // Stockage indisponible : la disposition reste valable pour la session.
    }
  }, [layout, storageKey]);

  // Quand le canevas change de taille, on garde les fenêtres dans les limites.
  useEffect(() => {
    if (!size.width || !size.height) return;
    setLayout((prev) => fitPanelLayout(prev, size));
  }, [size.width, size.height]);

  const setRect = useCallback((id, patch) => {
    setLayout((prev) => applyPanelPatch(prev, id, patch, sizeRef.current));
  }, []);

  const toggle = useCallback((pid) => setLayout((prev) => togglePanel(prev, pid)), []);
  const open = useCallback((pid) => setLayout((prev) => openPanel(prev, pid)), []);
  const close = useCallback((pid) => setLayout((prev) => applyPanelPatch(prev, pid, { open: false }, sizeRef.current)), []);
  const setOpen = useCallback((pid, value) => setLayout((prev) => applyPanelPatch(prev, pid, { open: !!value }, sizeRef.current)), []);
  const setMany = useCallback((ids, value) => setLayout((prev) => setPanelsOpen(prev, ids, value)), []);
  const reset = useCallback(() => setLayout(defaultPanelLayout(sizeRef.current.width, sizeRef.current.height, skipRef.current)), []);

  const minHeight = useMemo(() => canvasMinHeight(layout), [layout]);
  const minWidth = useMemo(() => canvasMinWidth(layout), [layout]);

  return { layout, setRect, toggle, open, close, setOpen, setMany, reset, minHeight, minWidth };
}
