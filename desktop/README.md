# ASUL — application Windows (poste statisticien)

Cette application transforme le site ASUL en **application Windows installable**
(`ASUL-Setup-x.y.z.exe`). Le statisticien n'a **rien à installer d'autre** : ni
Node.js, ni ffmpeg. Tout est embarqué (interface, serveur, base SQLite, ffmpeg).

Elle fonctionne de deux façons :

| Mode | Rôle | Usage |
| --- | --- | --- |
| **Hôte** | Ce PC lance le serveur ASUL et stocke les données du match | PC principal de la salle |
| **Rejoindre** | Ce PC se connecte à un poste hôte (aucune donnée locale) | Deuxième statisticien pendant un match en direct |

Chaque statisticien **crée son propre compte** dans l'application (page « Créer un
compte »), que ce soit sur le poste hôte ou depuis un poste qui rejoint le match.

---

## 1. Construire l'installeur

Prérequis (machine de build uniquement) : **Node.js 18+** et une connexion internet
(le premier build télécharge Electron et NSIS).

```powershell
cd desktop
npm install
npm run dist          # → dist\ASUL-Setup-1.0.0.exe
```

`npm run dist` enchaîne :

1. `fetch:ffmpeg` — copie (ou télécharge) `ffmpeg.exe` dans `resources/ffmpeg/` ;
2. `build:client` — construit l'interface React (`client/dist`) ;
3. `electron-builder --win nsis` — produit l'installeur NSIS x64.

Autres commandes utiles :

| Commande | Effet |
| --- | --- |
| `npm start` | Lance l'application en développement (code source, non packagé) |
| `npm start -- --choose-mode` | Force l'écran « Hôte / Rejoindre » |
| `npm run dist:dir` | Construit seulement `dist\win-unpacked` (test rapide, sans installeur) |
| `npx electron . --smoke-test` | **Test d'intégration** : démarre le serveur embarqué et vérifie base SQLite + ffmpeg |
| `npm run fetch:ffmpeg -- --force` | Remplace le ffmpeg embarqué (par ex. par un build plus léger) |

### Contenu de l'installeur

| Élément | Emplacement dans l'application | Source |
| --- | --- | --- |
| Coquille Electron | `resources/app.asar` | `desktop/main.js`, `preload.js`, `splash.html` |
| Interface buildée | `resources/client/dist` | `client/dist` |
| Serveur Node | `resources/server/src` + `server/node_modules` | `server/` |
| ffmpeg | `resources/ffmpeg/ffmpeg.exe` | `desktop/resources/ffmpeg/` |

Poids indicatif : **≈ 230 Mo** (Electron ~100 Mo, ffmpeg ~140 Mo, serveur ~55 Mo,
interface ~1,5 Mo). L'installeur est fortement compressé.

---

## 2. Ce que fait l'installeur

- Installation **par utilisateur**, silencieuse et **sans administrateur** :
  `%LOCALAPPDATA%\Programs\ASUL` (aucun UAC, rien dans `C:\Program Files`).
