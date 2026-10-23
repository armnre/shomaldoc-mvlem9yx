// Builds the apps/app frontend for the self-hosted server (output: server/web-dist).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '../../apps/app');

export default defineConfig({
  root: appDir,
  base: '/',
  plugins: [react()],
  css: { postcss: appDir },
  build: { outDir: path.resolve(here, '../web-dist'), emptyOutDir: true, target: 'es2020', sourcemap: false },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.join(appDir, 'src'),
      'zitejs/api': path.join(appDir, '.zite/api.ts'),
      'zitejs/caller': path.join(here, 'shims/caller.ts'),
      'zitejs/upload': path.join(here, 'shims/upload.ts'),
    },
  },
});
