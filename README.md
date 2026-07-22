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

## 📝 License

Private - Tous droits réservés