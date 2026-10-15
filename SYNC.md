# ☁️ Partage des équipes à distance (synchronisation cloud)

Les **équipes** (nom, joueurs n° + nom + rôle, libéro) sont stockées dans la base
SQLite locale du poste. Elles étaient donc partagées uniquement entre les
appareils reliés au **même serveur** (mode Windows « Hôte » / « Rejoindre » en
réseau local). Ce document décrit le partage **à distance**, via un service
externe gratuit (**Supabase**, offre gratuite à vie), sans rien changer au
fonctionnement hors ligne.

| Donnée | Où c'est stocké | Partagée à distance ? |
| --- | --- | --- |
| **Équipes** (joueurs, libéro) | SQLite locale **+** base Supabase | ✅ oui |
| **Fiches de trajectoire** (flèches) | SQLite locale **+** base Supabase | ✅ oui |
| **Codage DataVolley** (actions, matchs, événements, six, attribution de sets) | SQLite locale **+** base Supabase | ✅ oui |
| **Vidéos** (métadonnées) | SQLite locale **+** base Supabase | ✅ oui |
| Vidéos (fichiers) | disque du poste | ❌ non (trop lourdes) |
| Matchs en direct | SQLite locale du poste **hôte** | ❌ non (réseau local uniquement) |

---

## 1. Comment ça marche

```
Poste A (ASUL)                          Poste B (ASUL)
┌──────────────────────┐                ┌──────────────────────┐
│ interface + serveur  │                │ interface + serveur  │
│ SQLite locale        │                │ SQLite locale        │
└─────────┬────────────┘                └─────────┬────────────┘
          │  envoi / lecture (HTTPS)              │
          └──────────────► Supabase (table asul_teams) ◄───────────┘
                          service gratuit externe
```

* Le travail est fait par le **serveur Node** de chaque poste : la clé Supabase
  n'est **jamais** exposée au navigateur.
* **La base locale reste la source de vérité** : sans réseau, tout fonctionne
  normalement (création, modification, suppression d'équipes) et les
  changements partent au cycle suivant.
* Chaque équipe porte un identifiant unique partagé (`sync_uuid`) et un
  horodatage. La fusion se fait **équipe par équipe** :
  * une équipe modifiée ici et pas encore envoyée **gagne** (elle écrase la
    version distante) ;
  * sinon c'est la version du cloud qui est appliquée ;
  * les **suppressions** sont propagées par des pierres tombales (`deleted`).
* Deux postes qui avaient créé la même équipe chacun de leur côté (avant
  l'activation du partage) sont **fusionnés en une seule équipe** (reconnaissance
  par nom, accents/casse/ponctuation ignorés).
* Rythme : au démarrage (5 s après), après chaque création/modification/
  suppression, toutes les 60 s (`TEAMS_SYNC_INTERVAL_MS`), et à la demande via
  le bouton **Synchroniser maintenant**. En cas d'échec réseau, les tentatives
  s'espacent (1 min → 8 min max) sans jamais bloquer l'application.

---

## 2. Créer le projet Supabase (une seule fois, ~10 minutes)

1. Créer un compte sur <https://supabase.com> puis **New project**
   (nom libre, mot de passe de base de données : n'importe quoi, il n'est pas
   utilisé par ASUL).
2. Ouvrir **SQL Editor → New query**, coller le script ci-dessous puis **Run** :

```sql
-- Table unique « équipes partagées » (les joueurs sont dans un jsonb)
create table if not exists public.asul_teams (
  sync_uuid   uuid primary key,
  name        text not null,
  libero      integer,
  libero_for  integer,
  players     jsonb not null default '[]'::jsonb,
  deleted     boolean not null default false,
  origin_id   text,                                -- poste ayant écrit (diagnostic)
  updated_at  timestamptz not null default now()
);

-- Horodatage TOUJOURS posé par le serveur (aucun décalage d'horloge entre postes)
create or replace function public.asul_teams_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists asul_teams_touch on public.asul_teams;
create trigger asul_teams_touch
before insert or update on public.asul_teams
for each row execute function public.asul_teams_touch();

create index if not exists asul_teams_updated_at_idx on public.asul_teams (updated_at);

-- Accès limité à CETTE SEULE table pour la clé « anon » (le reste reste fermé)
alter table public.asul_teams enable row level security;
drop policy if exists asul_teams_anon on public.asul_teams;
create policy asul_teams_anon on public.asul_teams
  for all to anon using (true) with check (true);
```

3. Relever dans **Settings → API** :
   * l'**URL du projet** : `https://xxxxxxxxxxxx.supabase.co` ;
   * la clé **anon public** (`eyJhbGciOi…`).

> ⚠️ La clé « anon » ne donne accès qu'à la table `asul_teams` (politique
> ci-dessus). Ces deux valeurs sont à communiquer uniquement aux postes ASUL.

