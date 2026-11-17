import { useCallback, useEffect, useRef, useState } from 'react';
import { liveAPI } from '../../../services/api';
import { createSocket } from '../../../services/liveSocket';

const EMPTY_STATE = {
  rows: [],
  matchList: [],
  setterList: [],
  sheetConfigs: [],
  teamLineup: {},
  revision: 0,
};

/** État partagé en lecture seule (banc et hôte), actualisé par Socket.IO. */
export default function useFastDirectSessionState(sessionId) {
  const [state, setState] = useState(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revisionRef = useRef(0);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (!sessionId || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await liveAPI.getFastDirectState(sessionId);
      const next = res.data?.state;
      const revision = Number(res.data?.revision ?? next?.revision) || 0;
      if (next && revision !== revisionRef.current) {
        revisionRef.current = revision;
        setState({ ...EMPTY_STATE, ...next, revision });
      }
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Impossible de charger la distribution.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
    if (!sessionId) return undefined;
    const socket = createSocket();
    const enter = () => {
      socket.emit('live:join', sessionId);
      load();
    };
    socket.on('connect', enter);
    socket.on('fast-direct:update', load);
    const timer = setInterval(load, 5000);
    return () => {
      clearInterval(timer);
      socket.off('connect', enter);
      socket.off('fast-direct:update', load);
      socket.disconnect();
    };
  }, [load, sessionId]);

  return { state, loading, error, reload: load };
}
