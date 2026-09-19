import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Node resolves a bare `buffer` import to the built-in module, a browser
    // bundle resolves it to the npm package. The golden vectors must exercise
    // the implementation the browser runs, so both environments are pinned to
    // the npm package here exactly as in apps/desk/vite.config.ts.
    alias: { buffer: 'buffer/index.js' },
  },
  test: {
    name: 'sdk',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
