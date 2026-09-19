// Build config for the standalone RFQ demo (rfq.html -> dist-rfq/index.html),
// deployed as its own Vercel project. Run it through tools/build-rfq-demo.mjs,
// never `vite build --config` directly: that script renames the entry, copies
// the asset allow-list, derives the deploy's vercel.json, and asserts the
// invariants this config only half-enforces.
//
// `shared` is the desk's own plugins/define/resolve block: the demo must run
// the SAME module graph the desk runs, or its signatures would be computed by
// code the golden vectors never pinned.

import { defineConfig } from 'vite';
import { shared } from './vite.config';

export default defineConfig({
  ...shared,

  // public/ holds the landing (hero.html/hero.css/hero.js) and would be copied
  // verbatim. This deploy must contain exactly one page, so nothing is copied
  // wholesale; tools/build-rfq-demo.mjs copies a named allow-list instead.
  publicDir: false,

  build: {
    outDir: 'dist-rfq',
    emptyOutDir: true,
    rollupOptions: { input: ['rfq.html'] },
    // Same reason as the desk build: the modulepreload polyfill is the one
    // inline <script> Vite would emit, and neither CSP has 'unsafe-inline'.
    modulePreload: { polyfill: false },
  },
});
