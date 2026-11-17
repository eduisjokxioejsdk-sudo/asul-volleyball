import JSZip from 'jszip';
import {
  computeDistributionGrid,
  computeSaisieSummary,
  computeSetterSheetStats,
  filterRowsForPreset,
  normalizeCode,
  normalizeRow,
} from './scoutingEngine';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

export function colToIdx(col) {
  let r = 0;
  for (let i = 0; i < col.length; i++) {
    r = r * 26 + (col.charCodeAt(i) - 64);
  }
  return r - 1;
}

export function idxToCol(idx) {
  let r = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    r = String.fromCharCode(65 + rem) + r;
    n = Math.floor((n - 1) / 26);
  }
  return r;
}

function splitRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) return { col: 'A', row: 1 };
  return { col: m[1], row: Number(m[2]) };
}

function getOrCreateRow(sheetData, rowNum, templateRowEl = null) {
  const rows = sheetData.getElementsByTagNameNS(MAIN_NS, 'row');
  for (let i = 0; i < rows.length; i++) {
    const r = Number(rows[i].getAttribute('r'));
    if (r === rowNum) return rows[i];
    if (r > rowNum) {
      const newRow = sheetData.ownerDocument.createElementNS(MAIN_NS, 'row');
      newRow.setAttribute('r', String(rowNum));
      if (templateRowEl) {
        const ht = templateRowEl.getAttribute('ht');
        const customHeight = templateRowEl.getAttribute('customHeight');
        if (ht) newRow.setAttribute('ht', ht);
        if (customHeight) newRow.setAttribute('customHeight', customHeight);
      }
      sheetData.insertBefore(newRow, rows[i]);
      return newRow;
    }
  }
  const newRow = sheetData.ownerDocument.createElementNS(MAIN_NS, 'row');
  newRow.setAttribute('r', String(rowNum));
  if (templateRowEl) {
    const ht = templateRowEl.getAttribute('ht');
    const customHeight = templateRowEl.getAttribute('customHeight');
    if (ht) newRow.setAttribute('ht', ht);
    if (customHeight) newRow.setAttribute('customHeight', customHeight);
  }
  sheetData.appendChild(newRow);
  return newRow;
}

function getOrCreateCell(rowEl, cellRef, defaultStyle = null) {
  const targetColIdx = colToIdx(splitRef(cellRef).col);
  const cells = rowEl.getElementsByTagNameNS(MAIN_NS, 'c');
  for (let i = 0; i < cells.length; i++) {
    const ref = cells[i].getAttribute('r');
    if (ref === cellRef) return cells[i];
    const cIdx = colToIdx(splitRef(ref).col);
    if (cIdx > targetColIdx) {
      const newCell = rowEl.ownerDocument.createElementNS(MAIN_NS, 'c');
      newCell.setAttribute('r', cellRef);
      if (defaultStyle !== null) newCell.setAttribute('s', String(defaultStyle));
      rowEl.insertBefore(newCell, cells[i]);
      return newCell;
    }
  }
  const newCell = rowEl.ownerDocument.createElementNS(MAIN_NS, 'c');
  newCell.setAttribute('r', cellRef);
  if (defaultStyle !== null) newCell.setAttribute('s', String(defaultStyle));
  rowEl.appendChild(newCell);
  return newCell;
}

