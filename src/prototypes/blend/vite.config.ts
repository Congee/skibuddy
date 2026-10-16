import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const root = resolve(import.meta.dirname, '../../..');

// Builds the prototype page alone: bunx vite build --config src/prototypes/blend/vite.config.ts
export default defineConfig({
  root,
  plugins: [solid()],
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  build: {
    target: 'es2023',
    outDir: resolve(root, 'dist/blend-check'),
    emptyOutDir: true,
    rollupOptions: { input: { blend: resolve(root, 'prototypes/blend.html') } },
  },
});
