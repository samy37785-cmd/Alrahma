import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Split rarely-changing vendor code into its own chunk so it stays cached
    // in the browser across deploys (only app code re-downloads on each release).
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    host: true, // expose on the local network so phones on the same Wi-Fi can open it
    proxy: {
      // Forward API calls through the dev server, so they work from any device
      // (phone hits <PC-IP>:5173/api → proxied to the backend on the PC).
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  preview: {
    port: 4173,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
