FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3001

# --- Cloudflare R2 (stockage des vidéos) ---
ENV R2_ACCOUNT_ID=75b2d01e2853c1eba82f03bace284a71
ENV R2_ACCESS_KEY_ID=4122362ca5d82c0286590f7f71627fad
ENV R2_SECRET_ACCESS_KEY=c1bd1f012e2c1a28abe3ee4e5681d46530c6ef0bf953a0d75bc330268610e8e4
ENV R2_BUCKET_NAME=asulvolleyball
ENV R2_PUBLIC_BASE_URL=https://pub-7c8dc6782c654b3b970d992c9f0dce2c.r2.dev

# Secret JWT (généré)
ENV JWT_SECRET=5057efe35c275be2ad2b17224914f9142251e8a51eae459aa3c7d5fc1dd23e07545b09a55f862695702c301849190a23

EXPOSE 3001

CMD ["node", "src/index.js"]
