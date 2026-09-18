// Drive tools/bundle-check.html through `vite dev` headlessly and report.
// Proves the golden vectors through the BROWSER-resolved module graph (npm
// buffer via the alias, browser crypto.subtle) — Vitest proves the Node graph;
// this proves the one users run. Third leg of the canonical-bytes proof.
import { createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromePath } from '../lib/chrome.mjs';

process.chdir(resolve(fileURLToPath(new URL('../../apps/desk', import.meta.url))));

const vite = await createViteServer({ server: { port: 0, host: '127.0.0.1' } });
await vite.listen();
const target = `http://127.0.0.1:${vite.httpServer.address().port}`;

// tiny proxy that adds the /__bundle-check sink in front of vite
let chrome;
const shutdown = async (c) => { try { chrome?.kill(); } catch {} await vite.close().catch(() => {}); process.exit(c); };
const body = (req) => new Promise((r) => { const b = []; req.on('data', (d) => b.push(d)); req.on('end', () => r(Buffer.concat(b).toString())); });

const proxy = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/bundle-check.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(readFileSync(new URL('./bundle-check.html', import.meta.url)));
    return;
  }
  if (req.method === 'POST' && req.url === '/__bundle-check') {
    const v = JSON.parse(await body(req));
    res.writeHead(204).end();
    console.log(v.lines.join('\n'));
    console.log(v.fail === 0 ? `RESULT: ALL ${v.pass} CHECKS PASS (browser module graph)` : `RESULT: FAIL (${v.fail})`);
    return shutdown(v.fail === 0 ? 0 : 1);
  }
  // sec-fetch-dest must reach Vite: its transform middleware treats a plain
  // JSON request as a static asset (wrong content-type for an ES module) and
  // only recognises it as a module import via this header or a `?import`
  // query. The browser sets it for every import the page's own inline
  // <script type="module"> makes; dropping it here breaks that import.
  const upstream = await fetch(target + req.url, {
    headers: { accept: req.headers.accept ?? '*/*', 'sec-fetch-dest': req.headers['sec-fetch-dest'] ?? '' },
  });
  res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' });
  res.end(Buffer.from(await upstream.arrayBuffer()));
});

setTimeout(() => { console.error('TIMEOUT'); shutdown(1); }, 90_000).unref();

proxy.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${proxy.address().port}/bundle-check.html`;
  chrome = spawn(chromePath(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=/tmp/trustrfq-bundle-check-${process.pid}`, url,
  ], { stdio: 'ignore' });
  chrome.on('error', () => shutdown(1));
});
