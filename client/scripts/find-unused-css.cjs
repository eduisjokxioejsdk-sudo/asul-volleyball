// Liste les classes CSS déclarées dans src/App.css mais jamais référencées
// dans le code React (className, classList, chaînes, variables, etc.).
//
// Approche volontairement conservative : une classe est signalée uniquement si
// son nom n'apparaît nulle part (mot entier) dans les sources .jsx/.js. Une
// classe utilisée de façon dynamique (`dv-${x}`, concaténations) peut donc être
// signalée à tort : toujours vérifier avant de supprimer.
//
// Usage : node scripts/find-unused-css.cjs
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const CSS_FILE = path.join(SRC, 'App.css');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const css = fs.readFileSync(CSS_FILE, 'utf8');

// Sélecteurs de classe (.foo, .foo:hover, .foo .bar, .foo-2…).
const classes = new Set();
for (const m of css.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
  classes.add(m[1]);
}

// Toute la source React concaténée : une classe dynamique y figure aussi.
const src = walk(SRC)
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

const escape = (s) => s.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&');

const unused = [...classes]
  .filter((name) => !new RegExp(`\\b${escape(name)}\\b`).test(src))
  .sort();

for (const name of unused) console.log(name);

console.error(`\n${unused.length} classe(s) CSS sans référence dans le code (${classes.size} analysées).`);
