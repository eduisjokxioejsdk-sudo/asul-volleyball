// ============================================================================
// Écoute d'une collection partagée (Socket.IO) : recharge une liste dès qu'un
// autre poste crée/modifie/supprime une donnée de la collection, que ce soit en
// local (réseau) ou via la synchronisation cloud (le serveur émet `<key>:changed`
// après avoir appliqué les changements distants).
// ============================================================================

import { useEffect, useRef } from 'react';
import { createSocket } from '../services/liveSocket';

/**
 * @param {string} key        clé de collection (ex. 'trajectories', 'videos').
 * @param {() => void} onChanged  rappel appelé à chaque notification.
 */
export default function useCollectionChanged(key, onChanged) {
  const handlerRef = useRef(onChanged);
  handlerRef.current = onChanged;

  useEffect(() => {
    const socket = createSocket();
    const handle = () => {
      if (handlerRef.current) handlerRef.current();
    };
    socket.on(`${key}:changed`, handle);
    return () => {
      socket.off(`${key}:changed`, handle);
      socket.disconnect();
    };
  }, [key]);
}
