#!/usr/bin/env bash
# ============================================================================
# ASUL — sauvegarde de la base SQLite + des vidéos.
# À lancer depuis la racine du projet, là où se trouve docker-compose.yml.
#
#   ./deploy/backup.sh              # écrit dans ./backups
#   ./deploy/backup.sh /root/bak    # écrit dans /root/bak
#
# Astuce : ajouter au cron (quotidien à 3 h) :
#   0 3 * * * cd /root/asul && ./deploy/backup.sh /root/asul-backups
# ============================================================================
set -euo pipefail

DEST="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

echo "→ Base SQLite (copie cohérente via VACUUM INTO)…"
docker compose exec -T asul node -e "const fs=require('fs');try{fs.unlinkSync('/data/_bak.db')}catch(e){};const s=require('/app/server/node_modules/sqlite3');const db=new s.Database('/data/asul.db');db.exec(\"VACUUM INTO '/data/_bak.db'\",(e)=>{db.close();process.exit(e?1:0);});"
docker compose cp asul:/data/_bak.db "$DEST/asul-$STAMP.db"
docker compose exec -T asul sh -c 'rm -f /data/_bak.db'

echo "→ Vidéos (archive des uploads)…"
docker compose exec -T asul sh -c "cd /data && tar czf - uploads" > "$DEST/uploads-$STAMP.tar.gz"

echo "✓ Sauvegarde terminée dans : $DEST"
ls -lh "$DEST" | tail -n +1
