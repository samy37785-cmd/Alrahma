import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
