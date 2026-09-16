// Build config for the standalone RFQ demo (rfq.html -> dist-rfq/index.html),
// deployed as its own Vercel project. Run it through tools/build-rfq-demo.mjs,
// never `vite build --config` directly: that script is what renames the entry,
// copies the asset allow-list, writes the deploy's vercel.json, and asserts the
// invariants this config only half-enforces.
//
// Everything outside `build` mirrors vite.config.ts on purpose — the demo must
// run the SAME module graph the desk runs (same `global` shim, same npm buffer),
// or its signatures would be computed by different code than the one the golden
// vectors pin.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  define: { global: 'globalThis' },

  resolve: {
    alias: { buffer: 'buffer/index.js' },
  },

  // public/ holds the landing (hero.html/hero.css/hero.js) and would be copied
  // verbatim — this deploy must contain exactly one page, so nothing is copied
  // wholesale. tools/build-rfq-demo.mjs copies a named allow-list instead.
  publicDir: false,

  build: {
    outDir: 'dist-rfq',
    emptyOutDir: true,
    rollupOptions: { input: ['rfq.html'] },
    // Same reason as the main build: the modulepreload polyfill is the one
    // inline <script> Vite would emit, and neither CSP has 'unsafe-inline'.
    modulePreload: { polyfill: false },
  },
});
