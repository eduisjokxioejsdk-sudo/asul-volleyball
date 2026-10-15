// Vérifie l'enregistrement du flux caméra sur disque (server/src/liveRecord.js).
// Exécution : node server/scripts/live-record.spec.mjs
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'asul-live-'));
process.env.DATA_DIR = tmp;

const liveRecord = require('../src/liveRecord.js');

let failures = 0;
function check(label, cond) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

console.log('\n== Extension selon le type MIME ==');
check('webm', liveRecord.extForMime('video/webm;codecs=vp8') === 'webm');
check('mp4', liveRecord.extForMime('video/mp4') === 'mp4');
check('inconnu → webm', liveRecord.extForMime('') === 'webm');

console.log('\n== Enregistrement ==');
const rec = liveRecord.startRecording('sess1', { mimeType: 'video/webm' });
check('démarré', liveRecord.isRecording('sess1') && rec.ext === 'webm');
liveRecord.writeRecordingChunk('sess1', Buffer.from('hello'));
liveRecord.writeRecordingChunk('sess1', Buffer.from(' world'));
const info = liveRecord.recordingInfo('sess1');
check('octets comptés', info.bytes === 11);
check('horodatage de départ', Number.isFinite(info.startedAt) && info.startedAt > 0);

const meta = await liveRecord.stopRecording('sess1');
check('arrêt : métadonnées', !!meta && meta.bytes === 11 && meta.ext === 'webm');
check('enregistrement terminé', !liveRecord.isRecording('sess1'));
check('fichier écrit sur disque', fs.existsSync(meta.path));
check('contenu correct', fs.readFileSync(meta.path, 'utf8') === 'hello world');

console.log('\n== Redémarrage (écretête le fichier précédent) ==');
liveRecord.startRecording('sess1', { mimeType: 'video/webm' });
liveRecord.writeRecordingChunk('sess1', Buffer.from('X'));
const meta2 = await liveRecord.stopRecording('sess1');
check('nouveau contenu', fs.readFileSync(meta2.path, 'utf8') === 'X');
check('arrêt sans enregistrement → null', (await liveRecord.stopRecording('absent')) === null);

fs.removeSync(tmp);
console.log(failures === 0 ? '\nTOUT EST OK\n' : `\n${failures} ÉCHEC(S)\n`);
process.exit(failures === 0 ? 0 : 1);
