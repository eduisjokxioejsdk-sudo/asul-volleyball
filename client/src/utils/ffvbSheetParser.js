// ============================================================================
// PARSEUR FEUILLE DE MATCH FFVB (FDME), .DVW & CSV (Points 2 & 3)
//
// Extrait automatiquement les équipes (Domicile / Extérieur), les effectifs
// complets (n° maillot, nom, prénom, n° de licence FFVB, poste, taille,
// capitaine, libéro) et les métadonnées de match depuis :
//   1. Le texte copié-collé ou extrait d'une Feuille de Match FFVB (PDF FDME)
//   2. Un fichier DataVolley (.dvw)
//   3. Un tableau CSV / TSV (Excel, Google Sheets)
// ============================================================================

const ROLE_ALIASES = {
  s: 'setter',
  passeur: 'setter',
  pass: 'setter',
  setter: 'setter',
  o: 'opposite',
  opp: 'opposite',
  pointu: 'opposite',
  pointue: 'opposite',
  opposite: 'opposite',
  oh: 'outside',
  r4: 'outside',
  recep: 'outside',
  'récep': 'outside',
  receptionneur: 'outside',
  'réceptionneur': 'outside',
  ailier: 'outside',
  outside: 'outside',
  mb: 'middle',
  c: 'middle',
  central: 'middle',
  centrale: 'middle',
  middle: 'middle',
  l: 'libero',
  lib: 'libero',
  libero: 'libero',
  'libéro': 'libero',
  u: 'universal',
  univ: 'universal',
  universal: 'universal',
};

export function normalizeRole(raw) {
  if (!raw) return 'universal';
  const k = String(raw).trim().toLowerCase();
  return ROLE_ALIASES[k] || 'universal';
}

/**
 * Découpe un nom complet "DUPONT Jean-Luc" en { name, last_name, first_name }.
 */
export function splitFullName(rawName) {
  const clean = String(rawName || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return { name: '', last_name: '', first_name: '' };

  const tokens = clean.split(' ');
  if (tokens.length === 1) {
    return { name: clean, last_name: clean, first_name: '' };
  }

  const upperTokens = [];
  const otherTokens = [];
  for (const t of tokens) {
    if (t.length > 1 && t === t.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(t)) {
      upperTokens.push(t);
    } else {
      otherTokens.push(t);
    }
  }

  if (upperTokens.length > 0 && otherTokens.length > 0) {
    return {
      name: clean,
      last_name: upperTokens.join(' '),
      first_name: otherTokens.join(' '),
    };
  }

  return {
    name: clean,
    last_name: tokens[0],
    first_name: tokens.slice(1).join(' '),
  };
}

/**
 * Parse un fichier .dvw pour en extraire les 2 équipes et leurs joueurs.
 */
export function parseDvwRosters(text) {
  const lines = String(text || '').split(/\r?\n/);
  let section = '';
  const teams = [];
  const homePlayers = [];
  const awayPlayers = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^\[3[A-Z0-9_-]+\]/i.test(line)) {
      section = line.toUpperCase();
      continue;
    }

    if (section === '[3TEAMS]') {
      const parts = line.split(';');
      const name = (parts[1] || parts[0] || '').trim();
      if (name) teams.push(name);
    } else if (section.startsWith('[3PLAYERS')) {
      const isAway = section.includes('-V') || section.endsWith('A');
      const parts = line.split(';');

      const rawNum0 = parseInt(parts[0], 10);
      const rawNum1 = parseInt(parts[1], 10);
      let number = (rawNum0 > 0 && rawNum0 <= 99) ? rawNum0 : (rawNum1 > 0 && rawNum1 <= 99 ? rawNum1 : NaN);

      let lastName = (parts[9] || parts[3] || '').trim();
      let firstName = (parts[10] || parts[2] || '').trim();
      let special = (parts[12] || parts[4] || '').trim().toUpperCase();
      let roleCode = (parts[13] || parts[5] || '').trim();

      // Format simplifié interne : number;name;role
      if (Number.isNaN(number) || (!lastName && !firstName && parts.length <= 5)) {
        number = parseInt(parts[0], 10);
        const full = (parts[1] || '').trim();
        const sp = splitFullName(full);
        lastName = sp.last_name;
        firstName = sp.first_name;
        roleCode = (parts[2] || '').trim();
        special = (parts[3] || '').trim().toUpperCase();
      }

      if (!Number.isInteger(number) || number <= 0 || number > 99) continue;

      const dvRoleMap = {
        1: 'libero',
        2: 'outside',
        3: 'opposite',
        4: 'middle',
        5: 'setter',
        6: 'universal',
      };
      const isLibero =
        special.includes('L') ||
        roleCode === '1' ||
        normalizeRole(roleCode) === 'libero' ||
        parts.some((p) => p.trim().toUpperCase() === 'L' || /^lib[eé]ro$/i.test(p.trim()));
      const isCaptain =
        special.includes('C') ||
        parts.some((p) => p.trim().toUpperCase() === 'C' || /^cap(?:itaine)?$/i.test(p.trim()));
      const resolvedRole = isLibero
        ? 'libero'
        : dvRoleMap[roleCode] || normalizeRole(roleCode);
      const name = [lastName, firstName].filter(Boolean).join(' ').trim() || `N°${number}`;

      const playerObj = {
        number,
        name,
        last_name: lastName,
        first_name: firstName,
        role: resolvedRole,
        license_number: (parts[8] || '').trim() || null,
        is_libero: isLibero ? 1 : 0,
        is_captain: isCaptain ? 1 : 0,
        handedness: 'R',
        active: 1,
      };

      if (isAway) awayPlayers.push(playerObj);
      else homePlayers.push(playerObj);
    }
  }

  const homeLibero = homePlayers.find((p) => p.is_libero)?.number || null;
  const awayLibero = awayPlayers.find((p) => p.is_libero)?.number || null;

  return {
    sourceType: 'dvw',
    metadata: {},
    teams: [
      {
        side: 'home',
        name: teams[0] || 'Équipe Domicile',
        players: homePlayers,
        libero: homeLibero,
      },
      {
        side: 'away',
        name: teams[1] || 'Équipe Extérieur',
        players: awayPlayers,
        libero: awayLibero,
      },
    ].filter((t) => t.players.length > 0 || t.name),
  };
}

