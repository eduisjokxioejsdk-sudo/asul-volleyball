// Vérifie qu'aucun « setter » (setXxx) ni composant n'est utilisé sans être
// déclaré dans le fichier. C'est la classe de bug qui produit une page noire :
// une référence supprimée quelque part (ex. setShowKeypad) ne casse pas la
// compilation, seulement l'exécution — et parfois seulement au clic.
//
// Usage : node scripts/check-scope.cjs
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

/** Noms déclarés quelque part dans le fichier (imports, variables, fonctions, paramètres). */
function declaredNames(src) {
  const names = new Set();
  const add = (n) => { if (n && /^[A-Za-z_$][\w$]*$/.test(n)) names.add(n); };

  // Imports (nom par défaut, namespace, liste nommée, alias)
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)?\s*(,\s*\{([\s\S]*?)\})?\s*from\s*['"][^'"]+['"]/g)) {
    add(m[1]);
    if (m[3]) m[3].split(',').map((s) => s.trim()).filter(Boolean).forEach((e) => add((e.split(/\s+as\s+/)[1] || e.split(/\s+as\s+/)[0]).trim()));
  }
  for (const m of src.matchAll(/import\s*\*?\s*as\s+([A-Za-z_$][\w$]*)\s+from/g)) add(m[1]);
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((e) => add((e.split(/\s+as\s+/)[1] || e.split(/\s+as\s+/)[0]).trim()));
  }

  // Déclarations de variables (y compris déstructuration, même partielle)
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]/g)) {
    m[1].split(',').map((s) => s.trim().split('=')[0].trim()).forEach(add);
  }
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([\s\S]*?)\}\s*(?:=|\))/g)) {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .map((s) => {
        const parts = s.split(':');
        const name = (parts.length > 1 ? parts[1] : parts[0]).trim().replace(/=.*$/, '').trim();
        return name;
      })
      .forEach(add);
  }

  // Fonctions / classes / paramètres (y compris paramètres déstructurés)
  const addParams = (raw) => {
    raw
      .replace(/[{}[\]]/g, ',')
      .split(',')
      .map((p) => p.trim().split('=')[0].split(':')[0].trim())
      .forEach(add);
  };
  for (const m of src.matchAll(/(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);
  // Paramètres : on tolère un niveau de parenthèses (valeurs par défaut `() => ''`).
  const PARAMS = String.raw`\(((?:[^()]|\([^()]*\))*)\)`;
  for (const m of src.matchAll(new RegExp(`function\\s*[A-Za-z_$]*\\s*${PARAMS}`, 'g'))) addParams(m[1]);
  for (const m of src.matchAll(new RegExp(`${PARAMS}\\s*=>`, 'g'))) addParams(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) add(m[1]);
  for (const m of src.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1]);

  return names;
}

/** Identifiants « à risque » : setters React (setXxx) appelés ou passés sans
 *  passer par un objet (localStorage.setItem, x.setMap… sont exclus).
 *  C'est exactement la classe de bug qui produit une page noire (référence
 *  supprimée lors d'un refactor) ou un plantage au clic. */
function riskyReferences(src) {
  const found = new Map();
  for (const m of src.matchAll(/(?<![.\w$?])set[A-Z][\w$]*\b(?!\s*:)/g)) {
    if (BUILTIN_SETTERS.has(m[0])) continue;
    if (!found.has(m[0])) found.set(m[0], src.slice(0, m.index).split('\n').length);
  }
  return found;
}

/** Noms qui ressemblent à un setter/fonction mais sont natifs. */
const BUILTIN_SETTERS = new Set([
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'structuredClone',
  'queueMicrotask', 'localeCompare', 'toISOString', 'toUpperCase', 'toLowerCase',
]);

/** Retire commentaires de bloc et de ligne (l'analyse doit voir du code, pas
 *  de la prose : sinon les mots des commentaires passent pour des appels). */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Retire les chaînes de caractères (un « rgba(0,0,0) » dans un style n'est pas
 *  un appel de fonction). */
function stripStrings(src) {
  return src
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/**
 * Mode strict (option --strict) : signale aussi les fonctions locales appelées
 * sans être déclarées (ex. « rotateTeam(…) » supprimé par erreur), en se
 * limitant aux noms camelCase pour éviter le bruit du texte français.
 */
function strictReferences(src) {
  const found = new Map();
  for (const m of src.matchAll(/(?<![.\w$?])([a-z][a-z0-9]*[A-Z][\w$]*)\s*\(/g)) {
    if (BUILTIN_SETTERS.has(m[1])) continue;
    if (!found.has(m[1])) found.set(m[1], src.slice(0, m.index).split('\n').length);
  }
  return found;
}

const STRICT = process.argv.includes('--strict');

let total = 0;
for (const file of walk(SRC)) {
  const raw = fs.readFileSync(file, 'utf8');
  // Les déclarations sont cherchées dans le code complet (les chemins d'import
  // sont entre guillemets) ; les références, dans le code expurgé.
  const code = stripComments(raw);
  const src = stripStrings(code);
  const declared = new Set([...declaredNames(code), ...declaredNames(src)]);
  const refs = new Map([...riskyReferences(src), ...(STRICT ? strictReferences(src) : [])]);
  for (const [name, line] of refs) {
    if (!declared.has(name)) {
      total += 1;
      console.log(`${path.relative(SRC, file)}:${line} — « ${name} » utilisé mais jamais déclaré (page noire au rendu ou au clic)`);
    }
  }
}

if (total === 0) {
  console.log('OK — aucun setter/nom à risque utilisé sans déclaration.');
} else {
  console.log(`\n${total} problème(s) : l'écran concerné plantera à l'exécution.`);
  process.exitCode = 1;
}
