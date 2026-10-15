@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ============================================
echo    ASUL - Demarrage LOCAL (localhost)
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERREUR] Node.js n'est pas installe.
  echo  Installez-le depuis https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)

REM --- 1. Frontend : installation + build ---
echo  [1/3] Preparation du frontend (client)...
pushd client
echo        Installation/verification des dependances du client...
call npm install
if errorlevel 1 goto :fail
echo        Construction du frontend...
call npm run build
if errorlevel 1 goto :fail
popd

REM --- 2. Backend : installation ---
echo  [2/3] Preparation du backend (server)...
pushd server
echo        Installation/verification des dependances du serveur...
call npm install
if errorlevel 1 goto :fail
popd

REM --- 3. Demarrage du serveur ---
echo  [3/3] Demarrage du serveur...
echo.
echo  Ouverture de http://localhost:3001 dans votre navigateur...
start "" http://localhost:3001
echo.
echo  (Pour arreter le serveur, fermez cette fenetre ou faites Ctrl+C)
echo.
pushd server
call npm start
popd

goto :eof

:fail
echo.
echo  [ERREUR] Une etape a echoue. Verifiez le message ci-dessus.
pause
exit /b 1