/**
 * Parse une Feuille de Match FFVB (FDME texte/PDF copié) ou un CSV.
 */
export function parseFfvbMatchSheet(rawText) {
  const text = String(rawText || '').trim();
  if (!text) {
    return { sourceType: 'empty', metadata: {}, teams: [] };
  }

  // 1. Détection automatique d'un fichier .dvw
  if (text.includes('[3DATAVOLLEY]') || text.includes('[3TEAMS]') || text.includes('[3PLAYERS')) {
    return parseDvwRosters(text);
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 2. Détection de métadonnées FFVB (Compétition, Date, Salle, Équipes A & B)
  const metadata = {
    competition: null,
    matchCode: null,
    date: null,
    hall: null,
    city: null,
    referees: [],
  };

  let teamAName = '';
  let teamBName = '';

  for (const line of lines) {
    // Exemple : "Équipe A : ASUL LYON VOLLEY" ou "LOCAUX : ASUL LYON"
    const matchTeamA = line.match(
      /^(?:[EÉ]quipe\s*A|Locaux|Domicile|Club\s*A|Team\s*A|RECEVANT)\s*[:\-–]\s*(.+)$/i
    );
    if (matchTeamA && !teamAName) {
      teamAName = matchTeamA[1].trim();
      continue;
    }

    const matchTeamB = line.match(
      /^(?:[EÉ]quipe\s*B|Visiteurs|Ext[eé]rieur|Club\s*B|Team\s*B|VISITEUR)\s*[:\-–]\s*(.+)$/i
    );
    if (matchTeamB && !teamBName) {
      teamBName = matchTeamB[1].trim();
      continue;
    }

    // Ligne "ASUL LYON  vs  GRENOBLE VUC" ou "ASUL LYON / GRENOBLE VUC"
    const vsMatch = line.match(/^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9\s\-'.]{2,34}?)\s+(?:VS|CONTRE|—|–)\s+([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9\s\-'.]{2,34})$/i);
    if (vsMatch && !teamAName && !teamBName) {
      teamAName = vsMatch[1].trim();
      teamBName = vsMatch[2].trim();
      continue;
    }

    const compMatch = line.match(/^(?:Comp[eé]tition|Championnat|Poule)\s*[:\-–]\s*(.+)$/i);
    if (compMatch && !metadata.competition) {
      metadata.competition = compMatch[1].trim();
      continue;
    }

    const salleMatch = line.match(/^(?:Salle|Gymnase)\s*[:\-–]\s*(.+)$/i);
    if (salleMatch && !metadata.hall) {
      metadata.hall = salleMatch[1].trim();
      continue;
    }

    const dateMatch = line.match(/\b(\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/);
    if (dateMatch && !metadata.date) {
      metadata.date = dateMatch[1];
    }
  }

  // 3. Extraction des lignes de joueurs (FFVB FDME ou CSV)
  // Dans une feuille FFVB, les deux équipes sont soit l'une après l'autre
  // (séparées par un en-tête Équipe B / Visiteurs ou une remise à zéro des n° de maillots),
  // soit sur la même ligne en 2 colonnes côte à côte.
  const teamAPlayers = [];
  const teamBPlayers = [];
  let currentSide = 'A';
  let lastNumberA = 0;

  const parseSinglePlayerFragment = (fragment) => {
    const clean = fragment.replace(/\t+/g, ' ').trim();
    if (!clean) return null;

    // Cas CSV avec séparateur ';' ou ','
    if (clean.includes(';') || (clean.split(',').length >= 3 && /^\d+\s*,/.test(clean))) {
      const sep = clean.includes(';') ? ';' : ',';
      const cols = clean.split(sep).map((c) => c.trim());
      const num = parseInt(cols[0], 10);
      if (!Number.isInteger(num) || num <= 0 || num > 99) return null;
      const rawName = cols[1] || '';
      if (!rawName || /^nom$/i.test(rawName)) return null;
      const sp = splitFullName(rawName);
      const roleStr = cols[2] || '';
      const lic = cols.find((c) => /^\d{6,10}$/.test(c)) || null;
      const height = cols.map((c) => parseInt(c, 10)).find((n) => n >= 150 && n <= 225) || null;
      const isLib = /\b(lib[eé]ro|^l$)\b/i.test(clean);
      const isCap = /\b(cap|capitaine|^c$)\b/i.test(cols.slice(2).join(' '));
      return {
        number: num,
        name: sp.name,
        last_name: sp.last_name,
        first_name: sp.first_name,
        role: isLib ? 'libero' : normalizeRole(roleStr),
        license_number: lic,
        height_cm: height,
        is_libero: isLib ? 1 : 0,
        is_captain: isCap ? 1 : 0,
        handedness: 'R',
        active: 1,
      };
    }

    // Cas Feuille de Match FFVB :
    // Formes supportées :
    //   "07 DUPONT Jean 1984521 L"
    //   "7  MARTIN Lucas   2049182   C"
    //   "N°12 BERNARD Paul (L) - 1842910"
    //   "14 PETIT Thomas Passeur 190cm"
    const m = clean.match(
      /^(?:N[°o]\s*)?(\d{1,2})\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{1,38}?)(?:\s+(\d{6,10}))?(?:\s+(?:\(?(C|CAP|CAPITAINE|L|LIB|LIB[EÉ]RO|PASSEUR|POINTU|CENTRAL|RECEP|R[EÉ]CEPTIONNEUR)\)?))?(?:\s+(\d{6,10}))?(?:\s+(?:\(?(C|L|LIB|CAP)\)?))?$/i
    );
    if (!m) return null;

    const num = parseInt(m[1], 10);
    if (!Number.isInteger(num) || num <= 0 || num > 99) return null;

    let rawName = m[2].trim();
    // Ignorer les lignes de score ou d'en-tête ("Set 1", "Total", "Arbitre", etc.)
    if (/^(set|total|point|score|temps|remplac|arbitre|salle|date|heure|equipe|équipe|joueur|licence)\b/i.test(rawName)) {
      return null;
    }

    // Extraire d'éventuels marqueurs (C) ou (L) ou licence collés à la fin du nom
    let isCap = false;
    let isLib = false;
    let role = 'universal';

    rawName = rawName
      .replace(/\((C|CAP|CAPITAINE)\)/gi, () => {
        isCap = true;
        return '';
      })
      .replace(/\((L|LIB|LIB[EÉ]RO)\)/gi, () => {
        isLib = true;
        return '';
      })
      .trim();

    const lic = m[3] || m[5] || null;
    const tag1 = (m[4] || '').toUpperCase();
    const tag2 = (m[6] || '').toUpperCase();

    for (const tag of [tag1, tag2]) {
      if (tag === 'C' || tag === 'CAP' || tag === 'CAPITAINE') isCap = true;
      else if (tag === 'L' || tag === 'LIB' || tag === 'LIBERO' || tag === 'LIBÉRO') isLib = true;
      else if (tag) role = normalizeRole(tag);
    }

    // Si le dernier mot du nom est isolé "C" ou "L"
    const nameTokens = rawName.split(/\s+/);
    if (nameTokens.length >= 2) {
      const lastTok = nameTokens[nameTokens.length - 1].toUpperCase();
      if (lastTok === 'C') {
        isCap = true;
        nameTokens.pop();
        rawName = nameTokens.join(' ');
      } else if (lastTok === 'L') {
        isLib = true;
        nameTokens.pop();
        rawName = nameTokens.join(' ');
      }
    }

    if (isLib) role = 'libero';
    const sp = splitFullName(rawName);
    if (!sp.name || sp.name.length < 2) return null;

    return {
      number: num,
      name: sp.name,
      last_name: sp.last_name,
      first_name: sp.first_name,
      role,
      license_number: lic,
      height_cm: null,
      is_libero: isLib ? 1 : 0,
      is_captain: isCap ? 1 : 0,
      handedness: 'R',
      active: 1,
    };
  };

  for (const line of lines) {
    // Changement explicite vers l'équipe B
    if (/^(?:[EÉ]quipe\s*B|Visiteurs|Ext[eé]rieur|Club\s*B|Team\s*B|VISITEUR)\b/i.test(line)) {
      if (teamAPlayers.length > 0) currentSide = 'B';
      continue;
    }
    if (/^(?:[EÉ]quipe\s*A|Locaux|Domicile|Club\s*A|Team\s*A|RECEVANT)\b/i.test(line)) {
      currentSide = 'A';
      continue;
    }

    // Détection d'une ligne double-colonne FFVB (Joueur A à gauche + Joueur B à droite)
    const dualMatch = line.match(
      /^(\d{1,2}\s+[A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{2,28}\s+\d{6,10}(?:\s+[CL])?)\s{2,}(\d{1,2}\s+[A-Za-zÀ-ÖØ-öø-ÿ'\-\s]{2,28}\s+\d{6,10}(?:\s+[CL])?)$/i
    );
    if (dualMatch) {
      const pA = parseSinglePlayerFragment(dualMatch[1]);
      const pB = parseSinglePlayerFragment(dualMatch[2]);
      if (pA) teamAPlayers.push(pA);
      if (pB) teamBPlayers.push(pB);
      continue;
    }

    // Section Libéros explicite dans une FDME : "LIBEROS : 12 DUPONT Jean"
    const libSectionMatch = line.match(/^LIB[EÉ]ROS?\s*[:\-–]\s*(.+)$/i);
    if (libSectionMatch) {
      const pLib = parseSinglePlayerFragment(libSectionMatch[1]);
      if (pLib) {
        pLib.is_libero = 1;
        pLib.role = 'libero';
        const targetList = currentSide === 'A' ? teamAPlayers : teamBPlayers;
        const existing = targetList.find((x) => x.number === pLib.number);
        if (existing) {
          existing.is_libero = 1;
          existing.role = 'libero';
        } else {
          targetList.push(pLib);
        }
      }
      continue;
    }

    const p = parseSinglePlayerFragment(line);
    if (!p) continue;

    // Si les numéros repartent à la baisse après au moins 6 joueurs en équipe A,
    // ou si le même numéro existe déjà dans l'équipe A, on bascule sur l'équipe B.
    if (
      currentSide === 'A' &&
      teamAPlayers.length >= 6 &&
      (p.number < lastNumberA || teamAPlayers.some((x) => x.number === p.number))
    ) {
      currentSide = 'B';
    }

    if (currentSide === 'A') {
      if (!teamAPlayers.some((x) => x.number === p.number)) {
        teamAPlayers.push(p);
        lastNumberA = p.number;
      }
    } else {
      if (!teamBPlayers.some((x) => x.number === p.number)) {
        teamBPlayers.push(p);
      }
    }
  }

  const teams = [];
  if (teamAPlayers.length > 0 || teamAName) {
    const libA = teamAPlayers.find((p) => p.is_libero)?.number || null;
    teams.push({
      side: 'home',
      name: teamAName || 'Équipe A (Locaux)',
      players: teamAPlayers.sort((a, b) => a.number - b.number),
      libero: libA,
    });
  }
  if (teamBPlayers.length > 0 || teamBName) {
    const libB = teamBPlayers.find((p) => p.is_libero)?.number || null;
    teams.push({
      side: 'away',
      name: teamBName || 'Équipe B (Visiteurs)',
      players: teamBPlayers.sort((a, b) => a.number - b.number),
      libero: libB,
    });
  }

  return {
    sourceType: 'ffvb',
    metadata,
    teams,
  };
}

/**
 * Extrait le texte lisible d'un fichier PDF de feuille de match FFVB (ou texte/CSV/DVW).
 */
export async function extractTextFromUploadedSheet(file) {
  if (!file) return '';
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.pdf')) {
    return await file.text();
  }

  // Lecture binaire du PDF et extraction des chaînes de texte PostScript/PDF
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder('latin1');
  const raw = decoder.decode(bytes);

  const chunks = [];
  // Chaînes entre parenthèses dans les blocs BT ... ET
  const btBlocks = raw.match(/BT[\s\S]*?ET/g) || [raw];
  for (const block of btBlocks) {
    const strMatches = block.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
    const lineTokens = [];
    for (const m of strMatches) {
      const cleaned = m[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ')
        .replace(/\\\(/g, '(')
        .replace(/\\\)/g, ')')
        .replace(/\\\\/g, '\\')
        .trim();
      if (cleaned && /[A-Za-z0-9À-ÖØ-öø-ÿ]/.test(cleaned)) {
        lineTokens.push(cleaned);
      }
    }
    if (lineTokens.length > 0) {
      chunks.push(lineTokens.join(' '));
    }
  }

  return chunks.join('\n');
}
