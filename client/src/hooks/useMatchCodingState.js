// ============================================================================
// Hook useMatchCodingState : gestionnaire d'état de saisie DataVolley.
// Découple la saisie clavier, l'historique undo/redo, le tampon et les revendications de sets.
// ============================================================================

import { useState, useRef, useCallback } from 'react';

export function useMatchCodingState(initialActions = []) {
  const [actions, setActions] = useState(initialActions);
  const actionsRef = useRef(initialActions);
  const [buffer, setBuffer] = useState('');
  const bufferRef = useRef('');
  const blockTimesRef = useRef(new Map());

  // Historique Undo / Redo (pour match live)
  const historyRef = useRef([]);
  const futureRef = useRef([]);

  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  const [myClaimedSet, setMyClaimedSet] = useState(null);
  const [claimedSets, setClaimedSets] = useState([]);

  const notifyFlash = useCallback((ok, text, durationMs = 2000) => {
    setFlash({ ok, text });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), durationMs);
  }, []);

  const updateActions = useCallback((nextActions, recordHistory = true) => {
    if (recordHistory && actionsRef.current) {
      historyRef.current.push([...actionsRef.current]);
      if (historyRef.current.length > 50) historyRef.current.shift();
      futureRef.current = [];
    }
    actionsRef.current = nextActions;
    setActions(nextActions);
  }, []);

  const undo = useCallback(() => {
    if (!historyRef.current.length) return false;
    const prev = historyRef.current.pop();
    futureRef.current.push([...actionsRef.current]);
    actionsRef.current = prev;
    setActions(prev);
    notifyFlash(true, 'Annulation effectuée (Undo)');
    return true;
  }, [notifyFlash]);

  const redo = useCallback(() => {
    if (!futureRef.current.length) return false;
    const next = futureRef.current.pop();
    historyRef.current.push([...actionsRef.current]);
    actionsRef.current = next;
    setActions(next);
    notifyFlash(true, 'Rétablissement effectué (Redo)');
    return true;
  }, [notifyFlash]);

  const clearBuffer = useCallback(() => {
    bufferRef.current = '';
    setBuffer('');
    blockTimesRef.current.clear();
  }, []);

  return {
    actions,
    actionsRef,
    setActions: updateActions,
    rawSetActions: setActions,
    buffer,
    bufferRef,
    setBuffer,
    clearBuffer,
    blockTimesRef,
    undo,
    redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    flash,
    setFlash: notifyFlash,
    myClaimedSet,
    setMyClaimedSet,
    claimedSets,
    setClaimedSets,
  };
}

export default useMatchCodingState;
