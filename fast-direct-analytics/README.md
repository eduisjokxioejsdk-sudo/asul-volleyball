# Fast Direct Analytics

Application autonome d'analyse des données du mode **Fast Direct** (distribution passeur) :
réception, distribution, attaquants, matchs et combinaisons. Elle ne dépend d'aucun serveur —
toutes les données sont lues et calculées localement dans le navigateur.

> L'application **Stats Fast Direct** (module 10 du Hub Pancake, onglet « Stats ») est un autre
> outil : elle est servie depuis `client/public/stats-fast-direct/`. Celle-ci (`fast-direct-analytics`)
> est l'outil d'analyse des actions saisies en Fast Direct.

## Lancement

```bash
cd fast-direct-analytics
npm install
npm run dev        # http://localhost:5174
npm run build      # build statique dans dist/
npm run preview    # prévisualisation du build (port 4174)
npm test           # moteur de statistiques + rendus des écrans
npm run test:stats # uniquement le moteur de calcul
```

## Sources de données

Deux façons de charger une session :

1. **Sauvegarde `.json`** (recommandé, fonctionne sur n'importe quel poste)
   Dans l'application Pancake Stats → Fast Direct → onglet Distribution → bouton de sauvegarde
   JSON. Le fichier contient `data.rows`, `data.matchList`, `data.setterList`,
   `data.sheetConfigs` et `data.teamLineup` : l'app lit ce format tel quel.
2. **Session du navigateur**
   Si l'app principale Fast Direct a enregistré une session dans le `localStorage` de ce
   navigateur (clés `pancake_fd_<sessionId>_pancake_dist_rows_v1`), elle apparaît directement dans
   la liste « Sessions détectées dans ce navigateur ». Ce mode n'est disponible que sur le poste
   qui a saisi les données (même origine) ; sinon, utilisez la sauvegarde `.json`.

Aucune donnée n'est envoyée sur le réseau : import, calculs et export CSV se font côté client.

## Ce que calcule l'application

| Onglet | Contenu |
| --- | --- |
| Vue d'ensemble | Actions, matchs, % de réceptions positives, zone de distribution dominante, attaquant le plus utilisé, points, qualité de réception, annonces BASE, résultats d'attaque |
| Réception | Zones 3×3 (4-3-2 / 7-8-9 / 5-6-1), qualité (`#`, `+`, `0`, `!`, `-`, `Err`), zones de passe, réception par passeur, matrice zones × qualité |
| Distribution | 8 zones d'analyse (EN 1, PIPE, EN 2, FIX ARR, FIX AV, DÉCALÉE, EN 4, Autres) avec Q / Dis / Eff, détail par code (5, 9, 4, 7, 1, 1C, 3, 2, 6, 8, 10, PM), par rotation et par passeur |
| Attaquants | Volume et part de chaque numéro, zone forte, points, efficacité, détail par zone cible |
| Matchs | Synthèse par match (volume, rotations, passeurs, réception positive, cible dominante) et comparaison |
| Combinaisons | Enchaînements réception (zone + qualité) → zone de passe → cible de distribution |
| Données | Recherche plein texte, pagination et export CSV des actions filtrées |

Définitions reprises de la feuille d'analyse passeur du mode Fast Direct :

- **Q** : nombre de ballons distribués vers la zone ;
- **Dis** : part de la zone dans le total des distributions ;
- **Eff** : points (`#`) divisés par les ballons de la zone.

Depuis la version 3.24.2 de Fast Direct, le **type de service est fixé à `F`** et le **résultat
d'attaque à `-`** automatiquement : la colonne « Résultat » sert donc surtout à analyser les
sauvegardes antérieures (ou des données importées avec d'autres codes).

## Filtres

Les filtres Matchs, Passeurs, Rotations et Attaquants sont cumulables (plusieurs valeurs par
filtre). Une liste vide signifie « tout » ; le bouton « Réinitialiser » remet la vue complète.

## Structure

```
fast-direct-analytics/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── scripts/stats.spec.mjs          # tests du moteur (node, sans navigateur)
└── src/
    ├── main.jsx
    ├── index.css                   # Tailwind + styles de défilement
    ├── App.jsx                     # en-tête, sources, filtres, onglets
    ├── components/
    │   ├── Ui.jsx                  # cartes, badges, barres, tableaux
    │   ├── DataSourcePanel.jsx     # import .json + sessions localStorage
    │   ├── FiltersBar.jsx          # filtres cumulables
    │   ├── DataTablePanel.jsx      # recherche, pagination, export CSV
    │   └── StatsPanels.jsx         # vues d'ensemble / réception / distribution…
    └── utils/
        ├── statsEngine.js          # normalisation + calculs + export CSV
        └── dataSource.js           # lecture des sauvegardes et du localStorage
```

## Déploiement

`npm run build` produit un site statique dans `dist/` : le dossier peut être servi par n'importe
quel hébergeur (Vercel, Netlify, IIS, nginx…) sans backend.
