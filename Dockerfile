# syntax=docker/dockerfile:1
# ============================================================================
# ASUL — image de production (front React + back Node/Express + ffmpeg + SQLite)
#
# Le serveur Express sert à la fois l'API, le temps réel (Socket.IO) et le
# frontend buildé (client/dist) : une seule origine, donc ni CORS ni URL d'API
# à configurer. Les données (base SQLite + vidéos) vivent dans /data, monté sur
# un volume persistant (voir docker-compose.yml).
# ============================================================================

# ---------------------------------------------------------------- 1) Frontend
FROM node:20-bookworm AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ------------------------------------------- 2) Dépendances serveur (production)
# Image complète (outils de compilation présents) : sqlite3 peut utiliser un
# binaire pré-compilé ou, à défaut, se compiler sans configuration supplémentaire.
FROM node:20-bookworm AS server-deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# -------------------------------------------------------------- 3) Runtime
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    DATA_DIR=/data \
    CLIENT_DIST=/app/client/dist

# ffmpeg : découpe/export des vidéos. tini : arrêt propre (PID 1).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Code serveur, puis dépendances de production, puis frontend buildé.
COPY server/ ./server/
COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY --from=client-build /build/client/dist ./client/dist

RUN mkdir -p /data/uploads/trimmed
VOLUME ["/data"]

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
