import { resolve } from 'path';
import { defineConfig } from 'vite';

// publicDir mirrors the absolute paths ("/public/...", "/merchant/...") the app already uses for
// service workers, manifests and static assets - Vite copies it verbatim into dist/ root, unhashed.
export default defineConfig({
  publicDir: 'static',
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        landing404: resolve(__dirname, '404.html'),
        customer: resolve(__dirname, 'public/index.html'),
        merchant: resolve(__dirname, 'merchant/index.html'),
      },
    },
  },
});
