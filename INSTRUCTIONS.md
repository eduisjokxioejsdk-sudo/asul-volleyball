# 📖 INSTRUCTIONS PAS À PAS - DÉPLOIEMENT ASUL

Suivez ces instructions dans l'ordre. Chaque étape est simple et rapide !

---

## ✅ ÉTAPE 1 : Uploader le code vers GitHub (2 minutes)

### Méthode la plus simple :
1. **Trouver le fichier** `push-to-github.bat` dans votre dossier `c:\Users\gabri\Documents\Asulv2`
2. **Double-cliquer dessus**
3. **Attendre** que la fenêtre noire affiche "TERMINE !"
4. **Vérifier** : Aller sur https://github.com/eduisjokxioejsdk-sudo/asul-volleyball

✅ **C'est fait quand** : Vous voyez vos fichiers sur GitHub

---

## ✅ ÉTAPE 2 : Déployer le Backend sur Railway (5 minutes)

### 2.1 - Aller sur Railway
1. Ouvrir https://railway.app
2. Cliquer sur **"New Project"**
3. Cliquer sur **"Deploy from GitHub repo"**
4. Sélectionner **"asul-volleyball"**
5. Dans **"Root Directory"**, écrire : `server`
6. Cliquer sur **"Add Variables"**

### 2.2 - Ajouter les variables
Cliquer sur **"New"** → **"Raw Editor"** et copier-coller :
```json
{
  "NODE_ENV": "production",
  "PORT": "5000"
}
```
Cliquer **"Add"**

### 2.3 - Ajouter un volume (pour la base de données)
1. Cliquer sur l'onglet **"Volumes"**
2. Cliquer **"New Volume"**
3. Nom : `data`
4. Mount Path : `/app/data`
5. Size : `1GB`
6. Cliquer **"Add"**

### 2.4 - Déployer
1. Cliquer sur **"Deploy"**
2. **Attendre 2-3 minutes** (vous verrez les logs défiler)
3. Une fois terminé, cliquer sur **"Settings"** → **"Domains"**
4. **Copier l'URL** (ex: `https://asul-server-production.up.railway.app`)

✅ **C'est fait quand** : Vous avez copié l'URL de votre backend

---

## ✅ ÉTAPE 3 : Déployer le Frontend sur Vercel (5 minutes)

### 3.1 - Aller sur Vercel
1. Ouvrir https://vercel.com
2. Cliquer sur **"Add New..."** → **"Project"**
3. Sélectionner **"asul-volleyball"**
4. Dans **"Root Directory"**, sélectionner **"client"**

### 3.2 - Ajouter la variable d'environnement
1. Cliquer sur **"Environment Variables"**
2. Ajouter :
   - **Name** : `VITE_API_URL`
   - **Value** : `https://asul-server-production.up.railway.app` (votre URL Railway de l'étape 2)
3. Cliquer **"Add"**

### 3.3 - Déployer
1. Cliquer sur **"Deploy"**
2. **Attendre 2-3 minutes**
3. Vous obtiendrez une URL comme : `https://asul-volleyball.vercel.app`

✅ **C'est fait quand** : Vous avez l'URL de votre site en ligne !

---

## ✅ ÉTAPE 4 : Mettre à jour la configuration (1 minute)

### 4.1 - Mettre à jour vercel.json
1. Ouvrir le fichier `vercel.json` dans VS Code
2. Remplacer `https://asul-server-production.up.railway.app` par VOTRE URL Railway
3. Sauvegarder (Ctrl+S)

### 4.2 - Mettre à jour le code
1. Ouvrir `client/.env.example`
2. Remplacer l'URL par la vôtre
3. Sauvegarder

### 4.3 - Repousser vers GitHub
1. Double-cliquer sur `push-to-github.bat` à nouveau
2. Attendre que ça se termine

✅ **C'est fait quand** : Le script affiche "TERMINE !"

---

## ✅ ÉTAPE 5 : Tester votre site (2 minutes)

1. **Aller sur votre site** : `https://asul-volleyball.vercel.app`
2. **Créer un compte** : Cliquer sur "S'inscrire"
3. **Se connecter** : Utiliser vos identifiants
4. **Tester l'upload** : Cliquer sur "+ Uploader" et choisir une petite vidéo
5. **Vérifier** : La vidéo apparaît dans la liste

✅ **C'est fait quand** : Vous pouvez vous connecter et voir le dashboard

---

## 🎉 FÉLICITATIONS ! Votre site est en ligne !

### Vos URLs :
- **Site web** : https://asul-volleyball.vercel.app
- **API** : https://asul-server-production.up.railway.app

### Partager avec vos amis :
- Envoyez-leur l'URL du site : `https://asul-volleyball.vercel.app`
- Ils peuvent créer un compte et utiliser l'application !

---

## 🔧 Si quelque chose ne marche pas

### Le site ne charge pas
- Vérifier les logs Vercel : Vercel → Project → Deployments → View Logs
- Vérifier que l'URL de l'API est correcte dans vercel.json

### Erreur 500 sur l'API
- Vérifier les logs Railway : Railway → Project → Deployments → View Logs
- Vérifier que le volume est bien monté sur `/app/data`

### Les vidéos ne s'uploadent pas
- Vérifier que le dossier `uploads` existe dans Railway
- Vérifier les permissions

---

## 📝 Notes importantes

1. **Sauvegarde** : Téléchargez régulièrement la base de données depuis Railway
2. **Vidéos** : Limitez la taille (max 500MB recommandé)
3. **Mises à jour** : Pour mettre à jour le code, repoussez vers GitHub et ça redéploiera automatiquement
4. **Gratuit** : Railway se met en pause après 30 jours d'inactivité, mais vos données sont conservées

---

## 🆘 Besoin d'aide ?

- Consulter le fichier `DEPLOY.md` pour plus de détails
- Vérifier les logs sur Railway et Vercel
- Les erreurs les plus courantes sont dans la section "Dépannage" de DEPLOY.md

---

**Bon déploiement ! 🚀**