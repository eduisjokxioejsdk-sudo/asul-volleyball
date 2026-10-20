# ASUL - Analyse Volleyball

Application d'analyse de vidéos de volleyball.

## 🆕 Quoi de neuf — version 3.1.0

- **Liste des actions en accordéon** : un seul point ouvert à la fois, en-tête compact
  (« Point 12 · set 2 · 0:42.5 · 3 actions · ✓/anomalie »), boutons **Tout replier** /
  **Tout déplier**, compteur « N points · N anomalies » et interrupteur **suivre la lecture**.
  Le point lu s'ouvre seul en Consultation, celui de l'action sélectionnée en Correction,
  le dernier point codé en Saisie. Une seule zone de défilement par écran : la liste ne
  s'écrase plus, même avec un match entier.
- **Directions d'attaque à 2 clics** : nouveau terrain de saisie (zone de départ puis zone
  d'arrivée, flèche d'aperçu), en Saisie et en Correction. Les directions restent écrites
  dans les champs **start_zone / end_zone** existants : **aucun match déjà codé n'est
  modifié** et l'export `.dvw` contient le code avec les deux zones.
- **Fenêtre d'analyse « Directions »** : tableau croisé départ × arrivée (agrégat
  « 4 → 5 ») et terrain à flèches ; un clic sur une cellule filtre la liste des actions.
- **Filtres Rotation (1–6) et Situation (+ / 0 / −)** en Consultation et en Analyse.
  Une attaque après une réception négative est classée « − ».
- **Contrôles de codes enrichis** (avertissements, jamais bloquants) : joueur absent du six,
  serveur attendu, remplacement sans sortant, attaque / service sans direction, point non
  clos en fin de set, set manquant — avec compteurs par type et filtre
  **erreurs / avertissements / tout**.
- **Toutes les feuilles d'analyse dans le menu de gauche** : Synthèse, Service, Réception,
  Attaque, Combinaisons, Contre, Défense/Passe, Zones, Situations, Rotations, Classements,
  Par set, Joueurs, Directions, Points et Distribution. L'onglet suit le menu sans
  remonter le composant.
- **Bouton « Sync » retiré** de la barre de codage : la synchronisation reste accessible
  en Correction (« Caler ici », « Synchronisation… », marges) et la fenêtre se ferme par
  **Échap**.

---

## ✨ Fonctions principales

- **Codage DataVolley** : actions `S R A B D E F`, évaluations (`# + ! − / =`), types, zones (1-9) et
  sous-zones (A-D), **combinaisons d'attaque** (X1 « A Quick », XP « Pipe », CB « Slide »…),
  **appels passeur** (K) et **formules combinées** service·réception **et** attaque·contre/défense
  (`*23S.10-`, `*05V66.12#`).
- **Quatre modes de travail, comme DataVolley** — le codage d'un match s'organise en **Saisie**,
  **Consultation**, **Correction** et **Analyse**, plus les Paramètres à part.
  - **Saisie** : la disposition « DataVolley » range l'écran d'un clic (vidéo en haut à gauche, score
    et **terrain de rotation** — 6 + 6, poste du passeur, ballon de service — en dessous, zone de code
    en bas, **liste des codes** à droite) ; la disposition libre reste disponible. Gestes de DataVolley :
    `[` / `]` terminent le point pour le domicile ou l'extérieur, **Ctrl+A** annule une fin de point,
    **Échap** ouvre la **fenêtre de commandes** (`T`, `aT` temps morts, `C5.12`, `aC5.12` remplacements,
    `>TEXTE` code libre). Saisie rapide : code attendu prédit (action suivante + passeur), clavier
    virtuel, aide-mémoire.
  - **Consultation** : le match se relit **en enchaînant les points, sans les temps morts** (marges et
    vitesse réglables, compteur du temps mort évité). À droite, en permanence : filtres **action**,
    **qualité** (évaluation), **position** (zone), **rotation** (1-6) et **situation** (+ / 0 / −),
    complétés par équipe, joueur, set et recherche libre de code (`*7A#`), puis le déroulé cliquable
    (points repliables) et les **actions du point en cours**.
  - **Correction** : **calage de tout le match sur le premier service** (fenêtre « Synchronisation… »
    comprise, fermée par **Échap**), **contrôle automatique des codes** enrichi (joueur hors du six,
    serveur attendu, remplacement sans sortant, directions, fin de set, set manquant — tous en
    avertissement, avec compteurs et filtre), liste des codes **modifiable** (temps vidéo ± 0,1 s /
    ± 1 s / « = vidéo », monter, descendre, supprimer), **directions à 2 clics** sur le terrain et
    parcours **« Compléter un match »** pour ajouter les zones manquantes.
  - **Analyse** : menu des fenêtres (toutes les feuilles du rapport : synthèse, compétences,
    combinaisons, zones, situations, rotations, classements, par set, joueurs, directions, plus
    points et distribution), filtres communs (dont **rotation** et **situation**) et
    **descente d'un chiffre vers les actions** (« Click to Rally ») : les actions retenues s'affichent à
    droite et se relisent d'un clic.
