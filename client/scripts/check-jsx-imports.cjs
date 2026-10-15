// Vérifie que tout composant JSX utilisé est bien importé ou déclaré localement.
//
// Un composant manquant ne casse PAS la compilation (Rollup le traite comme une
// variable globale) : l'erreur n'apparaît qu'à l'exécution et React démonte
// l'écran → page noire. Ce contrôle est donc indispensable.
//
// Usage : node scripts/check-jsx-imports.cjs
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

/** Identifiants disponibles dans le fichier (imports + déclarations). */
function declaredNames(src) {
  const names = new Set();

  // import X from / import X, { a, b as c } from / import * as N from
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)?\s*(,\s*\{([\s\S]*?)\})?\s*from\s*['"][^'"]+['"]/g)) {
    if (m[1]) names.add(m[1]);
    if (m[3]) {
      m[3]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((entry) => {
          const parts = entry.split(/\s+as\s+/);
          names.add((parts[1] || parts[0]).trim());
        });
    }
  }
  for (const m of src.matchAll(/import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);

  // import { ... } from (sans defaut)
  for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g)) {
    m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const parts = entry.split(/\s+as\s+/);
        names.add((parts[1] || parts[0]).trim());
      });
  }

  // Déclarations locales
  for (const m of src.matchAll(/(?:^|[;{}\s])(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([\s\S]*?)\}\s*=/g)) {
    m[1]
      .split(',')
      .map((s) => s.split(':')[0].trim())
      .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n))
      .forEach((n) => names.add(n));
  }
  return names;
}

function checkFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const declared = declaredNames(src);
  const problems = [];

  const report = (name, index) => {
    if (!declared.has(name)) {
      problems.push({ name, line: src.slice(0, index).split('\n').length });
    }
  };

  // Balises JSX : <Composant
  for (const m of src.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) report(m[1], m.index);
  // Icônes passées en valeur d'objet (ex. { key: 'codage', icon: Keyboard })
  for (const m of src.matchAll(/\bicon:\s*([A-Z][\w$]*)/g)) report(m[1], m.index);

  return problems;
}

let total = 0;
for (const file of walk(SRC)) {
  if (file.includes('__probe')) continue;
  const problems = checkFile(file);
  for (const p of problems) {
    total += 1;
    console.log(`${path.relative(SRC, file)}:${p.line} — « ${p.name} » utilisé mais non importé/déclaré`);
  }
}

if (total === 0) {
  console.log('OK — tous les composants JSX sont importés ou déclarés.');
} else {
  console.log(`\n${total} problème(s) : l'écran correspondant affichera une page noire.`);
  process.exitCode = 1;
}
