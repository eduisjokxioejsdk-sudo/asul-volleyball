// ============================================================================
// Helpers YouTube (vidéos publiques, non répertoriées, lives, courts liens)
// ============================================================================

/**
 * Extrait l'identifiant YouTube (11 caractères) depuis n'importe quelle URL
 * YouTube (watch?v=, youtu.be/, youtube.com/live/, embed/, shorts/) ou un ID brut.
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function extractYouTubeId(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return raw;
  }

  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (host === 'youtu.be') {
      const seg = url.pathname.split('/').filter(Boolean)[0];
      if (seg && /^[a-zA-Z0-9_-]{11}$/.test(seg)) return seg;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && ['live', 'embed', 'shorts', 'v'].includes(parts[0])) {
        const candidate = parts[1];
        if (candidate && /^[a-zA-Z0-9_-]{11}$/.test(candidate)) return candidate;
      }
    }
  } catch {
    // Fallback regex
  }

  const match = raw.match(/(?:v=|youtu\.be\/|youtube\.com\/(?:embed|live|shorts|v)\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

/**
 * Indique si une vidéo possède une source lisible (fichier local ou lien YouTube).
 */
export function hasPlayableSource(video) {
  if (!video) return false;
  return Boolean(video.filename || extractYouTubeId(video.youtube_url));
}