function setCellValueRaw(cellEl, value, sharedStringsCtx, { clearFormula = false } = {}) {
  if (clearFormula) {
    const f = cellEl.getElementsByTagNameNS(MAIN_NS, 'f')[0];
    if (f) cellEl.removeChild(f);
  }
  const hasFormula = cellEl.getElementsByTagNameNS(MAIN_NS, 'f').length > 0;
  let vEl = cellEl.getElementsByTagNameNS(MAIN_NS, 'v')[0];

  if (value === null || value === undefined || value === '') {
    if (!hasFormula) {
      cellEl.removeAttribute('t');
      if (vEl) cellEl.removeChild(vEl);
    }
    return;
  }

  if (value === '#DIV/0!') {
    cellEl.setAttribute('t', 'e');
    if (!vEl) {
      vEl = cellEl.ownerDocument.createElementNS(MAIN_NS, 'v');
      cellEl.appendChild(vEl);
    }
    vEl.textContent = '#DIV/0!';
    return;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      cellEl.setAttribute('t', 'e');
      if (!vEl) {
        vEl = cellEl.ownerDocument.createElementNS(MAIN_NS, 'v');
        cellEl.appendChild(vEl);
      }
      vEl.textContent = '#DIV/0!';
      return;
    }
    cellEl.removeAttribute('t');
    if (!vEl) {
      vEl = cellEl.ownerDocument.createElementNS(MAIN_NS, 'v');
      cellEl.appendChild(vEl);
    }
    vEl.textContent = String(value);
    return;
  }

  // Chaîne : si numérique pure (ex. "5", "69"), stocker en nombre comme dans Excel pour que COUNTIF fonctionne à 100%
  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    cellEl.removeAttribute('t');
    if (!vEl) {
      vEl = cellEl.ownerDocument.createElementNS(MAIN_NS, 'v');
      cellEl.appendChild(vEl);
    }
    vEl.textContent = String(Number(trimmed));
    return;
  }

  // Sinon partager dans sharedStrings.xml
  const idx = sharedStringsCtx.getOrAdd(trimmed);
  cellEl.setAttribute('t', 's');
  if (!vEl) {
    vEl = cellEl.ownerDocument.createElementNS(MAIN_NS, 'v');
    cellEl.appendChild(vEl);
  }
  vEl.textContent = String(idx);
}

function setCellFormulaAndCache(sheetDoc, sheetData, cellRef, formulaText, cachedVal, sharedStringsCtx) {
  const { row } = splitRef(cellRef);
  const rowEl = getOrCreateRow(sheetData, row);
  const cellEl = getOrCreateCell(rowEl, cellRef);
  let fEl = cellEl.getElementsByTagNameNS(MAIN_NS, 'f')[0];
  if (!fEl) {
    fEl = sheetDoc.createElementNS(MAIN_NS, 'f');
    cellEl.insertBefore(fEl, cellEl.firstChild);
  }
  fEl.textContent = formulaText;
  setCellValueRaw(cellEl, cachedVal, sharedStringsCtx, { clearFormula: false });
}

function updateCachedCellIfExists(sheetData, cellRef, value, sharedStringsCtx, clearFormula = false) {
  const { row } = splitRef(cellRef);
  const rowEl = getOrCreateRow(sheetData, row);
  const cellEl = getOrCreateCell(rowEl, cellRef);
  setCellValueRaw(cellEl, value, sharedStringsCtx, { clearFormula });
}

function createSharedStringsContext(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const root = doc.documentElement;
  const strings = [];
  const indexMap = new Map();

  const sis = root.getElementsByTagNameNS(MAIN_NS, 'si');
  for (let i = 0; i < sis.length; i++) {
    const ts = sis[i].getElementsByTagNameNS(MAIN_NS, 't');
    let text = '';
    for (let j = 0; j < ts.length; j++) {
      text += ts[j].textContent || '';
    }
    strings.push(text);
    if (!indexMap.has(text)) {
      indexMap.set(text, i);
    }
  }

  let totalAdded = 0;
  return {
    strings,
    getOrAdd(str) {
      if (indexMap.has(str)) return indexMap.get(str);
      const newIdx = strings.length;
      strings.push(str);
      indexMap.set(str, newIdx);
      const si = doc.createElementNS(MAIN_NS, 'si');
      const t = doc.createElementNS(MAIN_NS, 't');
      if (str.startsWith(' ') || str.endsWith(' ')) {
        t.setAttribute('xml:space', 'preserve');
      }
      t.textContent = str;
      si.appendChild(t);
      root.appendChild(si);
      totalAdded += 1;
      return newIdx;
    },
    serialize() {
      const uniqueCount = strings.length;
      const oldCount = Number(root.getAttribute('count') || uniqueCount);
      root.setAttribute('uniqueCount', String(uniqueCount));
      root.setAttribute('count', String(oldCount + totalAdded));
      return new XMLSerializer().serializeToString(doc);
    },
  };
}

