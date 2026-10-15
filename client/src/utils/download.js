// ============================================================================
// Téléchargement de fichiers générés par le navigateur (bilans, exports).
// ============================================================================

/** Déclenche le téléchargement d'un texte (CSV, JSON…) côté navigateur. */
export function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return false;
  // BOM UTF-8 : Excel ouvre alors correctement les accents.
  const blob = new Blob([`﻿${text}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
  return true;
}

/**
 * Génère un CSV (séparateur `;`, convention Excel FR) à partir de lignes.
 * @param {string[][]} rows
 */
export function rowsToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? '' : String(cell);
          return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(';')
    )
    .join('\n');
}

/** Importe l'effet "imprimer / PDF" (feuille @media print dédiée). */
export function printPage() {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false;
  window.print();
  return true;
}
