import { defineConfig } from 'vitest/config';

// Live whole-turn solves, minutes long, kept out of `bun run check`.
export default defineConfig({
  test: { include: ['test/solve/**/*.solve.ts'] },
});
