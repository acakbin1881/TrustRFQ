// Build the standalone RFQ demo: rfq.html -> dist-rfq/index.html, one page,
// nothing else, ready to `vercel deploy dist-rfq`.
//
// Why a script and not plain `vite build --config`: three things this deploy
// must guarantee are NOT expressible in a vite config.
//   1. ONE page. public/ holds the landing (hero.*) and Vite would copy it
//      verbatim, so vite.rfq.config.ts sets publicDir:false and the asset
//      allow-list below is copied by hand instead. A file not named here does
//      not ship.
//   2. The page must answer at `/`. Vite names an HTML output after its source
//      path (rfq.html -> dist-rfq/rfq.html), so the entry is renamed here. Its
//      asset refs are absolute (`/assets/...`), so renaming is safe.
//   3. The claims in rfq.html's own comments must be true. The asserts below
//      fail the build rather than let a silently-wrong deploy ship: no second
//      page, no inline <script> (neither CSP has 'unsafe-inline'), no database
//      client in the bundle, no dangling local asset reference, and a CSP whose
//      connect-src matches what the bundle actually talks to.
//
// Usage: npm run build:rfq-demo

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist-rfq');

/** public/ files this deploy is allowed to ship. hero.html / hero.css /
 *  hero.js are deliberately absent: they are the landing, a second page.
 *  supabase-config.js is absent too — nothing in this bundle reads it. */
const PUBLIC_ALLOW_LIST = ['styles.css', 'intent.css', 'otc-config.js', 'favicon.svg'];

const log = (m) => console.log(`[rfq-demo] ${m}`);
const fail = (m) => { console.error(`[rfq-demo] FAILED: ${m}`); process.exit(1); };

// --- 1. typecheck, then build -------------------------------------------------

log('typechecking...');
execFileSync('npx', ['tsc', '--noEmit'], { cwd: ROOT, stdio: 'inherit' });

log('building rfq.html -> dist-rfq/...');
await build({ configFile: path.join(ROOT, 'vite.rfq.config.ts') });

// --- 2. rename the entry so the single page answers at / ----------------------

if (!existsSync(path.join(OUT, 'rfq.html'))) fail('vite did not emit dist-rfq/rfq.html');
renameSync(path.join(OUT, 'rfq.html'), path.join(OUT, 'index.html'));
log('entry renamed: rfq.html -> index.html');

// --- 3. copy the asset allow-list + the deploy's own vercel.json --------------

for (const name of PUBLIC_ALLOW_LIST) {
  const src = path.join(ROOT, 'public', name);
  if (!existsSync(src)) fail(`public/${name} is missing — the allow-list is stale`);
  copyFileSync(src, path.join(OUT, name));
}
log(`copied ${PUBLIC_ALLOW_LIST.length} public assets: ${PUBLIC_ALLOW_LIST.join(', ')}`);

copyFileSync(path.join(ROOT, 'vercel.rfq-demo.json'), path.join(OUT, 'vercel.json'));
log('copied vercel.rfq-demo.json -> dist-rfq/vercel.json');

// --- 4. assert the deploy is what it claims to be -----------------------------

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(path.relative(OUT, p));
  }
  return acc;
};
const files = walk(OUT);
const html = readFileSync(path.join(OUT, 'index.html'), 'utf8');

// 4a. exactly one page, and it is index.html
const pages = files.filter((f) => f.endsWith('.html'));
if (pages.length !== 1 || pages[0] !== 'index.html') {
  fail(`expected exactly one page (index.html), found: ${pages.join(', ') || '(none)'}`);
}

// 4b. no landing, no desk, no stray config leaked in
for (const forbidden of ['hero.html', 'hero.css', 'hero.js', 'otc.html', 'supabase-config.js']) {
  if (files.includes(forbidden)) fail(`${forbidden} must not ship in the RFQ demo`);
}

// 4c. no inline <script> — the CSP has no 'unsafe-inline' in script-src
if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) {
  fail('index.html contains an inline <script>; the CSP would block it');
}

// 4d. no database client in the bundle. This is what lets the demo's CSP drop
//     the Supabase origins the desk's CSP needs — assert it, never assume it.
//     Matching a bare /supabase/i is WRONG and was tried first: src/config.ts
//     reads `window.SUPABASE_URL` / `SUPABASE_ANON_KEY` for the desk's benefit,
//     and the minifier keeps those two property reads even here, where they
//     evaluate to '' (this page never loads supabase-config.js). Those reads
//     are inert. What must be absent is the LIBRARY and the project host — if
//     src/data/supabase.ts were ever pulled in, every marker below appears.
const DB_MARKERS = ['supabase-js', 'SupabaseClient', 'postgrest', 'gotrue', 'GoTrue', 'realtime-js', '.supabase.co'];
for (const js of files.filter((f) => f.endsWith('.js'))) {
  const body = readFileSync(path.join(OUT, js), 'utf8');
  const hit = DB_MARKERS.find((m) => body.includes(m));
  if (hit) fail(`${js} contains "${hit}" — the RFQ lane must not reach a database client`);
}

// 4e. every local asset the page references actually shipped
const refs = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
for (const ref of refs) {
  const rel = decodeURIComponent(ref.replace(/^\//, '').split(/[?#]/)[0]);
  if (!existsSync(path.join(OUT, rel))) fail(`index.html references /${rel}, which is not in the build`);
}

// 4f. the shipped CSP matches the bundle's actual reach
const csp = JSON.parse(readFileSync(path.join(OUT, 'vercel.json'), 'utf8'))
  .headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
if (!csp.includes('https://trustrfq-maker-server.vercel.app')) {
  fail("the demo's CSP connect-src is missing the maker origin — quotes would be blocked");
}
if (/supabase/i.test(csp)) fail("the demo's CSP allows a Supabase origin the bundle never uses");
if (csp.includes("'unsafe-inline'") && /script-src[^;]*'unsafe-inline'/.test(csp)) {
  fail("script-src must never gain 'unsafe-inline'");
}

const totalKb = Math.round(
  files.reduce((n, f) => n + statSync(path.join(OUT, f)).size, 0) / 1024,
);
log(`OK — ${files.length} files, ${totalKb} KB, one page (index.html)`);
log(`refs verified: ${refs.join(' ')}`);
// --local-config is NOT optional and its absence fails SILENTLY. The repo root
// is itself linked to the desk's Vercel project and carries its own
// vercel.json; without this flag the CLI applies THAT file to this deployment,
// which shipped the demo with the desk's Supabase-bearing CSP and the desk's
// /intent redirect — a 200 the whole way, just wrong. Caught only by reading
// the served headers back.
log('deploy with:');
log('  vercel deploy --cwd dist-rfq \\');
log(`    --local-config ${path.join(OUT, 'vercel.json')} \\`);
log('    --project trustrfqdemo --yes --prod');
log('then verify the served CSP: curl -sI https://trustrfqdemo.vercel.app/ | grep -i content-security');
