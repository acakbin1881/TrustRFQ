import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Everything both desk builds must share, so their module graphs are identical. */
export const shared = {
  plugins: [react()],

  // Some wallet/SDK dependencies reference Node's `global` at module scope.
  // Without this shim the whole module graph dies with "global is not defined"
  // at load.
  define: { global: 'globalThis' },

  resolve: {
    alias: {
      // Node resolves a bare `buffer` import to the built-in module, a browser
      // bundle resolves it to the npm package. Vitest must exercise the code the
      // browser runs, which is what the golden vectors exist to catch, so both
      // are pinned to the npm package.
      buffer: 'buffer/index.js',
    },
  },
};

export default defineConfig({
  ...shared,

  build: {
    // otc.html is the desk entry. hero.html, hero.js, styles.css, intent.css
    // and the config scripts live in public/ and are copied verbatim, never
    // bundled. The RFQ-only demo is a second entry with its own config,
    // vite.rfq.config.ts, built by tools/build-rfq-demo.mjs.
    rollupOptions: { input: ['otc.html'] },

    // Vite's modulepreload polyfill is the one inline <script> it would emit.
    // vercel.json's CSP has no 'unsafe-inline' and must never gain one: an
    // injected script could rewrite a swap before the wallet prompt.
    modulePreload: { polyfill: false },
  },

  test: {
    name: 'desk',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
