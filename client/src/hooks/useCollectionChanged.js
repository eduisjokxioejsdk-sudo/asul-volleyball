// ============================================================================
// Écoute d'une collection partagée (Socket.IO) : recharge une liste dès qu'un
// autre poste crée/modifie/supprime une donnée de la collection, que ce soit en
// local (réseau) ou via la synchronisation cloud (le serveur émet `<key>:changed`
// après avoir appliqué les changements distants).
// ============================================================================

import { useEffect, useRef } from 'react';
import { createSocket } from '../services/liveSocket';

/**
 * @param {string|string[]} key        clé(s) de collection (ex. 'trajectories', 'videos').
 * @param {() => void} onChanged       rappel appelé à chaque notification.
 */
export default function useCollectionChanged(key, onChanged) {
  const handlerRef = useRef(onChanged);
  handlerRef.current = onChanged;
  const keysSig = Array.isArray(key) ? key.join(',') : String(key || '');

  useEffect(() => {
    const list = keysSig.split(',').filter(Boolean);
    if (!list.length) return undefined;
    const socket = createSocket();
    const handle = () => {
      if (handlerRef.current) handlerRef.current();
    };
    for (const k of list) socket.on(`${k}:changed`, handle);
    return () => {
      for (const k of list) socket.off(`${k}:changed`, handle);
      socket.disconnect();
    };
  }, [keysSig]);
}

export function useOnCollectionsChanged(keys, onChanged) {
  return useCollectionChanged(keys, onChanged);
}
