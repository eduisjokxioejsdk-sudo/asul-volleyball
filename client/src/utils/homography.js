// ============================================================================
// Calibration Perspective 4-Points du Terrain sur la Vidéo (Homographie 2D)
// Permet de projeter un clic (u, v) sur la vidéo vers le terrain normalisé
// [0..1, 0..1] et d'en déduire automatiquement la Zone DataVolley (1..9) et
// la Sous-zone (A..D), ainsi que de tracer la grille 3D en perspective.
// ============================================================================

/**
 * Résout un système linéaire 8x8 par élimination de Gauss avec pivot partiel.
 */
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const val = Math.abs(M[r][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = r;
      }
    }
    if (maxVal < 1e-12) return null;
    if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }
    const pivot = M[col][col];
    for (let j = col; j <= n; j += 1) M[col][j] /= pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = M[r][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = col; j <= n; j += 1) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }
  return M.map((row) => row[n]);
}

/**
 * Calcule la matrice d'homographie 3x3 envoyant 4 points sources vers 4 points cibles.
 */
export function computeHomography(srcPts, dstPts) {
  if (!Array.isArray(srcPts) || srcPts.length !== 4 || !Array.isArray(dstPts) || dstPts.length !== 4) {
    return null;
  }
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = srcPts[i];
    const { x: u, y: v } = dstPts[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinearSystem(A, b);
  if (!h) return null;
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

export function applyHomography(H, pt) {
  if (!H || !pt) return null;
  const denom = H[2][0] * pt.x + H[2][1] * pt.y + H[2][2];
  if (Math.abs(denom) < 1e-9) return null;
  const x = (H[0][0] * pt.x + H[0][1] * pt.y + H[0][2]) / denom;
  const y = (H[1][0] * pt.x + H[1][1] * pt.y + H[1][2]) / denom;
  return { x, y };
}

// Les 4 coins canoniques du terrain complet :
// 0: Fond-Gauche Camp Haut (0, 0)
// 1: Fond-Droit Camp Haut  (1, 0)
// 2: Fond-Droit Camp Bas   (1, 1)
// 3: Fond-Gauche Camp Bas  (0, 1)
const CANONICAL_COURT_CORNERS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/**
 * Projette un point (x, y) normalisé [0..1] de la vidéo vers le terrain [0..1, 0..1].
 */
export function videoPointToCourt(corners, videoPt) {
  if (!Array.isArray(corners) || corners.length !== 4) return null;
  const H = computeHomography(corners, CANONICAL_COURT_CORNERS);
  return applyHomography(H, videoPt);
}

/**
 * Projette un point (x, y) du terrain [0..1, 0..1] vers les coordonnées vidéo [0..1, 0..1].
 */
export function courtPointToVideo(corners, courtPt) {
  if (!Array.isArray(corners) || corners.length !== 4) return null;
  const H = computeHomography(CANONICAL_COURT_CORNERS, corners);
  return applyHomography(H, courtPt);
}

// Grille DataVolley officielle vue depuis le camp considéré (face au filet) :
// Ligne 0 (près du filet) : 4 (gauche), 3 (centre), 2 (droite)
// Ligne 1 (médiane 3m)    : 7 (gauche), 8 (centre), 9 (droite)
// Ligne 2 (fond)          : 5 (gauche), 6 (centre), 1 (droite)
const LOCAL_ZONE_GRID = [
  ['4', '3', '2'],
  ['7', '8', '9'],
  ['5', '6', '1'],
];

/**
 * Convertit un point terrain (cx, cy) dans [0..1, 0..1] en :
 *   - half : 'far' (camp du haut, cy < 0.5) ou 'near' (camp du bas, cy >= 0.5)
 *   - zone : '1'..'9' (numérotation officielle DataVolley dans ce demi-terrain)
 *   - subzone : 'A' | 'B' | 'C' | 'D'
 */
export function courtPointToZone(courtPt) {
  if (!courtPt) return null;
  const { x: cx, y: cy } = courtPt;
  // Tolérance légère autour des lignes (balles sur la ligne)
  if (cx < -0.08 || cx > 1.08 || cy < -0.08 || cy > 1.08) return null;

  const clampedX = Math.max(0, Math.min(0.9999, cx));
  const clampedY = Math.max(0, Math.min(0.9999, cy));

  const half = clampedY < 0.5 ? 'far' : 'near';

  // Coordonnées locales dans le demi-terrain :
  // localU = de gauche à droite en regardant le filet (0..1)
  // localV = de la ligne de filet (0) vers la ligne de fond (1)
  let localU;
  let localV;
  if (half === 'near') {
    // Camp du bas : regarde vers le haut (filet à cy = 0.5, fond à cy = 1.0)
    localU = clampedX;
    localV = (clampedY - 0.5) * 2;
  } else {
    // Camp du haut : regarde vers le bas (filet à cy = 0.5, fond à cy = 0.0)
    localU = 1 - clampedX;
    localV = (0.5 - clampedY) * 2;
  }

  const col = Math.min(2, Math.max(0, Math.floor(localU * 3)));
  const row = Math.min(2, Math.max(0, Math.floor(localV * 3)));
  const zone = LOCAL_ZONE_GRID[row][col];

  // Sous-zone A, B, C, D à l'intérieur de la cellule (2x2)
  const cellU = localU * 3 - col;
  const cellV = localV * 3 - row;
  let subzone = 'A';
  if (cellV < 0.5 && cellU >= 0.5) subzone = 'A';
  else if (cellV >= 0.5 && cellU >= 0.5) subzone = 'B';
  else if (cellV >= 0.5 && cellU < 0.5) subzone = 'C';
  else subzone = 'D';

  return { half, zone, subzone, cx: clampedX, cy: clampedY };
}

export function loadCourtCalibration(videoId) {
  try {
    const raw = window.localStorage.getItem(`pancake_court_calib_${videoId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length === 4 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCourtCalibration(videoId, corners) {
  try {
    if (!corners) {
      window.localStorage.removeItem(`pancake_court_calib_${videoId}`);
    } else {
      window.localStorage.setItem(`pancake_court_calib_${videoId}`, JSON.stringify(corners));
    }
  } catch {
    // ignore
  }
}
