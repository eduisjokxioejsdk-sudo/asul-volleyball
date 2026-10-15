# 🚀 Déployer ASUL gratuitement (Oracle Cloud + Docker + HTTPS)

Guide pas-à-pas pour mettre l'app **en ligne**, en **HTTPS**, sur **ton domaine**,
avec une machine **Oracle Cloud « Always Free »** (gratuit à vie) via **Docker**.

> Résultat : `https://asul.tondomaine.fr` accessible partout, la base SQLite et
> les vidéos conservées sur un **disque persistant**.

---

## 0. Ce qui est gratuit

| Élément | Solution | Coût |
|---|---|---|
| Serveur (CPU / RAM / disque) | Oracle Cloud *Always Free* | 0 € |
| HTTPS + certificat | Let's Encrypt via Caddy | 0 € |
| Reverse-proxy | Caddy (conteneur) | 0 € |
| Domaine | *(le tien)* | — |
| Base de données | SQLite (fichier) | 0 € |

---

## 1. Créer la VM Oracle « Always Free »

1. Compte sur <https://www.oracle.com/cloud/free/> (carte demandée seulement pour
   vérifier l'identité — aucun débit).
2. ☰ **Compute → Instances → Create Instance**.
3. **Image** : *Canonical Ubuntu 22.04*.
4. **Shape** : *Ampere → VM.Standard.A1.Flex* (ARM), **2 OCPU / 12 Go** suffisent
   (jusqu'à 4 OCPU / 24 Go, toujours gratuit).
   → Si « Out of capacity », réessaie plus tard ou change d'*Availability Domain*.
5. **Networking** : VCN public, coche **Assign a public IPv4 address**.
6. **SSH keys** : laisse Oracle générer la paire, **télécharge la clé privée**.
7. **Create** → note l'**IP publique**.

## 2. Ouvrir les ports 80 et 443

Il y a **deux** pare-feux à ouvrir (Oracle + Ubuntu).

**a) Côté Oracle** — VCN → *Security Lists* → *Default* → **Add Ingress Rules** :
- Source `0.0.0.0/0`, protocole **TCP**, port destination **80**
- Idem pour **443**

**b) Dans Ubuntu** (après connexion SSH, cf. §3) :
```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 3. Se connecter et installer Docker

```bash
ssh -i /chemin/vers/cle-privee.key ubuntu@IP_PUBLIQUE

sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

## 4. Récupérer le code ASUL

```bash
git clone https://github.com/eduisjokxioejsdk-sudo/asul-volleyball.git asul
cd asul
```

## 5. Configurer le domaine et les secrets

```bash
cp deploy/env.production.example .env
nano .env
```

Renseigne dans `.env` :
- `ASUL_DOMAIN` = ton domaine/sous-domaine (ex. `asul.tondomaine.fr`)
- `ACME_EMAIL` = ton e-mail
- `JWT_SECRET` = une longue chaîne aléatoire :

```bash
openssl rand -hex 48    # copie le résultat dans JWT_SECRET
```

## 6. Configurer le DNS

Chez ton registrar (ou Cloudflare), crée un **enregistrement A** :

| Type | Nom | Valeur |
|---|---|---|
| A | `asul` | `IP_PUBLIQUE_DE_LA_VM` |

> **Sur Cloudflare** : mets ce sous-domaine en **« DNS only » (nuage gris)** le
> temps que Caddy obtienne le certificat (sinon il reste en attente).

Vérifie la propagation : `dig +short asul.tondomaine.fr` doit renvoyer l'IP.

## 7. Lancer ASUL

```bash
docker compose up -d --build
docker compose logs -f
```

Caddy demande le certificat et le serveur démarre. Ouvre ensuite
**https://asul.tondomaine.fr**. 🎉

Vérifications :
```bash
docker compose ps
curl -s https://asul.tondomaine.fr/api/health
```

## 8. Créer ton compte

Le premier écran est **Inscription** → crée le compte administrateur.
(Pour fermer les inscriptions plus tard, voir « Sécurité », §13.)

## 9. Mettre à jour l'application

```bash
cd ~/asul
git pull
docker compose up -d --build
```

## 10. Sauvegardes

```bash
chmod +x deploy/backup.sh
./deploy/backup.sh /root/asul-backups
```

Cron quotidien (3 h) :
```bash
crontab -e
# ajoute la ligne :
0 3 * * * cd /root/asul && ./deploy/backup.sh /root/asul-backups
```

> Chaque sauvegarde contient la base (`asul-*.db`) et les vidéos
> (`uploads-*.tar.gz`). Copie-les régulièrement ailleurs (PC, cloud…).

## 11. Surveiller le disque

Les vidéos s'accumulent dans le volume `asul-data` :
```bash
df -h /                                        # espace de la VM
docker system df                               # espace utilisé par Docker
docker compose exec asul du -sh /data/uploads  # taille des vidéos
```
Supprime d'anciennes vidéos via l'interface ASUL (chaque vidéo a un bouton de
suppression), ce qui libère le disque.

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Page blanche / 502 | conteneur `asul` en erreur | `docker compose logs asul` |
| Pas de HTTPS | DNS non propagé / nuage orange Cloudflare | `docker compose logs caddy` + DNS en « DNS only » |
| Port 80/443 injoignable | pare-feu Oracle **ou** iptables | refaire l'étape 2 |
| `no such table: users` | base pas encore prête au 1er démarrage | attendre/recharger |
| Export vidéo indisponible | ffmpeg | `docker compose exec asul ffmpeg -version` |

## 13. Notes & limites

- **Caméra du direct** : nécessite HTTPS ✅ (fourni par Caddy). Un seul
  téléphone filme à la fois.
- **Échelle** : convient à une équipe (1 match direct + quelques uploads
  simultanés). Au besoin, augmente la « shape » Oracle (gratuit jusqu'à
  4 OCPU / 24 Go).
- **Sécurité** : app privée. Pour fermer les inscriptions publiques, ajoute une
  protection par mot de passe dans le `Caddyfile` (directive `basicauth`) ou
  limite l'accès.
- **Coût** : 0 € (VM gratuite à vie, HTTPS gratuit, domaine déjà possédé).

---

## Fichiers ajoutés pour ce déploiement

| Fichier | Rôle |
|---|---|
| `Dockerfile` | image de production (front + back + ffmpeg) |
| `docker-compose.yml` | app + Caddy + volume persistant |
| `.dockerignore` | contexte de build allégé |
| `deploy/Caddyfile` | reverse-proxy HTTPS automatique |
| `deploy/env.production.example` | modèle de `.env` |
| `deploy/backup.sh` | sauvegarde base + vidéos |


