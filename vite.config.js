import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'assets',
  server: { port: 5173, strictPort: true },
  build: { target: 'esnext', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
