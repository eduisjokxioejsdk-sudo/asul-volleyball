// ============================================================================
// Connexion Socket.IO + synchronisation d'horloge (NTP-like) pour le mode
// "match en direct". Le client estime son décalage avec le serveur afin de
// trier les actions de plusieurs appareils dans un même référentiel de temps.
// ============================================================================

import { io } from 'socket.io-client';
import { liveAPI } from './api';

// L'interface et le serveur partagent la même origine ; en développement le
// proxy Vite redirige /socket.io vers le serveur (port 3001).
const SOCKET_URL = window.location.origin;

export function createSocket() {
  return io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });
}

/**
 * Estime l'offset (ms) entre l'horloge du client et celle du serveur.
 * offset > 0 : le client est en retard ; offset < 0 : en avance.
 * On médiane plusieurs échantillons pour lisser la latence réseau.
 */
export async function estimateClockOffset(samples = 5) {
  const offsets = [];
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const res = await liveAPI.time();
      const t1 = res.data.serverTime;
      const t2 = Date.now();
      const rtt = t2 - t0;
      const serverAtT0 = t1 - rtt / 2;
      offsets.push(serverAtT0 - t0);
    } catch (err) {
      // requête ignorée
    }
  }
  if (!offsets.length) return 0;
  offsets.sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  return offsets.length % 2 ? offsets[mid] : (offsets[mid - 1] + offsets[mid]) / 2;
}

/** Temps client recalé sur l'horloge serveur (ms). */
export function syncedTimeMs(offsetMs) {
  return Date.now() + (offsetMs || 0);
}
