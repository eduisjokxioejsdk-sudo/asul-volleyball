# 🚀 Guide de Déploiement ASUL

Ce guide vous explique comment déployer votre application ASUL sur Vercel (frontend) et Railway (backend).

## 📋 Prérequis

- Compte GitHub : https://github.com/signup
- Compte Railway : https://railway.app (sign up with GitHub)
- Compte Vercel : https://vercel.com (sign up with GitHub)

---

## 🎯 Étape 1 : Uploader le code vers GitHub

### Option A : Script automatique (RECOMMANDÉ)
1. Double-cliquer sur `push-to-github.bat`
2. Attendre que ça se termine
3. Vérifier sur https://github.com/eduisjokxioejsdk-sudo/asul-volleyball

### Option B : Manuellement (si le script ne marche pas)
```powershell
# Ouvrir PowerShell dans c:\Users\gabri\Documents\Asulv2

# Initialiser Git
git init

# Ajouter tous les fichiers
git add .

# Commit
git commit -m "Initial commit - ASUL Volleyball App"

# Envoyer vers GitHub
git remote add origin https://github.com/eduisjokxioejsdk-sudo/asul-volleyball.git
git branch -M main
git push -u origin main
```

**Si on vous demande un mot de passe :**
- Utilisez votre mot de passe GitHub
- Ou créez un Personal Access Token : GitHub → Settings → Developer settings → Personal access tokens

---

## 🎯 Étape 2 : Déployer le Backend sur Railway

### 2.1 Créer le projet
1. Aller sur https://railway.app
2. Cliquer "New Project"
3. Sélectionner "Deploy from GitHub repo"
4. Choisir `asul-volleyball`
5. Dans "Root Directory", entrer : `server`
6. Cliquer "Add Variables"

### 2.2 Ajouter les variables d'environnement
Cliquer "New" → "Raw Editor" et coller :
```json
{
  "NODE_ENV": "production",
  "PORT": "5000"
}
```

### 2.3 Ajouter un volume pour la base de données
1. Cliquer sur l'onglet "Volumes"
2. Cliquer "New Volume"
3. Nom : `data`
4. Mount Path : `/app/data`
5. Size : 1GB
6. Cliquer "Add"

### 2.4 Déployer
1. Cliquer "Deploy"
2. Attendre 2-3 minutes
3. Une fois déployé, cliquer sur "Settings" → "Domains"
4. Copier l'URL (ex: `https://asul-server-production.up.railway.app`)

### 2.5 Initialiser la base de données
1. Cliquer sur l'onglet "Deployments"
2. Cliquer sur votre déploiement
3. Cliquer sur "View Logs"
4. Si vous voyez des erreurs de base de données, c'est normal - Railway va la créer automatiquement

---

## 🎯 Étape 3 : Déployer le Frontend sur Vercel

### 3.1 Créer le projet
1. Aller sur https://vercel.com
2. Cliquer "Add New..." → "Project"
3. Sélectionner `asul-volleyball`
4. Dans "Root Directory", sélectionner `client`
5. Dans "Environment Variables", ajouter :
   - Name : `VITE_API_URL`
   - Value : `https://asul-server-production.up.railway.app` (votre URL Railway)
6. Cliquer "Deploy"

### 3.2 Attendre le déploiement
- Vercel va builder et déployer en 2-3 minutes
- Vous obtiendrez une URL comme : `https://asul-volleyball.vercel.app`

---

## 🎯 Étape 4 : Mettre à jour la configuration

### 4.1 Mettre à jour vercel.json
Ouvrir `vercel.json` et remplacer l'URL Railway par la vôtre :
```json
{
  "routes": [
    {
      "src": "/api/(.*)",
      "dest": "https://VOTRE_URL_RAILWAY.up.railway.app/api/$1"
    }
  ]
}
```

### 4.2 Mettre à jour README.md
Remplacer l'URL dans le README.md par vos URLs finales.

---

## 🎯 Étape 5 : Tester

1. **Aller sur votre site** : `https://asul-volleyball.vercel.app`
2. **Tester la connexion** : Créer un compte et se connecter
3. **Tester l'upload** : Uploader une petite vidéo
4. **Vérifier** : Les vidéos sont bien sauvegardées

---

## 🔧 Dépannage

### Le site ne charge pas
- Vérifier les logs Vercel : Vercel → Project → Deployments → View Logs
- Vérifier que l'URL de l'API est correcte

### Erreur 500 sur l'API
- Vérifier les logs Railway : Railway → Project → Deployments → View Logs
- Vérifier que le volume est bien monté sur `/app/data`

### Les vidéos ne s'uploadent pas
- Vérifier que le dossier `uploads` existe dans le volume Railway
- Vérifier les permissions du dossier

### La base de données ne se crée pas
- Railway crée automatiquement la base au premier démarrage
- Si ça ne marche pas, vérifier les logs pour voir l'erreur

---

## 📊 Limites du gratuit

### Railway
- 750 heures/mois (suffisant pour un petit projet)
- 1GB de stockage (attention aux vidéos volumineuses)
- Le projet se met en pause après 30 jours d'inactivité

### Vercel
- 100GB de bande passante/mois
- Déploiements illimités
- HTTPS automatique

---

## 🎉 Félicitations !

Votre site est maintenant en ligne et accessible depuis n'importe où dans le monde !

**URLs à partager :**
- Frontend : https://asul-volleyball.vercel.app
- Backend API : https://asul-server-production.up.railway.app

---

## 📝 Notes importantes

1. **Sauvegarde** : Téléchargez régulièrement la base de données depuis Railway
2. **Vidéos** : Limitez la taille des vidéos uploadées (max 500MB recommandé)
3. **Monitoring** : Surveillez votre consommation sur Railway et Vercel
4. **Mises à jour** : Pour mettre à jour le code, repoussez vers GitHub et les plateformes redéploieront automatiquement