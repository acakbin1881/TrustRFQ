// Resolve a Chrome or Chromium binary for the headless tools. CHROME_PATH wins;
// otherwise the Playwright browser cache is searched, then the usual system
// locations. Throws when nothing is found so a missing browser is a clear
// message, not a cryptic spawn error.

import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = os.homedir();
const CACHES = [
  path.join(home, 'Library', 'Caches', 'ms-playwright'), // macOS
  path.join(home, '.cache', 'ms-playwright'), // Linux
];
const SYSTEM = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function playwrightCandidates() {
  const out = [];
  for (const cache of CACHES) {
    if (!existsSync(cache)) continue;
    const dirs = readdirSync(cache).filter((n) => n.startsWith('chromium-')).sort().reverse();
    for (const d of dirs) {
      out.push(
        path.join(cache, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(cache, d, 'chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(cache, d, 'chrome-linux', 'chrome'),
      );
    }
  }
  return out;
}

export function chromePath() {
  const fromEnv = process.env.CHROME_PATH || process.env.CHROME;
  if (fromEnv) {
    if (existsSync(fromEnv)) return fromEnv;
    throw new Error(`CHROME_PATH points at ${fromEnv}, which does not exist`);
  }
  const found = [...playwrightCandidates(), ...SYSTEM].find((p) => existsSync(p));
  if (!found) {
    throw new Error('No Chrome or Chromium binary found. Set CHROME_PATH to one (a Playwright-cached "Chrome for Testing" works).');
  }
  return found;
}
