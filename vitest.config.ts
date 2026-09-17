import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/desk/vite.config.ts', 'packages/sdk/vitest.config.ts'],
  },
});