- **Mode Entraînement** : jeux d'association (paires) et traduction chronométrée, pour apprendre les codes.
- **Profils de fenêtres** : enregistrez une disposition (positions, tailles et fenêtres ouvertes)
  sous un nom, depuis le menu **Fenêtres**, puis appliquez-la à n'importe quel autre match. Les
  profils sont conservés sur le poste et restent disponibles d'un match à l'autre.
- **Rapports** : bilan de match, ventilations par évaluation / type / zone, stats et efficacité par
  **combinaison**, **directions d'attaque**, synthèse **par set**, heatmaps, export **CSV**.
- **Interopérabilité** : export / import du format **`.dvw`** (DataVolley), rotation point par point incluse.
- **Match en direct** : caméra multi-appareils ; l'enregistrement est conservé et devient une **vidéo de
  replay** avec les points **ancrés**.
- **Trajectoires** : fiches de trajectoire de service et d'attaque par joueur, et **rapport
  global par équipe** (tous les matchs d'une équipe réunis, services et attaques par joueur,
  triables par poste de départ de l'attaque : zones 4, 3, 2 ou arrière).

## 🖥️ Application Windows (poste statisticien) — recommandé

ASUL existe désormais sous forme d'**application Windows installable** qui embarque
tout (interface, serveur, base SQLite, ffmpeg) : **aucune installation de Node.js ou
de ffmpeg** n'est nécessaire chez les utilisateurs.

- Ressources : tous les éléments sont dans `desktop/` (voir `desktop/README.md`).
- Les données sont stockées par poste dans `%APPDATA%\ASUL\data\` et ne sont jamais
  supprimées lors d'une mise à jour ou d'une désinstallation.

### Construire l'installeur

```powershell
cd desktop
npm install
npm run dist        # → desktop\dist\ASUL-Setup-1.0.0.exe
```

### Utilisation

| Mode | Rôle |
| --- | --- |
| **Hôte** | Ce PC lance le serveur ASUL et stocke le match (PC principal de la salle) |
| **Rejoindre** | Ce PC se connecte au PC hôte (2ᵉ statisticien, aucune donnée locale) |

Chaque statisticien **crée son propre compte** dans l'application. Pour un match à
plusieurs : le poste hôte affiche son adresse via **Serveur → Adresse pour les autres
statisticiens** (règle de pare-feu créée automatiquement par l'installeur), les autres
postes la saisissent après avoir choisi « Rejoindre un match ».

> Détails complets (structure de l'installeur, sauvegarde/restauration, dépannage,
> raccourcis, notes techniques) : **`desktop/README.md`**.

## 🚀 Utilisation en LOCAL uniquement (localhost, version web)

Cette version est prévue pour fonctionner **uniquement en local**, sur votre PC.
Toutes les données (base de données + vidéos) sont stockées sur votre machine :

| Donnée | Emplacement sur le PC |
| --- | --- |
| Base de données SQLite | `server/asul.db` |
| Vidéos uploadées | `server/uploads/` |
| Vidéos de lecture légère (proxy) | `server/uploads/trimmed/` |

### Démarrer l'application (1 clic)

1. Installer **Node.js** (https://nodejs.org) si ce n'est pas déjà fait.
2. Double-cliquer sur **`start-local.bat`** (à la racine du projet).

Le script :
- construit le frontend React,
- installe les dépendances si nécessaire,
- démarre le serveur Express qui sert **l'API + le frontend** sur une seule adresse.

3. Votre navigateur s'ouvre automatiquement sur **http://localhost:3001**

> Pour arrêter : fermez la fenêtre du serveur ou faites **Ctrl+C**.

### Démarrage en mode développement (rechargement à chaud)

- Terminal 1 (backend) : `cd server` puis `npm start`
- Terminal 2 (frontend) : `cd client` puis `npm run dev`
- Ouvrir http://localhost:5173 (le proxy Vite redirige `/api` vers le port 3001)

## ☁️ Partage des équipes entre les postes (cloud gratuit)

Les **équipes** (joueurs, libéro) sont stockées dans la base SQLite du poste et
étaient donc partagées seulement entre les appareils d'un même réseau local.
Elles peuvent désormais être **partagées à distance**, via un service externe
gratuit (Supabase) :

* onglet **Équipes** → **Configurer…** : URL du projet + clé « anon », puis
  « Enregistrer et tester » (aucune reconstruction de l'application) ;
* la configuration est conservée dans `%APPDATA%\ASUL\data\sync.json`, donc
  préservée par les mises à jour ;
* hors ligne, l'application fonctionne exactement comme avant : la base locale
  reste la source de vérité, les changements partent au cycle suivant ;
* les vidéos, les matchs en direct et les comptes restent locaux.

> Guide complet (création du projet Supabase, script SQL, dépannage, tests) :
> **`SYNC.md`**.

## 📁 Structure du projet

```
Asulv2/
├── desktop/         # Application Windows (Electron) : installeur + coquille
│   ├── main.js      #   → démarrage du serveur, mode hôte/rejoindre, menus
│   ├── splash.html  #   → écran de démarrage et de choix du mode
│   ├── scripts/     #   → récupération de ffmpeg pour l'installeur
│   ├── build/       #   → icône + script NSIS (pare-feu, raccourcis)
│   └── README.md    #   → guide de build, d'utilisation et de dépannage
├── client/          # Frontend React
│   ├── src/
│   │   ├── pages/   # Pages (Login, Dashboard, DataVolley, Live, Trajectoires, Entraînement…)
│   │   ├── components/  # dont les modes de codage (DvModeBar, DvCodeList, DvRotationWindow…)
│   │   ├── services/
│   │   └── contexts/
│   └── package.json
├── server/          # Backend Node.js/Express
│   ├── src/
│   │   ├── config.js    # → DATA_DIR, JWT_SECRET, FFMPEG_PATH, réseau
│   │   ├── routes/     # → api, system (diagnostic/réseau), live, datavolley…
│   │   ├── teamsSync.js # → synchronisation cloud des équipes (partage à distance)
│   │   ├── database.js
│   │   └── index.js
│   ├── scripts/     # → tests exécutables (dont le partage des équipes)
│   └── package.json
├── scripts/         # Outils (synchronisation des versions à publier)
├── start-local.bat  # Démarrage local en un clic (build + serveur)
└── .gitignore
```

## 📹 Caméra du match en direct (téléphone → PCs)

Pendant un match, un téléphone peut filmer le terrain et la vidéo s'affiche sur les
PC des statisticiens **avec un retard réglable** (10 s par défaut) : le temps de coder
le point avant de le revoir à l'écran.

### Mise en place

1. Sur le PC, créer/rejoindre le match en direct et relever le **code** affiché en haut.
2. Sur le téléphone, ouvrir l'application, saisir ce code et choisir le rôle
   **« Caméra (filmer le terrain) »**.
3. Appuyer sur **Démarrer la caméra** et poser le téléphone sur un support stable,
   caméra vers le terrain.
4. Sur les PC, la vidéo apparaît dans le mode **Saisie** (au-dessus de la zone de
   code) et dans la fenêtre de **Rapport**. Le bandeau indique « 📹 Caméra … s ».

### Réglages

- **Délai vidéo** (0 à 30 s) : modifiable par l'organisateur du match (ou depuis le
  téléphone) ; il est commun à tous les appareils et mémorisé avec la session.
- L'organisateur peut donner le rôle « Caméra » à un membre depuis **Six & rôles**.

### Bon à savoir

- La caméra du navigateur n'est autorisée qu'en **HTTPS** (ou sur `localhost` /
  l'adresse du poste serveur). Le réseau local du gymnase est recommandé.
- La vidéo passe par le PC serveur, **sans être enregistrée** : elle transite en
  mémoire (fenêtre de quelques dizaines de secondes) puis est oubliée.
- Un seul téléphone filme à la fois ; si un autre démarre, il remplace le premier.

## 🛠️ Technologies

- **Frontend** : React 18, Vite, React Router
- **Backend** : Node.js, Express, SQLite, Socket.IO
- **Flux caméra du direct** : API navigateur `getUserMedia` + `MediaRecorder` côté
  téléphone, buffer de rediffusion différée côté serveur, `MediaSource` côté PC
  (aucune dépendance supplémentaire)
- **Stockage** : 100% local sur le PC (SQLite + fichiers vidéo)
- **Partage des équipes à distance** : Supabase (offre gratuite) via son API REST — voir `SYNC.md`

## 🗂️ Stockage des vidéos

Les vidéos sont enregistrées **sur le disque du poste, uniquement** :

- Vidéos originales : `server/uploads/`
- Vidéos découpées : `server/uploads/trimmed/`

Aucune vidéo ne transite par un service externe.

## 📝 License

Private - Tous droits réservés