- Raccourcis **Bureau** et **menu Démarrer**.
- **Aucune modification du pare-feu** : la règle autorisant le port du serveur est
  demandée par l'application, uniquement sur le poste **hôte**, au premier besoin
  (menu **Serveur → Autoriser le match en direct dans le pare-feu…**, ou automatiquement
  quand vous affichez l'adresse pour les autres statisticiens). Une seule élévation, à ce
  moment-là.
- **Les données ne sont jamais supprimées** par une désinstallation ou une mise à jour
  (voir ci-dessous).

> Mise à jour depuis une version 1.0.x installée « pour tous les utilisateurs »
> (`C:\Program Files\ASUL`) : Windows demandera **une fois** une élévation pour la
> désinstaller ; la nouvelle version s'installe ensuite dans votre dossier utilisateur.
> Vous pouvez aussi la désinstaller vous-même avant (Panneau de configuration).

> Première installation sans certificat de signature : Windows SmartScreen peut afficher un
> avertissement → **Informations complémentaires → Exécuter quand même** (voir la section 10
> pour supprimer définitivement ces alertes).

---

## 3. Où sont les données

| Donnée | Emplacement |
| --- | --- |
| Base SQLite (comptes, matchs, annotations) | `%APPDATA%\ASUL\data\asul.db` |
| Vidéos originales | `%APPDATA%\ASUL\data\uploads\` |
| Vidéos découpées / proxy | `%APPDATA%\ASUL\data\uploads\trimmed\` |
| Secret JWT du poste | `%APPDATA%\ASUL\data\jwt-secret.key` |
| Configuration du partage d'équipes (optionnel) | `%APPDATA%\ASUL\data\sync.json` |
| Configuration (mode, port) | `%APPDATA%\ASUL\config.json` |
| Journal du serveur | `%APPDATA%\ASUL\logs\server.log` |

Ces données sont **propres à chaque poste** : un poste « Hôte » stocke tout, un poste
qui « Rejoint » ne stocke rien (ses données sont celles du serveur distant).

### Importer les données d'une installation locale (version web / dépôt)

Si vous utilisiez ASUL en version locale (`start-local.bat`), un script transfère tout
dans l'application : base (comptes, matchs, annotations, équipes) **et** vidéos.

```powershell
cd desktop
# L'application doit être FERMÉE avant de lancer l'import.
npm run import:local -- --copy-media
```

- Sans `--copy-media`, seule la base est importée (les vidéos sont alors signalées comme
  absentes et doivent être copiées depuis l'interface ou le script).
- La base actuelle de l'application est **sauvegardée** au préalable dans
  `%APPDATA%\ASUL\sauvegarde-avant-import-<date>\`.
- Les comptes créés dans l'application sont **conservés** (mêmes e-mails → mot de passe de
  l'application maintenu).
- Les chemins absolus des vidéos sont réécrits vers le dossier de l'application ; les
  références vers des fichiers non copiés (découpes) sont retirées — les découpes se
  régénèrent depuis les segments conservés.
- Options : `--source <dossier>` (défaut : `<dépôt>/server`) et `--target <dossier>`
  (défaut : `%APPDATA%\ASUL\data`).

> Après l'import, utilisez **uniquement l'application** : la version web ouverte en
> parallèle possède sa propre base, les nouvelles statistiques n'y seraient pas partagées.

### Sauvegarde / transfert vers un autre PC

- **Fichier → Ouvrir le dossier des données** : copie manuelle du dossier (recommandé
  pour de très gros volumes de vidéos).
- **Fichier → Sauvegarder les données (ZIP)…** : archive `asul.db` (+ fichiers WAL) et
  `uploads/` dans un fichier ZIP.
- **Fichier → Restaurer une sauvegarde…** : remet l'archive en place puis redémarre
  l'application.

---

## 4. Match en réseau local (plusieurs statisticiens)

1. **Sur le PC hôte** : lancer ASUL → mode « **Ce PC héberge le match** ».
2. Menu **Serveur → Adresse pour les autres statisticiens…** → affiche l'adresse, avec
   les boutons **Copier l'adresse** et **Ouvrir dans le navigateur**.
3. **Sur les autres postes** : lancer ASUL → « **Rejoindre un match** » → saisir
   l'adresse (bouton **Tester la connexion** pour vérifier) → **Démarrer**.
   Le navigateur reste possible : `http://192.168.x.x:3001`.
4. Chaque statisticien **crée son compte** (page de connexion → « Créer un compte »)
   puis code le match en direct : les actions se synchronisent par Socket.IO.

Points d'attention :

- Les deux postes doivent être sur **le même réseau** (Wi-Fi de la salle ou partage de
  connexion Windows du PC hôte).
- Le **PC hôte doit rester allumé** pendant le match (l'application empêche la mise en
  veille de l'écran tant que la fenêtre est ouverte).
- Si le port 3001 est déjà utilisé, l'application en choisit automatiquement un autre :
  l'adresse affichée par le menu Serveur donne toujours le bon port.
- **Changer de mode** : menu **Serveur → Changer de mode (hôte / rejoindre)…**

---

## 5. Raccourcis clavier du poste

| Raccourci | Action |
| --- | --- |
| `Ctrl+Maj+D` | Ouvrir le dossier des données |
| `Ctrl+Maj+S` | Sauvegarder les données (ZIP) |
| `Ctrl+Maj+N` | Adresse pour les autres statisticiens |
| `Ctrl+Maj+R` | Redémarrer le serveur (mode hôte) |
| `Ctrl+R` | Recharger l'interface |
| `F11` | Plein écran |
| `F12` | Outils de développement (diagnostic) |

Les raccourcis de codage (`k`, `j`, `l`, `Entrée`, `Échap`, `F2`…) restent **inchangés** :
la fenêtre Electron transmet les touches exactement comme un navigateur.


---

## 6. Dépannage

| Symptôme | Solution |
| --- | --- |
| Écran « Le serveur ASUL n'a pas répondu dans les temps » | Bouton **Ouvrir le journal** (ou menu **Serveur → Ouvrir le journal du serveur**), vérifier un antivirus trop strict, puis **Réessayer** |
| Le **premier lancement** est plus lent (quelques dizaines de secondes) | Normal : l'antivirus analyse le ffmpeg embarqué (140 Mo). Les lancements suivants sont immédiats ; une exclusion d'antivirus sur `%APPDATA%\ASUL` et `C:\Program Files\ASUL` accélère encore |
| La préparation / découpe des vidéos échoue | Menu **Serveur → État du serveur…** : la ligne `FFmpeg` doit indiquer *disponible* |
| Un autre poste n'arrive pas à se connecter | Vérifier le pare-feu Windows (règle « ASUL (match en direct) »), le même réseau Wi-Fi, et l'adresse affichée par le menu Serveur |
| Mode « Rejoindre » : « Aucun poste ASUL ne répond » | Lancer l'app en mode Hôte sur le PC principal, tester avec **Tester la connexion**, vérifier que le PC hôte n'est pas en veille |
| L'interface s'ouvre blanche | `Ctrl+R` puis consulter le journal ; relancer `npm run dist` si `resources/client/dist` est vide |
| `npm install` / Electron ne se télécharge pas | Certaines politiques npm bloquent les scripts d'installation : `npm install` puis `node node_modules/electron/install.js` |
| Le build plante avec `Cannot find module ...` | Installation npm incomplète : supprimer `node_modules` + `package-lock.json` puis relancer `npm install` |

Diagnostic en un coup d'œil :

```powershell
cd desktop
npx electron . --smoke-test                       # en développement
.\dist\win-unpacked\ASUL.exe --smoke-test         # application packagée
```

Le résultat est affiché dans la console **et** dans `%APPDATA%\ASUL\logs\server.log`
(`[smoke] RÉSULTAT : SUCCÈS` ou `ÉCHEC`).

---

## 7. Notes techniques

- **Serveur** : lancé en **processus fils** avec `ELECTRON_RUN_AS_NODE=1` (Node embarqué
  d'Electron) → un plantage du serveur ne ferme pas l'interface, et le serveur est
  relancé automatiquement (5 tentatives).
- **Chemins** : `server/src/config.js` centralise `DATA_DIR`, `JWT_SECRET` et
  `FFMPEG_PATH`. En mode application, Electron les transmet par l'environnement
  (`DATA_DIR`, `CLIENT_DIST`, `FFMPEG_PATH`).
- **Écoute réseau** : le serveur écoute sur `0.0.0.0` (variable `HOST` dans
  `server/.env.example`).
- **Secret JWT** : généré au premier démarrage et conservé dans le dossier de données
  (`jwt-secret.key`) → les sessions restent valides après une mise à jour.
- **Routes de diagnostic** (non authentifiées) : `GET /api/system/status` et
  `GET /api/system/network-info`.
- **ffmpeg** : build GPL (libx264/aac). La redistribution est autorisée sous réserve de
  respecter la licence GPL ; un build LGPL peut être substitué via
  `npm run fetch:ffmpeg -- --force`.
- **Mises à jour automatiques** : `electron-updater` télécharge l'installeur publié dans
  les Releases GitHub (`latest.yml` + `ASUL-Setup-x.y.z.exe`), affiche la progression dans
  l'interface puis propose « Redémarrer et installer ». Les données (`%APPDATA%\ASUL`) sont
  conservées. Menu **Aide → Rechercher une mise à jour…** pour forcer un contrôle. En
  développement (`npm start`) la recherche est ignorée : elle n'agit que dans
  l'application installée (voir la section 9 pour publier une version).
- **Polices** : l'interface charge Inter/JetBrains Mono depuis Google Fonts ; hors ligne,
  Windows utilise les polices système (aucune fonctionnalité perdue).
- **Une seule instance** : relancer l'application ramène la fenêtre existante au premier
  plan (évite deux serveurs concurrents sur la même base).

---

## 8. Guide rapide (à transmettre aux statisticiens)

1. Installer `ASUL-Setup-x.y.z.exe` (double-clic : l'installation est **silencieuse**, sans
   administrateur, et remplace automatiquement une version précédente).
2. Au premier lancement : choisir **« Ce PC héberge le match »** si vous êtes le poste
   principal, sinon **« Rejoindre un match »** et saisir l'adresse du poste principal.
3. Créer votre compte (nom, e-mail, mot de passe) : chaque statisticien a le sien.
4. Coder le match : onglet **Codage** (clavier) ou **Match en direct** pour le partage
   entre plusieurs postes.
5. Menu **Serveur → Adresse pour les autres statisticiens** pour donner l'adresse aux
   collègues.
6. En fin de match : **Fichier → Sauvegarder les données (ZIP)** pour archiver.

Quand une nouvelle version est publiée, un bandeau **« Mise à jour nécessaire »** apparaît
en haut de l'interface (avec la description des nouveautés) : cliquez **Télécharger et
installer**, puis **Redémarrer et installer**. Sur un poste qui ouvre l'application dans un
navigateur, le bouton **Recharger l'interface** suffit.

---

## 9. Publier une mise à jour

Tout part du fichier **`version.json`** à la racine du dépôt : il porte la version courante,
le lien de téléchargement et **la description des nouveautés** que verront les utilisateurs
(titre + puces, rédigés en français).

```powershell
# 1. Décrire la nouvelle version dans version.json (version, releasedAt, notes[0])
# 2. Synchroniser tous les fichiers de version (interface, serveur, desktop)
cd ..
node scripts/release.mjs            # --check pour seulement contrôler la cohérence

# 3. Construire et publier l'installeur Windows + latest.yml dans GitHub Releases
cd desktop
npm install                         # une fois (electron-updater)
$env:GH_TOKEN = "<jeton GitHub avec le droit repo>"   # machine de build uniquement
npm run dist:publish                # = build:client + electron-builder --win nsis --publish always

# 4. Enregistrer et envoyer le code (met à jour la source et la page de téléchargement)
cd ..
git add -A
git commit -m "Publier la version 1.2.1"
git push
```

Résultat : l'API annonce la nouvelle version (`GET /api/system/version`), les interfaces
ouvertes affichent le bandeau sous 5 minutes (ou au prochain lancement) avec la description
des changements, et les applications Windows installées se mettent à jour et proposent de
redémarrer. La toute première installation reste manuelle (comme aujourd'hui, avec
l'avertissement SmartScreen tant que l'installeur n'est pas signé).

---

## 10. Antivirus, SmartScreen et signature

L'installeur **n'est pas signé numériquement**, et il cumule plusieurs comportements que les
antivirus surveillent :

- binaire inconnu et non signé ;
- installation dans `C:\Program Files` avec élévation administrateur ;
- **création d'une règle de pare-feu** (`netsh advfirewall`) pendant l'installation ;
- exécutables embarqués (ffmpeg « GPL », serveur Node lancé par l'application) ;
- à partir de la 1.2, **téléchargement automatique d'un installeur** (mise à jour) puis exécution.

Le même antivirus gêne les constructions `npm run dist` : si la commande s'arrête sur
`spawn UNKNOWN` ou `7za … Paramètre incorrect`, **relancez-la** (c'est intermittent) ou
excluez le dossier du projet (voir plus bas).

### Solutions immédiates

1. **Version portable — aucune installation, aucun administrateur** :
   `npm run dist:portable` produit une archive à décompresser puis lancer sans installation
   (copiez le dossier où vous voulez : Bureau, clé USB…).
   Les données restent dans `%APPDATA%\ASUL` et sont partagées avec la version installée.
   *La mise à jour automatique est réservée à la version installée (elle installe un installeur).*
2. **Retirer le marqueur « venu d'Internet »** sur l'installeur :
   ```powershell
   Unblock-File "$env:USERPROFILE\Downloads\ASUL-Setup-1.2.1.exe"
   ```
3. **Autoriser ASUL dans Windows Defender** (PowerShell **en administrateur**) :
   ```powershell
   Add-MpPreference -ExclusionPath "C:\Program Files\ASUL"
   Add-MpPreference -ExclusionPath "$env:APPDATA\ASUL"
   Add-MpPreference -ExclusionProcess "ASUL.exe"
   Add-MpPreference -ExclusionPath "C:\Users\<vous>\Documents\Asulv2"   # dossier de travail (constructions)
   ```
   Avec un antivirus tiers (Avast, Kaspersky, Bitdefender, McAfee…), ajoutez les mêmes
   dossiers dans ses « exclusions / exceptions », et débloquez le fichier si l'antivirus
   propose « Restaurer / Autoriser ».
4. **SmartScreen** : « Informations complémentaires » → « Exécuter quand même ».
5. **Signaler un faux positif** (Microsoft et/ou l'éditeur de votre antivirus) en précisant
   le fichier concerné et le nom de la détection :
   <https://www.microsoft.com/wdsi/filesubmission>

### Solution durable : signer l'application

electron-builder signe automatiquement dès qu'un certificat est fourni :

```powershell
$env:CSC_LINK = "C:\certificats\asul.pfx"      # chemin, URL ou base64 du certificat
$env:CSC_KEY_PASSWORD = "mot de passe du pfx"
npm run dist                                    # produit un installeur signé
```

Avec une signature : SmartScreen cesse d'avertir (immédiatement avec un certificat EV, après
quelques téléchargements avec un OV) et la plupart des antivirus ne bloquent plus. Options de
certificat : **Azure Trusted Signing** (≈ 10 €/mois, le plus accessible), **SignPath**
(gratuit pour les projets open source), ou un certificat OV/EV chez une autorité de
certification. Le jeton GitHub de publication (`GH_TOKEN`) est distinct de ce certificat.

### Si les alertes restent trop gênantes

Déjà appliqué depuis la version 1.2.1 (l'installeur est passé de « profil suspect » à
« profil courant ») :

- **installeur sans administrateur** : installation par utilisateur
  (`%LOCALAPPDATA%\Programs\ASUL`, `perMachine: false`, `oneClick: true`) — plus d'élévation,
  rien dans `C:\Program Files` ;
- **règle de pare-feu au lancement** au lieu de l'installation : l'application demande
  l'élévation une seule fois, uniquement quand le poste sert d'**hôte** pour le match en
  direct (l'installeur n'exécute plus `netsh`).

La marche suivante, si nécessaire, est la **signature de code** (section précédente) : c'est
la seule solution qui supprime complètement SmartScreen et les alertes antivirus.
