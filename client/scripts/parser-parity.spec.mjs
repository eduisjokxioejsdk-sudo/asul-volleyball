// Test de PARITÉ client ↔ serveur : le parseur du client
// (client/src/utils/datavolley.js) et son miroir serveur
// (server/src/datavolleyCode.js) doivent produire EXACTEMENT les mêmes résultats.
// Garantit qu'ils ne divergent pas au fil des évolutions.
// Exécution : node client/scripts/parser-parity.spec.mjs
import { createRequire } from 'module';
import * as client from '../src/utils/datavolley.js';

const require = createRequire(import.meta.url);
const server = require('../../server/src/datavolleyCode.js');

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

const CODES = [
  // actions de base
  '*04SM17#', '*08S=', '*06R#', 'a12R+', '*09A4#', '*05B=', '*02D#', '*07E+', '*11F+',
  // alias de type
  '*04SF#', '*04SS#', '*09AP4#', '*09A45B#',
  // joueur 1 chiffre (normalisation)
  '*1A#', 'a9R-',
  // combinaisons d'attaque
  '*09AX1#', '*09AXP#', '*11AV66/', '*05AX15#', 'a03ACB#',
  // appels passeur
  '*07EK1#', 'a08EKP=',
  // formules combinées
  'a04SM.06#', '*23S.10-',
  // invalides
  '*', '*09X#', '*09A', '*09AZ#', '*08F',
  // clé d'équipe omise (domicile implicite)
  '12S#', '1A#', '7E+', '05AV66.12#', '12S.10+',
];

console.log('\n== Parité decomposeCode ==');
for (const code of CODES) {
  const a = JSON.stringify(client.decomposeCode(code));
  const b = JSON.stringify(server.decomposeCode(code));
  check(`decomposeCode ${code}`, a === b);
}

console.log('\n== Parité isValidCode ==');
for (const code of CODES) {
  check(`isValidCode ${code}`, client.isValidCode(code) === server.isValidCode(code));
}

console.log('\n== Parité formatCode ==');
for (const code of CODES) {
  const fields = client.decomposeCode(code);
  const a = client.formatCode(fields);
  const b = server.formatCode(fields);
  check(`formatCode ${code}`, a === b);
}

console.log('\n== Parité expandSequence (formules combinées) ==');
const SEQ = ['a04SM.06#', '*23S.10-', '*05AV66.12#', '*05AV66.12D#', '*09A#a10R+', '12S.10+', '05AV66.12#'];
for (const seq of SEQ) {
  const a = JSON.stringify(client.parseSequence(seq).map((x) => x.code));
  const b = JSON.stringify(server.expandSequence(seq));
  check(`expandSequence ${seq}`, a === b);
}

console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
