import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Flask API runs on :8082; Vite proxies /api to it so the
// session cookie stays same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true, // fail loudly instead of silently moving ports
    proxy: { '/api': 'http://127.0.0.1:8082' },
  },
});
