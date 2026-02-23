import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: true,
    host: true,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: true,
    rollupOptions: {
      input: 'index.html',
    },
  },
});

