import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/ (the CI workflow sets VITE_BASE to that path). Dev stays at '/'.
  base: process.env.VITE_BASE || '/',
  publicDir: 'assets',
  server: { port: 5173, strictPort: true },
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
