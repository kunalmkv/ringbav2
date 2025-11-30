import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Set base path to match nginx location - this ensures all assets load correctly
  // For subdomain at root: use '/' (current setup for ringba.insidefi.co)
  // For path-based: use '/ringba-sync-dashboard/'
  base: '/',
  build: {
    outDir: '../dashboard-build',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/ringba-sync-dashboard/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/ringba-sync-dashboard/, ''),
        changeOrigin: true
      }
    }
  }
});

