# ASUL - Analyse Volleyball

Application d'analyse de vidéos de volleyball.

## 🚀 Déploiement

### Frontend (Vercel)
- Le frontend est déployé automatiquement sur Vercel

### Backend (Railway)
- Le backend est déployé sur Railway
- URL API : https://asul-server-production.up.railway.app

## 📁 Structure du projet

```
Asulv2/
├── client/          # Frontend React
│   ├── src/
│   │   ├── pages/   # Pages (Login, Register, Dashboard, VideoDashboard)
│   │   ├── components/
│   │   ├── services/
│   │   └── contexts/
│   └── package.json
├── server/          # Backend Node.js/Express
│   ├── src/
│   │   ├── routes/
│   │   ├── database.js
│   │   └── index.js
│   └── package.json
├── vercel.json      # Configuration Vercel
├── railway.json     # Configuration Railway
└── .gitignore
```

## 🛠️ Technologies

- **Frontend** : React 18, Vite, React Router
- **Backend** : Node.js, Express, SQLite
- **Déploiement** : Vercel (frontend), Railway (backend)

## ☁️ Stockage des vidéos (Cloudflare R2)

Les vidéos (originaux et versions découpées) sont stockées dans **Cloudflare R2** (stockage objet compatible S3). Si R2 n'est pas configuré, le serveur retombe sur le stockage local (`server/uploads`).

### Variables d'environnement (côté serveur)
En **production**, ces variables sont **déjà définies dans `server/Dockerfile`** (aucune action manuelle requise). Pour le développement local, remplir `server/.env` :

| Variable | Description |
| --- | --- |
| `R2_ACCOUNT_ID` | ID du compte Cloudflare |
| `R2_ACCESS_KEY_ID` | Access Key ID (Cloudflare → R2 → Manage API Tokens) |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key associée |
| `R2_BUCKET_NAME` | Nom du bucket R2 |
| `R2_PUBLIC_BASE_URL` | *(optionnel)* URL publique de lecture directe (custom domain ou `r2.dev`) |

### Créer le bucket et les clés
1. Cloudflare → **R2** → **Create bucket** (ex: `asul-videos`).
2. Cloudflare → **R2** → **Manage API Tokens** → **Create API Token** (autorisation *Object Read & Write* sur ce bucket).
3. Copier l'**Account ID** (dans l'URL du dashboard) ainsi que l'Access Key ID et la Secret Access Key.
4. *(Optionnel, recommandé)* Connecter un custom domain au bucket, ou activer **Public access** (`r2.dev`), pour une lecture directe sans URL signée.

Une fois R2 configuré, le serveur affiche au démarrage : `Cloudflare R2 storage: enabled`.

## 📝 License

Private - Tous droits réservés