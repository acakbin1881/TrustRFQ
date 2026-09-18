// Idempotent Testnet prep for the click-census E2E.
//
//   node tools/e2e/prepare-keys.mjs [--pair xlm-xlm|xlm-usdc] [--fresh-maker]
//
// - Creates e2e-keys.json at the repo root (gitignored) with dedicated maker
//   and taker keypairs if missing. NEVER touches demo-keys.json or the demo
//   identities (running tools/fund-demo.mjs with an empty MAKER_S would
//   overwrite them; this script never calls it).
// - Friendbot-funds any account not yet on-chain.
// - --pair xlm-usdc: provisions the TAKER with demo USDC via tools/mint-usdc.mjs
//   (which opens the trustline itself). The MAKER's trustline is deliberately
//   left untouched: the missing trustline is exactly what Run 2 measures (the
//   in-app changeTrust prompt). --fresh-maker regenerates the maker key for a
//   repeat of Run 2, since the trustline prompt is once per account.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { REPO_ROOT } from './lib.mjs';

const HORIZON = 'https://horizon-testnet.stellar.org';
const FRIENDBOT = 'https://friendbot.stellar.org';
// The temporary demo USDC issuer pinned in src/core/tokens.ts.
const USDC_ISSUER = 'GBJH2XCGKRMFKCBYPFJHHGISZGLOYZ3TM3IMFQPQSK7NT2L7JUARLC26';
const TAKER_USDC_TARGET = '1000';

const KEYS_PATH = path.join(REPO_ROOT, 'e2e-keys.json');
const pair = process.argv.includes('--pair')
  ? process.argv[process.argv.indexOf('--pair') + 1]
  : 'xlm-xlm';
const freshMaker = process.argv.includes('--fresh-maker');

const log = (...a) => console.log('[prepare]', ...a);

function loadKeys() {
  if (!existsSync(KEYS_PATH)) return {};
  return JSON.parse(readFileSync(KEYS_PATH, 'utf8'));
}

function genRole() {
  const kp = Keypair.random();
  return { public: kp.publicKey(), secret: kp.secret() };
}

async function accountOrNull(pub) {
  const res = await fetch(`${HORIZON}/accounts/${pub}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon ${res.status} for ${pub}`);
  return res.json();
}

async function friendbot(pub) {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(`${FRIENDBOT}?addr=${encodeURIComponent(pub)}`);
      if (res.ok) return;
      const body = await res.text();
      if (res.status === 400 && /already.?exist|op_already_exists/i.test(body)) return;
      log(`friendbot ${res.status}, retry ${i + 1}/8`);
    } catch (e) {
      log(`friendbot error ${e.message}, retry ${i + 1}/8`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`friendbot failed for ${pub}`);
}

const usdcBalance = (acct) => {
  const b = acct.balances.find((x) => x.asset_code === 'USDC' && x.asset_issuer === USDC_ISSUER);
  return b ? parseFloat(b.balance) : null; // null = no trustline
};

async function main() {
  const keys = loadKeys();
  let changed = false;
  if (!keys.maker || freshMaker) { keys.maker = genRole(); changed = true; log('generated maker', keys.maker.public); }
  if (!keys.taker) { keys.taker = genRole(); changed = true; log('generated taker', keys.taker.public); }
  if (changed) {
    writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2), { mode: 0o600 });
    log('wrote', KEYS_PATH);
  }

  for (const role of ['maker', 'taker']) {
    const pub = keys[role].public;
    if (await accountOrNull(pub)) { log(role, 'already on-chain'); continue; }
    log(role, 'not on-chain, friendbot funding...');
    await friendbot(pub);
    log(role, 'funded');
  }

  const summary = { pair, maker: keys.maker.public, taker: keys.taker.public };

  if (pair === 'xlm-usdc') {
    const takerAcct = await accountOrNull(keys.taker.public);
    const held = usdcBalance(takerAcct);
    if (held !== null && held >= parseFloat(TAKER_USDC_TARGET)) {
      log(`taker already holds ${held} USDC, skipping mint`);
    } else {
      log('provisioning taker USDC via tools/mint-usdc.mjs...');
      const r = spawnSync('node', [path.join(REPO_ROOT, 'tools', 'testnet', 'mint-usdc.mjs')], {
        env: { ...process.env, TARGET_S: keys.taker.secret, AMOUNT: TAKER_USDC_TARGET },
        stdio: 'inherit',
      });
      if (r.status !== 0) throw new Error('mint-usdc.mjs failed');
    }
    summary.taker_usdc = usdcBalance(await accountOrNull(keys.taker.public));

    const makerAcct = await accountOrNull(keys.maker.public);
    const makerTrust = usdcBalance(makerAcct) !== null;
    summary.maker_usdc_trustline = makerTrust;
    if (makerTrust) {
      log('WARNING: maker already has a USDC trustline, so the changeTrust prompt will NOT fire.');
      log('         Rerun with --fresh-maker to measure the trustline branch.');
    }
  }

  console.log('PREPARED ' + JSON.stringify(summary));
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
