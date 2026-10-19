// Vérifie qu'aucune valeur n'est utilisée AVANT sa déclaration (« zone morte
// temporelle »). C'est la classe de bug qui produit une page noire : une
// fonction passée en dépendance d'un hook, ou appelée dans un useMemo, alors
// qu'elle est déclarée plus bas avec const/let — React plante au rendu.
//
// Usage : node scripts/check-order.cjs
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Retire commentaires et chaînes (on veut voir du code, pas de la prose). */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

const HOOKS_IMMEDIATE = /(useMemo|useState|useRef|useReducer)\s*\(/g; // le corps s'exécute au rendu
const HOOKS_DEFERRED = /(useCallback|useEffect|useLayoutEffect|useImperativeHandle)\s*\(/g; // tableau de dépendances évalué au rendu

/** Index de la parenthèse fermant celle ouverte à `open`. */
function matchParen(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Déclarations const/let du fichier, avec leur indentation et leur ligne. */
function declarations(src) {
  const lineAt = (index) => src.slice(0, index).split('\n').length;
  const add = (map, name, index, indent) => {
    if (!map.has(name)) map.set(name, { line: lineAt(index), indent });
  };
  const top = new Map();
  const all = new Map();
  const indentOf = (index) => {
    const start = src.lastIndexOf('\n', index) + 1;
    const raw = src.slice(start, index);
    const m = raw.match(/^[ \t]*/);
    return m ? m[0].length : 0;
  };
  /** Indentation de la ligne du mot-clé (le motif peut avaler un espace avant). */
  const keywordIndent = (match) => {
    const at = match.index + match[0].search(/(?:const|let)/);
    return indentOf(at);
  };
  for (const m of src.matchAll(/(?:^|[;{}\s])(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    const indent = keywordIndent(m);
    add(all, m[1], m.index, indent);
    if (indent === 2) add(top, m[1], m.index, indent);
  }
  for (const m of src.matchAll(/(?:^|[;{}\s])(?:const|let)\s*\{([^}]*)\}\s*=/g)) {
    const indent = keywordIndent(m);
    for (const raw of m[1].split(',')) {
      const name = raw.split(':').pop().split('=')[0].trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      add(all, name, m.index, indent);
      if (indent === 2) add(top, name, m.index, indent);
    }
  }
  return { top, all };
}

const KNOWN = new Set([
  'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext',
  'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useNavigate', 'useParams',
  'useLocation', 'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON',
  'Date', 'Promise', 'Map', 'Set', 'RegExp', 'console', 'window', 'document', 'undefined',
  'null', 'true', 'false', 'props', 'this', 'new', 'typeof', 'return', 'function', 'if',
]);

/** Noms reçus en paramètre (props déstructurées comprises) : jamais en zone morte. */
function parameters(src) {
  const names = new Set();
  const add = (raw) => {
    raw
      .replace(/[{}[\]]/g, ',')
      .split(',')
      .map((p) => p.trim().split('=')[0].split(':')[0].trim())
      .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
      .forEach((n) => names.add(n));
  };
  const PARAMS = String.raw`\(((?:[^()]|\([^()]*\))*)\)`;
  for (const m of src.matchAll(new RegExp(`function\\s*[A-Za-z_$]*\\s*${PARAMS}`, 'g'))) add(m[1]);
  for (const m of src.matchAll(new RegExp(`${PARAMS}\\s*=>`, 'g'))) add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  return names;
}

let total = 0;
for (const file of walk(SRC)) {
  const src = strip(fs.readFileSync(file, 'utf8'));
  const { top, all } = declarations(src);
  const params = parameters(src);
  const lineAt = (index) => src.slice(0, index).split('\n').length;
  const problems = new Set();

  const report = (name, index) => {
    if (KNOWN.has(name) || params.has(name)) return;
    const decl = top.get(name);
    if (!decl) return;
    const line = lineAt(index);
    if (decl.line <= line) return;
    // Nom déclaré localement (dans un rappel) avant cet endroit : ce n'est pas
    // la déclaration du composant qui est visée.
    const local = all.get(name);
    if (local && local.indent > 2 && local.line <= line) return;
    const key = `${name}:${line}`;
    if (problems.has(key)) return;
    problems.add(key);
    total += 1;
    console.log(
      `${path.relative(SRC, file)}:${line} — « ${name} » utilisé avant sa déclaration (ligne ${decl.line}) : page noire au rendu`
    );
  };

  // 1. Hooks dont le corps s'exécute pendant le rendu : on inspecte tout le corps.
  for (const m of src.matchAll(HOOKS_IMMEDIATE)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(src, open);
    if (close < 0) continue;
    const body = src.slice(open + 1, close);
    for (const id of body.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)(?!\s*:)/g)) report(id[1], open + 1 + id.index);
  }

  // 2. Hooks différés : le tableau de dépendances, lui, est évalué au rendu.
  for (const m of src.matchAll(HOOKS_DEFERRED)) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(src, open);
    if (close < 0) continue;
    const tail = src.slice(close - 400, close);
    const deps = tail.match(/\[([^[\]]*)\]\s*\)?\s*$/);
    if (!deps) continue;
    for (const id of deps[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)/g)) {
      report(id[1], close - 400 + deps.index + id.index);
    }
  }
}

if (total === 0) {
  console.log('OK — aucune valeur utilisée avant sa déclaration.');
} else {
  console.log(`\n${total} problème(s) : l’écran concerné plantera au rendu.`);
  process.exitCode = 1;
}