---

## 3. Renseigner chaque poste

### a) Application Windows (recommandé) — aucune reconstruction nécessaire

Dans l'application : onglet **Équipes** → **Configurer…** :

* **URL du projet Supabase** : `https://xxxxxxxxxxxx.supabase.co` ;
* **Clé « anon »** : `eyJhbGciOi…` ;
* cocher **Partager les équipes entre les postes** puis **Enregistrer et
  tester** (la connexion est vérifiée immédiatement).

Les valeurs sont enregistrées dans le dossier de données de l'application :

```
%APPDATA%\ASUL\data\sync.json
```

Ce dossier n'est **jamais** supprimé par une mise à jour ou une désinstallation :
la configuration et les équipes existantes sont donc conservées. Les équipes
déjà présentes sur le poste reçoivent automatiquement un identifiant partagé et
sont envoyées au premier cycle.

> En mode Windows « Rejoindre un poste hôte », c'est le poste **hôte** qui fait
> la synchronisation : configurez-le en priorité (les autres postes voient ses
> équipes).

### b) Développement — variables d'environnement

Ces variables sont **prioritaires** sur `sync.json` (utile pour `npm start` en
développement). Voir `server/.env.example` :

```ini
TEAMS_SYNC_PROVIDER=supabase
TEAMS_SYNC_URL=https://xxxxxxxxxxxx.supabase.co
TEAMS_SYNC_KEY=eyJhbGciOi…
TEAMS_SYNC_TABLE=asul_teams
TEAMS_SYNC_INTERVAL_MS=60000
# TEAMS_SYNC_ENABLED=0   # pour désactiver malgré une configuration présente
```

### c) Fichier `sync.json` (dépannage)

```json
{
  "enabled": true,
  "provider": "supabase",
  "url": "https://xxxxxxxxxxxx.supabase.co",
  "key": "eyJhbGciOi…",
  "table": "asul_teams",
  "intervalMs": 60000
}
```

