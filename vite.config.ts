import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { pwa } from './scripts/pwa/plugin';

export default defineConfig({
  plugins: [solid(), vanillaExtractPlugin(), pwa()],
  // The addons import bare 'three'; one copy keeps instanceof working.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
  optimizeDeps: {
    include: [
      'three/webgpu',
      'three/tsl',
      'three/addons/loaders/GLTFLoader.js',
      'three/addons/libs/meshopt_decoder.module.js',
      'three/addons/utils/BufferGeometryUtils.js',
    ],
  },
  build: { target: 'es2023' },
});
