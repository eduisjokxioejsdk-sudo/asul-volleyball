// ============================================================================
// PROFILS DE FENÊTRES (3.1.1) — enregistrer une disposition et la réappliquer
// sur n'importe quel match.
//
// Un profil contient, pour chaque fenêtre de la page de codage : position,
// taille et état ouvert/fermé. Les profils sont stockés GLOBALEMENT sur le
// poste (localStorage), pas dans le match : on peut donc préparer une
// disposition sur un match et l'appliquer à tous les autres.
//
// La logique de fusion est pure (testée par panel-profiles.spec.mjs) :
//   • les fenêtres absentes du profil gardent leur disposition courante ;
//   • les fenêtres ajoutées après l'enregistrement (ex. « Direction
//     d'attaque ») ne disparaissent pas ;
//   • les ancres (vidéo, zone de code) restent toujours ouvertes ;
//   • les rectangles sont bornés à la taille du canevas courant.
// ============================================================================

import { PANEL_IDS, PANEL_MIN, clampRect, isClosable } from './panelLayout.js';

export const PANEL_PROFILES_KEY = 'dv.panelProfiles.v1';
export const PANEL_PROFILE_LIMIT = 20;
export const PANEL_PROFILE_NAME_MAX = 40;

/** Copie normalisée de la disposition : uniquement les fenêtres connues. */
export function profileLayoutOf(layout) {
  const out = {};
  for (const id of PANEL_IDS) {
    const r = layout?.[id];
    if (!r) continue;
    out[id] = {
      x: Math.max(0, Math.round(Number(r.x) || 0)),
      y: Math.max(0, Math.round(Number(r.y) || 0)),
      w: Math.max(1, Math.round(Number(r.w) || 0)),
      h: Math.max(1, Math.round(Number(r.h) || 0)),
      open: r.open !== false,
    };
  }
  return out;
}

/** Nettoyage d'un profil relu du stockage (tolérant aux anciennes entrées). */
export function sanitizePanelProfile(profile) {
  if (!profile || !profile.id) return null;
  const name = String(profile.name || '').trim().slice(0, PANEL_PROFILE_NAME_MAX);
  if (!name) return null;
  return {
    id: String(profile.id),
    name,
    layout: profileLayoutOf(profile.layout),
    createdAt: profile.createdAt || null,
    updatedAt: profile.updatedAt || profile.createdAt || null,
  };
}

/**
 * Enregistre la disposition courante sous un nom.
 * Un nom déjà utilisé (insensible à la casse) met à jour le profil existant.
 *
 * @param {Array} profiles - profils existants
 * @param {string} name
 * @param {Object} layout - disposition courante (usePanelLayout)
 * @param {{ now?:string, id?:string }} [opts] - horodatage / id (tests)
 * @returns {{ profiles:Array, profile:Object }|null}
 */
export function savePanelProfile(profiles, name, layout, opts = {}) {
  const clean = String(name || '').trim().slice(0, PANEL_PROFILE_NAME_MAX);
  if (!clean) return null;
  const list = Array.isArray(profiles) ? profiles : [];
  const now = opts.now || new Date().toISOString();
  const existing = list.find((p) => String(p?.name || '').toLowerCase() === clean.toLowerCase());
  if (existing) {
    const updated = {
      ...existing,
      name: clean,
      layout: profileLayoutOf(layout),
      updatedAt: now,
    };
    return {
      profiles: list.map((p) => (p.id === existing.id ? updated : p)),
      profile: updated,
    };
  }
  const profile = {
    id: opts.id || `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    layout: profileLayoutOf(layout),
    createdAt: now,
    updatedAt: now,
  };
  let next = [...list, profile];
  if (next.length > PANEL_PROFILE_LIMIT) next = next.slice(next.length - PANEL_PROFILE_LIMIT);
  return { profiles: next, profile };
}

/** Supprime un profil par son identifiant. */
export function removePanelProfile(profiles, id) {
  return (profiles || []).filter((p) => p && p.id !== id);
}

/**
 * Applique une disposition enregistrée à la disposition courante, en la
 * bornant au canevas courant.
 *
 * @param {Object} current - disposition actuelle
 * @param {Object} profileLayout - disposition du profil
 * @param {{width:number,height:number}} size - canevas courant
 * @param {string[]} [skip] - fenêtres absentes de la page
 * @returns {Object} nouvelle disposition
 */
export function applyProfileLayout(current, profileLayout, size, skip = []) {
  const next = { ...(current || {}) };
  for (const id of PANEL_IDS) {
    if (skip.includes(id)) continue;
    const saved = profileLayout?.[id];
    if (!saved) continue;
    const base = next[id] || { x: 0, y: 0, w: saved.w, h: saved.h, open: true };
    const min = PANEL_MIN[id] || { minW: 200, minH: 80 };
    const merged = {
      ...base,
      x: Number(saved.x) || 0,
      y: Number(saved.y) || 0,
      w: Number(saved.w) || base.w,
      h: Number(saved.h) || base.h,
      open: saved.open === undefined ? !!base.open : !!saved.open,
    };
    next[id] = { ...merged, ...clampRect(merged, size, min) };
    if (!isClosable(id)) next[id].open = true;
  }
  return next;
}

/** Charge les profils enregistrés sur ce poste. */
export function loadPanelProfiles(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(PANEL_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizePanelProfile).filter(Boolean).slice(0, PANEL_PROFILE_LIMIT);
  } catch {
    return [];
  }
}

/** Enregistre les profils sur ce poste. Renvoie false si le stockage refuse. */
export function storePanelProfiles(profiles, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PANEL_PROFILES_KEY, JSON.stringify((profiles || []).slice(0, PANEL_PROFILE_LIMIT)));
    return true;
  } catch {
    return false;
  }
}