function updateSaisieSheetXml(xmlString, rows, sharedStringsCtx) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const sheetData = doc.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0];
  const row15Template = getOrCreateRow(sheetData, 15);

  const colsOrder = [
    ['A', 'match', '55'],
    ['B', 'rotation', '56'],
    ['C', 'setter', '56'],
    ['D', 'service', '56'],
    ['E', 'zoneR', '56'],
    ['F', 'qualiteR', '56'],
    ['G', 'zoneP', '56'],
    ['H', 'baseOff', '56'],
    ['I', 'distribP', '56'],
    ['J', 'joueur', '56'],
    ['K', 'resAtt', '56'],
  ];

  // Indexer les lignes existantes pour accès O(1)
  const existingRows = sheetData.getElementsByTagNameNS(MAIN_NS, 'row');
  const rowMap = new Map();
  let maxExistingRow = 15;
  for (let i = 0; i < existingRows.length; i++) {
    const rNum = Number(existingRows[i].getAttribute('r'));
    rowMap.set(rNum, existingRows[i]);
    if (rNum > maxExistingRow) maxExistingRow = rNum;
  }

  const normRows = rows.map((r, i) => normalizeRow(r, i));

  // Écrire les lignes saisies à partir de la ligne 15
  normRows.forEach((rowObj, idx) => {
    const rNum = 15 + idx;
    const rowEl = rowMap.get(rNum) || getOrCreateRow(sheetData, rNum, row15Template);
    colsOrder.forEach(([colLetter, field, defStyle]) => {
      const cellEl = getOrCreateCell(rowEl, `${colLetter}${rNum}`, defStyle);
      setCellValueRaw(cellEl, rowObj[field], sharedStringsCtx, { clearFormula: true });
    });
  });

  // Nettoyer les anciennes données au-delà de la dernière ligne
  const clearStart = 15 + normRows.length;
  for (let rNum = clearStart; rNum <= maxExistingRow; rNum++) {
    const rowEl = rowMap.get(rNum);
    if (!rowEl) continue;
    const cells = rowEl.getElementsByTagNameNS(MAIN_NS, 'c');
    for (let j = 0; j < cells.length; j++) {
      const ref = cells[j].getAttribute('r') || '';
      const { col } = splitRef(ref);
      if (col.length === 1 && col >= 'A' && col <= 'K') {
        setCellValueRaw(cells[j], '', sharedStringsCtx, { clearFormula: true });
      }
    }
  }

  // Mettre à jour les valeurs en cache des compteurs O15..AH27 (+1 pour la ligne légende B2:K14 exactement comme Excel COUNTIF(B:B, B2))
  const summary = computeSaisieSummary(normRows);
  const rotKeys = ['1', '2', '3', '4', '5', '6'];
  rotKeys.forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `P${15 + i}`, (summary.rotCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['3', '6', '8', 'NP'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `R${15 + i}`, (summary.setterCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['S', 'F', 'T', 'C'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `T${15 + i}`, (summary.serviceCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `V${15 + i}`, (summary.zoneRCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['#', '+', '0', '!', '-', 'Err'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `X${15 + i}`, (summary.qualiteRCounts[k] || 0) + 1, sharedStringsCtx);
  });

  const zpKeys = ['1', '6', '5', '7', '8', '8A', '8C', '9', '2', '3', '3A', '3C', '4'];
  zpKeys.forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `Z${15 + i}`, (summary.zonePCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['1', '2', '7', '0'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `AB${15 + i}`, (summary.baseOffCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['1', '1C', '2', '7', '3', '4', '5', '6', '10', '8', '9', 'PM'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `AD${15 + i}`, (summary.distribPCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['#', '+', '0', '/', 'Err'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `AF${15 + i}`, (summary.resAttCounts[k] || 0) + 1, sharedStringsCtx);
  });
  ['1', '2', '3', '4', '6', '7', '8', '10', '16', '21', '29', '33', '69'].forEach((k, i) => {
    updateCachedCellIfExists(sheetData, `AH${15 + i}`, (summary.joueurCounts[k] || 0) + 1, sharedStringsCtx);
  });

  // Mettre à jour les caches des deux schémas droite de saisie (BH32, BZ32, etc.)
  const totalZonePWithLegend = summary.totalZoneP + 13;
  const totalDistWithLegend = summary.totalMiniDist + 12;
  updateCachedCellIfExists(sheetData, 'BH32', totalZonePWithLegend, sharedStringsCtx);
  updateCachedCellIfExists(sheetData, 'BZ32', totalDistWithLegend, sharedStringsCtx);

  return new XMLSerializer().serializeToString(doc);
}

function updateDistBlockInSheet(
  doc,
  sheetData,
  startColIdx,
  topRowStart,
  gridData,
  sharedStringsCtx,
  visibleFrontKeys = ['EN2', 'FIX_ARR', 'FIX_AV', 'DECA', 'EN4']
) {
  // topRowStart = 8 pour Bande 1, 46 pour Bande 3, 65 pour Bande 4, 84 pour Bande 5, 103 pour Bande 6, 122 pour Bande 7
  const rQBack = topRowStart + 1; // 9
  const rDisBack = topRowStart + 2; // 10
  const rEffBack = topRowStart + 3; // 11

  const rQFront = topRowStart + 7; // 15
  const rDisFront = topRowStart + 8; // 16
  const rEffFront = topRowStart + 9; // 17
  const rTotal = topRowStart + 10; // 18

  const col = (offset) => idxToCol(startColIdx + offset);
  const z = gridData.zones;

  const backSpecs = [
    ['EN1', 2],
    ['PIPE', 8],
    ['autres', 14],
  ];

  backSpecs.forEach(([key, off]) => {
    const zd = z[key];
    updateCachedCellIfExists(sheetData, `${col(off)}${rQBack}`, zd.q, sharedStringsCtx);
    updateCachedCellIfExists(
      sheetData,
      `${col(off)}${rDisBack}`,
      zd.dis !== null ? zd.dis : '#DIV/0!',
      sharedStringsCtx
    );
    updateCachedCellIfExists(sheetData, `${col(off)}${rEffBack}`, zd.hash, sharedStringsCtx);
    updateCachedCellIfExists(
      sheetData,
      `${col(off + 1)}${rEffBack}`,
      zd.eff !== null ? zd.eff : '#DIV/0!',
      sharedStringsCtx
    );
  });

  const frontSpecs = [
    ['EN2', 2],
    ['FIX_ARR', 5],
    ['FIX_AV', 8],
    ['DECA', 11],
    ['EN4', 14],
  ];

  frontSpecs.forEach(([key, off]) => {
    if (!visibleFrontKeys.includes(key)) return;
    const zd = z[key];
    updateCachedCellIfExists(sheetData, `${col(off)}${rQFront}`, zd.q, sharedStringsCtx);
    updateCachedCellIfExists(
      sheetData,
      `${col(off)}${rDisFront}`,
      zd.dis !== null ? zd.dis : '#DIV/0!',
      sharedStringsCtx
    );
    updateCachedCellIfExists(sheetData, `${col(off)}${rEffFront}`, zd.hash, sharedStringsCtx);
    updateCachedCellIfExists(
      sheetData,
      `${col(off + 1)}${rEffFront}`,
      zd.eff !== null ? zd.eff : '#DIV/0!',
      sharedStringsCtx
    );
  });

  updateCachedCellIfExists(sheetData, `${col(5)}${rTotal}`, gridData.totalActions, sharedStringsCtx);
  updateCachedCellIfExists(sheetData, `${col(12)}${rTotal}`, gridData.actionsHash, sharedStringsCtx);
  updateCachedCellIfExists(
    sheetData,
    `${col(15)}${rTotal}`,
    gridData.effGlobal !== null ? gridData.effGlobal : '#DIV/0!',
    sharedStringsCtx
  );
}

function updateOrgaBlockInSheet(sheetData, startColIdx, orgaData, sharedStringsCtx) {
  const col = (offset) => idxToCol(startColIdx + offset);

  // BASE 0 : cols +6..+10, rows 28 (Q) & 29 (#), header R25 (+9), R26 (+7, +9)
  orgaData.base0.cols.forEach((cObj, i) => {
    updateCachedCellIfExists(sheetData, `${col(6 + i)}28`, cObj.q, sharedStringsCtx);
    updateCachedCellIfExists(sheetData, `${col(6 + i)}29`, cObj.hash, sharedStringsCtx);
  });
  updateCachedCellIfExists(sheetData, `${col(7)}26`, orgaData.base0.q, sharedStringsCtx);
  updateCachedCellIfExists(
    sheetData,
    `${col(9)}25`,
    orgaData.base0.pctBase !== null ? orgaData.base0.pctBase : '#DIV/0!',
    sharedStringsCtx
  );
  updateCachedCellIfExists(
    sheetData,
    `${col(9)}26`,
    orgaData.base0.pctHash !== null ? orgaData.base0.pctHash : '#DIV/0!',
    sharedStringsCtx
  );

  // BASE 2 (+1..+5), BASE 1 (+6..+10), BASE 7 (+11..+15)
  const lowerBases = [
    [orgaData.base2, 1],
    [orgaData.base1, 6],
    [orgaData.base7, 11],
  ];
  lowerBases.forEach(([bObj, baseOffCol]) => {
    bObj.cols.forEach((cObj, i) => {
      updateCachedCellIfExists(sheetData, `${col(baseOffCol + i)}35`, cObj.q, sharedStringsCtx);
      updateCachedCellIfExists(sheetData, `${col(baseOffCol + i)}36`, cObj.hash, sharedStringsCtx);
    });
    updateCachedCellIfExists(sheetData, `${col(baseOffCol + 1)}33`, bObj.q, sharedStringsCtx);
    updateCachedCellIfExists(
      sheetData,
      `${col(baseOffCol + 3)}32`,
      bObj.pctBase !== null ? bObj.pctBase : '#DIV/0!',
      sharedStringsCtx
    );
    updateCachedCellIfExists(
      sheetData,
      `${col(baseOffCol + 3)}33`,
      bObj.pctHash !== null ? bObj.pctHash : '#DIV/0!',
      sharedStringsCtx
    );
  });

  updateCachedCellIfExists(sheetData, `${col(5)}37`, orgaData.totalActions, sharedStringsCtx);
  updateCachedCellIfExists(sheetData, `${col(12)}37`, orgaData.actionsHash, sharedStringsCtx);
  updateCachedCellIfExists(
    sheetData,
    `${col(15)}37`,
    orgaData.effGlobal !== null ? orgaData.effGlobal : '#DIV/0!',
    sharedStringsCtx
  );
}

function updateSetterSheetXml(xmlString, filteredRows, sharedStringsCtx) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const sheetData = doc.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0];
  const stats = computeSetterSheetStats(filteredRows);

  const rotKeys = ['P1', 'P6', 'P5', 'P4', 'P3', 'P2'];
  const startCols6 = [0, 18, 36, 54, 72, 90];

  // Bande 1 & Bande 2
  rotKeys.forEach((rotKey, idx) => {
    updateDistBlockInSheet(doc, sheetData, startCols6[idx], 8, stats.band1[rotKey], sharedStringsCtx);
    updateOrgaBlockInSheet(sheetData, startCols6[idx], stats.band2[rotKey], sharedStringsCtx);
  });

  // Bande 3 : GLOBAL (0), BASE_1 (17), BASE_2 (35), BASE_7 (53), BASE_0 (71)
  const band3Specs = [
    [0, stats.band3.GLOBAL, ['EN2', 'FIX_ARR', 'FIX_AV', 'DECA', 'EN4']],
    [17, stats.band3.BASE_1, ['EN2', 'FIX_AV', 'EN4']],
    [35, stats.band3.BASE_2, ['EN2', 'FIX_ARR', 'EN4']],
    [53, stats.band3.BASE_7, ['EN2', 'DECA', 'EN4']],
    [71, stats.band3.BASE_0, ['EN2', 'EN4']],
  ];
  band3Specs.forEach(([startCol, grid, visibleFront]) => {
    updateDistBlockInSheet(doc, sheetData, startCol, 46, grid, sharedStringsCtx, visibleFront);
  });

  // Corriger les quelques formules Excel manuelles qui comportaient des coquilles dans le modèle original
  // afin que le recalcul Excel corresponde à 100 % aux tableaux de l'app :
  setCellFormulaAndCache(
    doc,
    sheetData,
    'AD56',
    'T49+Z49+AF49+T55+Z55+AF55',
    stats.band3.BASE_1.actionsHash,
    sharedStringsCtx
  );
  setCellFormulaAndCache(
    doc,
    sheetData,
    'AX53',
    'D35+V35+AN35+BF35+BX35+CP35',
    stats.band3.BASE_2.zones.EN4.q,
    sharedStringsCtx
  );
  setCellFormulaAndCache(
    doc,
    sheetData,
    'AV56',
    'AL49+AR49+AX49+AL55+AO55+AX55',
    stats.band3.BASE_2.actionsHash,
    sharedStringsCtx
  );
  setCellFormulaAndCache(
    doc,
    sheetData,
    'BV53',
    'G28+Y28+AQ28+BI28+CA28+CS28',
    stats.band3.BASE_0.zones.EN2.q,
    sharedStringsCtx
  );
  setCellFormulaAndCache(
    doc,
    sheetData,
    'BY56',
    'BV47+CB47+CH47+BV53+CH53',
    stats.band3.BASE_0.totalActions,
    sharedStringsCtx
  );

  // Bande 4 : Réception Gauche / Centre / Droite
  [stats.band4.GAUCHE, stats.band4.CENTRE, stats.band4.DROITE].forEach((grid, idx) => {
    updateDistBlockInSheet(doc, sheetData, startCols6[idx], 65, grid, sharedStringsCtx);
  });

  // Bande 5 : Situation mini (1, 6, 5)
  [stats.band5.Z1, stats.band5.Z6, stats.band5.Z5].forEach((grid, idx) => {
    updateDistBlockInSheet(doc, sheetData, startCols6[idx], 84, grid, sharedStringsCtx);
  });

  // Bande 6 : Situation moyenne (9, 8A, 8, 8C, 7)
  [stats.band6.Z9, stats.band6.Z8A, stats.band6.Z8, stats.band6.Z8C, stats.band6.Z7].forEach(
    (grid, idx) => {
      updateDistBlockInSheet(doc, sheetData, startCols6[idx], 103, grid, sharedStringsCtx);
    }
  );

  // Bande 7 : Bonne situation (2, 3A, 3, 3C, 4)
  [stats.band7.Z2, stats.band7.Z3A, stats.band7.Z3, stats.band7.Z3C, stats.band7.Z4].forEach(
    (grid, idx) => {
      updateDistBlockInSheet(doc, sheetData, startCols6[idx], 122, grid, sharedStringsCtx);
    }
  );

  return new XMLSerializer().serializeToString(doc);
}

export async function exportWorkbookIdenticalToOriginal(rows, sheetConfigs = []) {
  const resp = await fetch('/template_original.xlsx');
  if (!resp.ok) {
    throw new Error('Impossible de charger le modèle Excel original.');
  }
  const buffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const sharedXml = await zip.file('xl/sharedStrings.xml').async('string');
  const sharedCtx = createSharedStringsContext(sharedXml);

  // 1. Mettre à jour sheet1.xml (saisie)
  const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml', updateSaisieSheetXml(sheet1Xml, rows, sharedCtx));

  // 2. Préparer xl/workbook.xml, xl/_rels/workbook.xml.rels et [Content_Types].xml
  const parser = new DOMParser();
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const wbDoc = parser.parseFromString(wbXml, 'application/xml');
  const sheetsEl = wbDoc.getElementsByTagNameNS(MAIN_NS, 'sheets')[0];

  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const relsDoc = parser.parseFromString(relsXml, 'application/xml');
  const relsRoot = relsDoc.documentElement;

  const ctXml = await zip.file('[Content_Types].xml').async('string');
  const ctDoc = parser.parseFromString(ctXml, 'application/xml');
  const ctRoot = ctDoc.documentElement;

  const templateSlots = [
    { id: 'PAUL', rId: 'rId6', sheetId: '2', file: 'xl/worksheets/sheet2.xml' },
    { id: 'MARCUS', rId: 'rId7', sheetId: '3', file: 'xl/worksheets/sheet3.xml' },
    { id: 'PAUL_J123', rId: 'rId8', sheetId: '4', file: 'xl/worksheets/sheet4.xml' },
    { id: 'PAUL_J456', rId: 'rId9', sheetId: '5', file: 'xl/worksheets/sheet5.xml' },
    { id: 'MARCUS_J123', rId: 'rId10', sheetId: '6', file: 'xl/worksheets/sheet6.xml' },
    { id: 'MARCUS_J456', rId: 'rId11', sheetId: '7', file: 'xl/worksheets/sheet7.xml' },
  ];

  // Associer chaque feuille active à un slot existant (ou cloner sheet6.xml sans dessins au-delà de 6)
  const usedSlotRIds = new Set();
  const assignedConfigs = [];
  const remainingSlots = [...templateSlots];

  // Priorité aux IDs d'origine pour garder leurs dessins exacts
  sheetConfigs.forEach((cfg) => {
    const exactIdx = remainingSlots.findIndex((s) => s.id === cfg.id);
    if (exactIdx !== -1) {
      const slot = remainingSlots.splice(exactIdx, 1)[0];
      usedSlotRIds.add(slot.rId);
      assignedConfigs.push({ cfg, slot, isClone: false });
    } else {
      assignedConfigs.push({ cfg, slot: null, isClone: false });
    }
  });

  // Affecter les créneaux libres ou cloner pour les feuilles personnalisées
  const cleanTemplateXml = await zip.file('xl/worksheets/sheet6.xml').async('string');
  let nextExtraSheetNum = 9;
  let nextExtraRIdNum = 20;

  for (const item of assignedConfigs) {
    if (!item.slot) {
      if (remainingSlots.length > 0) {
        const slot = remainingSlots.shift();
        usedSlotRIds.add(slot.rId);
        item.slot = slot;
      } else {
        const sheetNum = nextExtraSheetNum++;
        const rId = `rId${nextExtraRIdNum++}`;
        const file = `xl/worksheets/sheet${sheetNum}.xml`;
        item.slot = { id: item.cfg.id, rId, sheetId: String(sheetNum), file };
        item.isClone = true;

        // Enregistrer dans workbook.xml.rels
        const relEl = relsDoc.createElement('Relationship');
        relEl.setAttribute('Id', rId);
        relEl.setAttribute(
          'Type',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
        );
        relEl.setAttribute('Target', `worksheets/sheet${sheetNum}.xml`);
        relsRoot.appendChild(relEl);

        // Enregistrer dans [Content_Types].xml
        const ovEl = ctDoc.createElement('Override');
        ovEl.setAttribute('PartName', `/xl/worksheets/sheet${sheetNum}.xml`);
        ovEl.setAttribute(
          'ContentType',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
        );
        ctRoot.appendChild(ovEl);
      }
    }

    const filtered = filterRowsForPreset(rows, item.cfg);
    const baseXml = item.isClone ? cleanTemplateXml : await zip.file(item.slot.file).async('string');
    zip.file(item.slot.file, updateSetterSheetXml(baseXml, filtered, sharedCtx));
  }

  // Reconstruire <sheets> dans xl/workbook.xml : saisie + feuilles actives + projet
  const existingSheetNodes = Array.from(sheetsEl.getElementsByTagNameNS(MAIN_NS, 'sheet'));
  const saisieNode = existingSheetNodes.find((n) => n.getAttribute('name') === 'saisie');
  const projetNode = existingSheetNodes.find((n) => n.getAttribute('name') === 'projet');

  while (sheetsEl.firstChild) {
    sheetsEl.removeChild(sheetsEl.firstChild);
  }
  if (saisieNode) sheetsEl.appendChild(saisieNode);

  assignedConfigs.forEach(({ cfg, slot }) => {
    const sNode = wbDoc.createElementNS(MAIN_NS, 'sheet');
    sNode.setAttribute('state', 'visible');
    sNode.setAttribute('name', String(cfg.title || 'Feuille').slice(0, 31));
    sNode.setAttribute('sheetId', slot.sheetId);
    sNode.setAttributeNS(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'r:id',
      slot.rId
    );
    sheetsEl.appendChild(sNode);
  });

  if (projetNode) sheetsEl.appendChild(projetNode);

  // Mettre à jour la plage de filtre auto de saisie dans definedNames
  const definedNames = wbDoc.getElementsByTagNameNS(MAIN_NS, 'definedName');
  for (let i = 0; i < definedNames.length; i++) {
    if (definedNames[i].getAttribute('name') === '_xlnm._FilterDatabase') {
      definedNames[i].textContent = `saisie!$A$1:$K$${Math.max(15, 14 + rows.length)}`;
    }
  }

  // 3. Sauvegarder sharedStrings.xml, workbook.xml, rels & Content_Types
  zip.file('xl/sharedStrings.xml', sharedCtx.serialize());
  zip.file('xl/_rels/workbook.xml.rels', new XMLSerializer().serializeToString(relsDoc));
  zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(ctDoc));

  // 4. Activer fullCalcOnLoad="1" dans xl/workbook.xml pour recalcul immédiat à l'ouverture Excel
  let calcPr = wbDoc.getElementsByTagNameNS(MAIN_NS, 'calcPr')[0];
  if (!calcPr) {
    calcPr = wbDoc.createElementNS(MAIN_NS, 'calcPr');
    wbDoc.documentElement.appendChild(calcPr);
  }
  calcPr.setAttribute('fullCalcOnLoad', '1');
  zip.file('xl/workbook.xml', new XMLSerializer().serializeToString(wbDoc));

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const dateTag = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `distribution_passeur_${dateTag}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importSaisieFromExcelFile(file) {
  const buffer = file.arrayBuffer
    ? await file.arrayBuffer()
    : await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Erreur lecture fichier'));
        reader.readAsArrayBuffer(file);
      });
  const zip = await JSZip.loadAsync(buffer);
  const parser = new DOMParser();

  // Trouver la feuille "saisie" (ou sheet1 par défaut)
  const wbXml = await zip.file('xl/workbook.xml').async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const wbDoc = parser.parseFromString(wbXml, 'application/xml');
  const relsDoc = parser.parseFromString(relsXml, 'application/xml');

  const relMap = new Map();
  const relEls = relsDoc.getElementsByTagName('Relationship');
  for (let i = 0; i < relEls.length; i++) {
    relMap.set(relEls[i].getAttribute('Id'), relEls[i].getAttribute('Target'));
  }

  let targetPath = 'xl/worksheets/sheet1.xml';
  const sheets = wbDoc.getElementsByTagNameNS(MAIN_NS, 'sheet');
  for (let i = 0; i < sheets.length; i++) {
    if ((sheets[i].getAttribute('name') || '').toLowerCase() === 'saisie') {
      const rId = sheets[i].getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id'
      );
      if (rId && relMap.has(rId)) {
        const tgt = relMap.get(rId).replace(/^\//, '');
        targetPath = tgt.startsWith('xl/') ? tgt : `xl/${tgt}`;
      }
      break;
    }
  }

  let sharedStrings = [];
  const ssFile = zip.file('xl/sharedStrings.xml');
  if (ssFile) {
    const ssDoc = parser.parseFromString(await ssFile.async('string'), 'application/xml');
    const sis = ssDoc.getElementsByTagNameNS(MAIN_NS, 'si');
    for (let i = 0; i < sis.length; i++) {
      const ts = sis[i].getElementsByTagNameNS(MAIN_NS, 't');
      let txt = '';
      for (let j = 0; j < ts.length; j++) txt += ts[j].textContent || '';
      sharedStrings.push(txt);
    }
  }

  const sheetFile = zip.file(targetPath);
  if (!sheetFile) {
    throw new Error('Feuille saisie introuvable dans le fichier Excel.');
  }

  const sDoc = parser.parseFromString(await sheetFile.async('string'), 'application/xml');
  const rowEls = sDoc.getElementsByTagNameNS(MAIN_NS, 'row');
  const colToField = {
    A: 'match',
    B: 'rotation',
    C: 'setter',
    D: 'service',
    E: 'zoneR',
    F: 'qualiteR',
    G: 'zoneP',
    H: 'baseOff',
    I: 'distribP',
    J: 'joueur',
    K: 'resAtt',
  };

  const imported = [];
  for (let i = 0; i < rowEls.length; i++) {
    const rNum = Number(rowEls[i].getAttribute('r'));
    if (rNum < 15) continue;

    const rowObj = {
      id: imported.length + 1,
      match: '',
      rotation: '',
      setter: '',
      service: '',
      zoneR: '',
      qualiteR: '',
      zoneP: '',
      baseOff: '',
      distribP: '',
      joueur: '',
      resAtt: '',
    };

    const cells = rowEls[i].getElementsByTagNameNS(MAIN_NS, 'c');
    let hasValue = false;
    for (let j = 0; j < cells.length; j++) {
      const ref = cells[j].getAttribute('r') || '';
      const { col } = splitRef(ref);
      const field = colToField[col];
      if (!field) continue;

      const t = cells[j].getAttribute('t') || '';
      let val = '';
      if (t === 'inlineStr') {
        const isEl = cells[j].getElementsByTagNameNS(MAIN_NS, 'is')[0];
        val = isEl ? isEl.textContent || '' : '';
      } else {
        const vEl = cells[j].getElementsByTagNameNS(MAIN_NS, 'v')[0];
        val = vEl ? vEl.textContent || '' : '';
        if (t === 's' && val !== '') {
          val = sharedStrings[Number(val)] ?? '';
        } else if (val.endsWith('.0')) {
          val = val.slice(0, -2);
        }
      }

      rowObj[field] = normalizeCode(val, field) || val.trim();
      if (rowObj[field]) hasValue = true;
    }

    if (hasValue) {
      imported.push(normalizeRow(rowObj, imported.length));
    }
  }

  return imported;
}
