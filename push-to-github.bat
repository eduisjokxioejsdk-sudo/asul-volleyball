@echo off
echo ========================================
echo  Upload ASUL vers GitHub
echo ========================================
echo.

REM Vérifier si Git est installé
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERREUR: Git n'est pas installé !
    echo Téléchargez-le sur : https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/4] Initialisation de Git...
git init

echo.
echo [2/4] Ajout des fichiers...
git add .

echo.
echo [3/4] Création du commit...
git commit -m "Initial commit - ASUL Volleyball App"

echo.
echo [4/4] Envoi vers GitHub...
git remote add origin https://github.com/eduisjokxioejsdk-sudo/asul-volleyball.git
git branch -M main
git push -u origin main

echo.
echo ========================================
echo  TERMINE !
echo ========================================
echo.
echo Votre code est maintenant sur GitHub !
echo Vérifiez : https://github.com/eduisjokxioejsdk-sudo/asul-volleyball
echo.
pause