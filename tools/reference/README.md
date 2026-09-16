# Vanilla reference implementation

The original no-build version of the desk, kept frozen as a reference. It is not
deployed and not part of the application: the shipped desk is `otc.html` plus the
React + TypeScript sources under `src/`.

- `canonical.js` derives the canonical `fill` arguments both parties sign. It is
  the implementation the golden vectors in `fixtures/canonical-args.json` were
  captured from, which is why it is still here: `tools/capture.html` imports it to
  regenerate those vectors against the same module graph they were first computed
  with (`npm run capture`).
- `otc.js` is the vanilla desk that consumed it. Retained only so the captured
  vectors have a readable provenance; do not develop against it.

`src/core/canonical.ts` is the live port, pinned byte-for-byte to those vectors by
`src/core/canonical.test.ts`.
