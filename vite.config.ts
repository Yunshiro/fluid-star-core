import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4732,
    strictPort: true,
  },
  build: {
    target: ['es2020', 'safari15', 'chrome90'],
    sourcemap: false,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 800,
  },
});
