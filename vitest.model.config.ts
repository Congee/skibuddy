import { defineConfig } from 'vitest/config';

// Integration checks against public/models/anatomy.glb, kept out of `bun run check`.
export default defineConfig({
  test: { include: ['test/model/**/*.model.ts'] },
});
