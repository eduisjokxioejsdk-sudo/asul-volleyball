import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Application autonome : elle ne dépend d'aucun serveur, les données Fast Direct
// sont chargées depuis une sauvegarde .json ou depuis le localStorage du navigateur.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  preview: {
    port: 4174,
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
