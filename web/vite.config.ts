import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import translateJSX from './scripts/translate-jsx.mjs';
export default defineConfig({
  envDir: '..',
  plugins: [react({ babel: { plugins: [translateJSX] } })],
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: {
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], icons: ['lucide-react'] } } },
  },
});
