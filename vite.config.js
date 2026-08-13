import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: r('index.html'),
        admin: r('admin.html'),
      },
    },
  },
});