`"enabled": false` (ou l'absence de configuration) laisse l'application
exactement comme avant : tout est local, aucune requête sortante.

---

## 4. Vérifier que ça fonctionne

* **Journal du serveur** au démarrage :
  `Équipes : synchronisation cloud activée (supabase, https://…, toutes les 60 s)`
  ou, sans configuration :
  `Équipes : synchronisation cloud désactivée — à renseigner dans l'onglet « Équipes »…`
  (menu **Serveur → Ouvrir le journal du serveur**).
* **Onglet Équipes** : la ligne « Partage à distance » indique le nombre
  d'équipes partagées, l'heure du dernier passage et, le cas échéant, l'erreur
  et le nombre d'équipes en attente d'envoi.
* **API** : `GET /api/teams/sync/status` (authentifié) renvoie
  `{ configured, enabled, url, lastSyncAt, lastError, pending, teams, … }`.
* **Test rapide à deux postes** : créer une équipe sur le poste A → bouton
  **Synchroniser maintenant** → elle apparaît sur le poste B (et inversement).

---

## 5. Cas particuliers, limites et dépannage

| Situation | Comportement |
| --- | --- |
| Pas de réseau / Supabase injoignable | Rien n'est perdu : les équipes restent locales, le statut affiche l'erreur, les tentatives reprennent automatiquement |
| La même équipe modifiée sur deux postes hors ligne | La version **la plus récemment modifiée localement** gagne et écrase l'autre (pas de fusion joueur par joueur) ; le conflit est signalé dans le journal du serveur |
| Équipe créée sur deux postes avant le partage | Fusionnée en une seule (reconnaissance par nom) |
| Suppression d'une équipe | Propagée aux autres postes (pierre tombale locale conservée pour éviter sa « résurrection ») |
| Projet Supabase gratuit inutilisé plus de 7 jours | Supabase met le projet **en pause** (voir plus bas) : les postes continuent en local, il suffit de cliquer **Resume project** dans le tableau de bord Supabase |
| « Supabase : Invalid API key » | Clé « anon » incomplète (copiée tronquée) : recopier la valeur entière |
| « Supabase : relation "asul_teams" does not exist » | Le script SQL de l'étape 2 n'a pas été exécuté sur le bon projet |
| Les équipes ne se croisent pas | Vérifier que l'url/clé sont identiques sur les deux postes (`GET /api/teams/sync/status`) et que « Partager les équipes » est coché |
| Plus de 7 jours sans match | Un workflow GitHub Actions optionnel (`.github/workflows/supabase-keepalive.yml`) peut interroger la table toutes les 6 h pour éviter la mise en pause ; il faut y renseigner les secrets `SUPABASE_URL` et `SUPABASE_ANON_KEY` |

---

## 6. Tests automatisés

```powershell
# Logique de fusion (pur, sans réseau) : déduplication, conflits, tombstones,
# convergence de deux postes, idempotence…
node server/scripts/teams-sync.spec.mjs

# Intégration : un faux Supabase REST + DEUX serveurs ASUL (création,
# modification, suppression, configuration depuis l'interface)
node server/scripts/teams-sync-e2e.mjs
```

Le test d'intégration démarre ses propres serveurs sur des ports libres et
utilise des dossiers de données temporaires : il ne touche ni vos équipes ni
votre base.

---

## 7. Fichiers concernés (pour les développeurs)

| Fichier | Rôle |
| --- | --- |
| `server/src/teamsSyncCore.js` | Logique pure : conversion des lignes, fusion équipe par équipe, déduplication par nom |
| `server/src/teamsSync.js` | Configuration, appels REST Supabase, curseur, boucle de fond, état |
| `server/src/database.js` | Colonnes `sync_uuid`, `dirty`, `deleted`, `local_updated_at`, `cloud_updated_at` + table `sync_state` |
| `server/src/routes/teams.js` | Marquage des équipes modifiées, pierres tombales, `POST /sync`, `GET /sync/status`, `PUT /sync/config` |
| `server/src/index.js` | Démarrage de la boucle après l'ouverture du serveur |
| `client/src/hooks/useTeamsSync.js` | État + synchronisation manuelle + rechargement automatique (Socket.IO `teams:changed`) |
| `client/src/pages/TeamsPage.jsx` | Bloc « Partage à distance » (état, bouton, configuration) |

---

## 8. Autres collections partagées (trajectoires, vidéos, codage)

Le moteur de synchronisation est **générique** (`server/src/syncEngine.js`) : les
mêmes principes s'appliquent aux **trajectoires**, aux **métadonnées vidéo** (jamais
les fichiers), au **codage DataVolley** (actions, événements, six de départ,
attribution de sets) et aux **matchs**. Tout est partagé via Supabase, sauf les
fichiers vidéo (trop lourds).

| Collection | Endpoints de partage | Événement temps réel |
| --- | --- | --- |
| Trajectoires | `/api/trajectories/sync`, `/sync/status`, `/sync/config` | `trajectories:changed` |
| Vidéos (métadonnées) | `/api/videos/sync`, `/sync/status`, `/sync/config` | `videos:changed` |
| Codage DataVolley (actions) | `/api/datavolley/sync`, `/sync/status`, `/sync/config` | `actions:changed`, `claims:changed` |

* **Configuration partagée** : l'URL et la clé Supabase sont les mêmes pour toutes
  les collections (une seule base). On les saisit dans l'onglet **Équipes** ; les
  autres onglets affichent l'état et un bouton **Synchroniser maintenant**
  (`client/src/components/SyncStatusBar.jsx`), sans re-saisir la clé.
* **Temps réel** : le serveur émet `<collection>:changed` (Socket.IO) après un
  changement local (route) ou après application d'un changement distant
  (synchronisation cloud). Les pages écoutent ces événements via
  `client/src/hooks/useCollectionChanged.js` pour recharger leurs listes.
* **Identité du créateur** : les fiches de trajectoire portent `created_by`
  (email, stable entre postes) pour que « seul le créateur supprime » reste
  correct sur une fiche arrivée d'un autre poste.
* **Clés d'état isolées par collection** : le curseur et la date de dernière
  synchronisation sont préfixés par la clé de collection dans `sync_state`
  (ex. `trajectories:cursor`), pour éviter qu'une collection n'écrase l'état
  d'une autre.

