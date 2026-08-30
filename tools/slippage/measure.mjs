// Measure realised slippage vs trade size on Stellar MAINNET using Horizon path-finding.
//
// Horizon's strict-send path finder routes through BOTH the classic orderbook and the AMM pools,
// so the effective rate it returns is what a taker would actually get at that moment. There is no
// historical equivalent: the endpoint only answers "right now", which is why this measurement has
// to be repeated forward in time rather than backfilled.
//
// Faithful port of the 2026-08-24 script (kept as a code block on the Notion page
// "Slippage on Stellar mainnet (2026-08-24)"), with four additions and no change to the original
// metric:
//   1. JSONL output instead of console-only, so runs accumulate into a comparable series.
//   2. bps_vs_mid, an ADDITIONAL column baselined on the true /order_book mid. The original
//      bps_vs_baseline (baseline = smallest trade in the series, so spread is excluded) is
//      untouched, so the 2026-08-24 numbers stay directly comparable.
//   3. Run provenance: planned slot, actual UTC time, drift, Horizon ledger, and the script's own
//      sha256 so an edit mid-window cannot silently mix two methods.
//   4. One retry with backoff on 429/5xx; a failed row is recorded, it does not abort the run.
//
// Two failures on 2026-08-29 forced the scheduling to move into this script, in UTC:
//   * launchd's StartCalendarInterval fired an hour EARLY (16:00 local -> 13:00 UTC, not 14:00).
//     It applied standard time, CET, and ignored that the machine is on CEST. So the plist is now
//     a dumb 5-minute poller and the slot decision is made here, in UTC, where it cannot drift.
//   * Run 2 fired on wake, before the network interface was up, and every single row failed. It
//     still wrote a file, which CLAIMED the slot and silently burned it. So there is now a
//     preflight network probe, and an incomplete run is quarantined instead of claiming its slot.
//
// Read-only, public data, no keys. Usage:
//   node tools/slippage/measure.mjs            # poll: runs only inside an open slot's window
//   node tools/slippage/measure.mjs --manual   # ad-hoc run, never fills a scheduled slot
//   node tools/slippage/measure.mjs --force    # scheduled-style run ignoring the slot window

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(HERE, 'runs');
const FAILED_DIR = join(RUNS_DIR, 'failed');
const SCHEDULE = JSON.parse(readFileSync(join(HERE, 'schedule.json'), 'utf8'));

const HORIZON = 'https://horizon.stellar.org';

const USDC = { code: 'USDC', issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' };
const EURC = { code: 'EURC', issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2' };

// Identical to the 2026-08-24 run. Do not change inside a measurement window.
const XLM_SIZES = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];
const USDC_SIZES = [250, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000];

const SERIES = [
  { pair: 'XLM->USDC', src: null, dst: USDC, sizes: XLM_SIZES },
  { pair: 'USDC->XLM', src: USDC, dst: null, sizes: USDC_SIZES },
  { pair: 'USDC->EURC', src: USDC, dst: EURC, sizes: USDC_SIZES },
];

const MANUAL = process.argv.includes('--manual');
const FORCE = process.argv.includes('--force');

// How early the poller may fire a slot, and how late a missed slot may still be caught up.
// The catch-up window is what lets a slot survive the machine being asleep at its planned time.
const EARLY_TOLERANCE_MS = 150 * 1000;
const CATCHUP_WINDOW_MS = 3 * 60 * 60 * 1000;

// A run that cannot reach at least this share of its rows is quarantined rather than allowed to
// claim its slot, so a dead network cannot silently consume a measurement point.
const MIN_COMPLETE = 0.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- http

async function getJson(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      if (attempt === 0) { await sleep(2000); continue; }
      return { error: `network: ${e.message}` };
    }
    if (res.ok) return { json: await res.json() };
    // 429 and 5xx are worth one retry; a 400 means we built a bad URL and retrying is pointless.
    if ((res.status === 429 || res.status >= 500) && attempt === 0) { await sleep(2000); continue; }
    return { error: `${res.status} ${res.statusText}` };
  }
  return { error: 'unreachable' };
}

// ---------------------------------------------------------------- horizon queries

function assetParams(prefix, a) {
  if (!a) return `${prefix}_asset_type=native`;
  return `${prefix}_asset_type=credit_alphanum4&${prefix}_asset_code=${a.code}&${prefix}_asset_issuer=${a.issuer}`;
}

function destParam(a) {
  return a ? `${a.code}:${a.issuer}` : 'native';
}

async function strictSend(srcAsset, amount, dstAsset) {
  const url =
    `${HORIZON}/paths/strict-send?` +
    `${assetParams('source', srcAsset)}` +
    `&source_amount=${amount}` +
    `&destination_assets=${encodeURIComponent(destParam(dstAsset))}`;
  const { json, error } = await getJson(url);
  if (error) return { url, error };
  const recs = json._embedded?.records ?? [];
  if (!recs.length) return { url, error: 'no path' };
  const best = recs.reduce((a, b) =>
    Number(b.destination_amount) > Number(a.destination_amount) ? b : a
  );
  return {
    url,
    out: Number(best.destination_amount),
    hops: best.path?.length ?? 0,
    path: (best.path ?? []).map((p) => (p.asset_type === 'native' ? 'XLM' : p.asset_code)),
  };
}

// Top-of-book mid for the same direction, so bps_vs_mid includes the spread the original
// baseline deliberately excluded. Horizon quotes price as buying-asset per selling-asset,
// which is the same orientation as `out / in`, so the two are directly comparable.
async function topOfBook(srcAsset, dstAsset) {
  const url =
    `${HORIZON}/order_book?` +
    `${assetParams('selling', srcAsset)}&${assetParams('buying', dstAsset)}&limit=1`;
  const { json, error } = await getJson(url);
  if (error) return { url, error };
  const bid = json.bids?.[0], ask = json.asks?.[0];
  if (!bid || !ask) return { url, error: 'empty book' };
  const bidP = Number(bid.price), askP = Number(ask.price);
  const mid = (bidP + askP) / 2;
  return { url, bid: bidP, ask: askP, mid, spread_bps: ((askP - bidP) / mid) * 10000 };
}

// Horizon reachable at all? A run fired by launchd on wake can start before the network
// interface is up. Probing first, and giving up without writing anything, keeps a dead network
// from consuming a slot.
async function preflight() {
  for (let i = 0; i < 6; i++) {
    const { error } = await getJson(`${HORIZON}/`);
    if (!error) return true;
    console.log(`[slippage] preflight ${i + 1}/6 failed (${error}), waiting 20s`);
    if (i < 5) await sleep(20000);
  }
  return false;
}

async function latestLedger() {
  const { json, error } = await getJson(`${HORIZON}/`);
  return error ? null : json.history_latest_ledger ?? null;
}

// ---------------------------------------------------------------- slot binding

// Which planned slot does this run belong to? The plist is a dumb 5-minute poller, so most
// invocations answer "none" and exit. A slot is open from 2.5 minutes before its planned UTC
// time until 3 hours after, and the late half of that window is what lets a slot survive the
// machine being asleep. drift_minutes records exactly how late it landed rather than hiding it.
function bindSlot(nowMs) {
  const claimed = new Set();
  if (existsSync(RUNS_DIR)) {
    for (const f of readdirSync(RUNS_DIR)) {
      const m = /-run(\d+)\.jsonl$/.exec(f);
      if (m) claimed.add(Number(m[1]));
    }
  }
  // Only a slot whose window is open right now. Everything is compared in UTC epoch ms, so the
  // machine's timezone and DST play no part in the decision.
  const due = SCHEDULE.slots
    .filter((s) => !claimed.has(s.run))
    .filter((s) => {
      const p = Date.parse(s.planned_at_utc);
      return nowMs >= p - EARLY_TOLERANCE_MS && nowMs <= p + CATCHUP_WINDOW_MS;
    });
  if (!due.length) return null;
  // If two windows overlap, take the earlier slot: it is the one at risk of expiring.
  return due.reduce((a, b) => (Date.parse(a.planned_at_utc) <= Date.parse(b.planned_at_utc) ? a : b));
}

// ---------------------------------------------------------------- run

async function measureSeries(s) {
  const book = await topOfBook(s.src, s.dst);
  await sleep(300);

  const raw = [];
  for (const size of s.sizes) {
    const r = await strictSend(s.src, size, s.dst);
    await sleep(300);
    raw.push(r.error
      ? { send: size, error: r.error, url: r.url }
      : { send: size, receive: r.out, rate: r.out / size, hops: r.hops, path: r.path, url: r.url });
  }

  const base = raw.find((r) => r.rate);
  const rows = raw.map((r) => {
    if (r.error) return r;
    return {
      ...r,
      // The original 2026-08-24 metric, formula unchanged: baseline is the smallest trade in the
      // series, so the bid-ask spread is excluded and the figure is conservative.
      bps_vs_baseline: base ? ((base.rate - r.rate) / base.rate) * 10000 : null,
      // The added metric: baselined on the true mid, so it includes the spread.
      bps_vs_mid: book.mid ? ((book.mid - r.rate) / book.mid) * 10000 : null,
    };
  });

  return {
    pair: s.pair,
    baseline_send: base?.send ?? null,
    baseline_rate: base?.rate ?? null,
    mid: book.mid ?? null,
    best_bid: book.bid ?? null,
    best_ask: book.ask ?? null,
    spread_bps: book.spread_bps ?? null,
    book_error: book.error ?? null,
    rows,
  };
}

const startedMs = Date.now();
const slot = MANUAL || FORCE ? null : bindSlot(startedMs);

// The poller fires every 5 minutes; almost always there is nothing due and this is where it stops.
if (!MANUAL && !FORCE && !slot) process.exit(0);

if (!(await preflight())) {
  // No network. Exit WITHOUT writing anything, so the slot stays open and a later poll retries it.
  // Run 2 on 2026-08-29 is why: it fired on wake before the interface was up, every row failed,
  // and the empty file still claimed the slot.
  console.log(`[slippage] ${new Date().toISOString()} Horizon unreachable, aborting without claiming a slot`);
  process.exit(0);
}

const actual = new Date(startedMs).toISOString();
const scriptSha = createHash('sha256')
  .update(readFileSync(fileURLToPath(import.meta.url)))
  .digest('hex');

const meta = {
  type: 'run',
  kind: MANUAL ? 'manual' : FORCE ? 'forced' : 'scheduled',
  run_number: slot?.run ?? null,
  planned_at_utc: slot?.planned_at_utc ?? null,
  actual_at_utc: actual,
  drift_minutes: slot ? Math.round((startedMs - Date.parse(slot.planned_at_utc)) / 60000) : null,
  slot_why: slot?.why ?? null,
  slot_role: slot?.role ?? null,
  horizon: HORIZON,
  network: 'mainnet',
  horizon_latest_ledger: await latestLedger(),
  script_sha256: scriptSha,
  node_version: process.version,
};

console.log(
  `[slippage] ${meta.kind} run` +
  (meta.run_number ? ` #${meta.run_number} (planned ${meta.planned_at_utc}, drift ${meta.drift_minutes}m)` : '') +
  ` at ${actual}  ledger ${meta.horizon_latest_ledger}`
);

const lines = [JSON.stringify(meta)];
const results = [];

for (const s of SERIES) {
  const result = await measureSeries(s);
  results.push(result);
  lines.push(JSON.stringify({ type: 'series', run_number: meta.run_number, actual_at_utc: actual, ...result }));

  console.log(`\n=== ${result.pair} ===`);
  console.log(
    result.mid
      ? `  mid ${result.mid.toFixed(7)}  spread ${result.spread_bps.toFixed(2)} bps`
      : `  no orderbook mid (${result.book_error})`
  );
  for (const r of result.rows) {
    if (r.error) { console.log(`  send ${r.send}  ERROR ${r.error}`); continue; }
    console.log(
      `  send ${String(r.send).padStart(8)}  recv ${r.receive.toFixed(2).padStart(14)}` +
      `  rate ${r.rate.toFixed(7)}` +
      `  ${r.bps_vs_baseline.toFixed(1).padStart(8)} bps vs base` +
      `  ${(r.bps_vs_mid ?? NaN).toFixed(1).padStart(8)} bps vs mid` +
      `  hops ${r.hops}`
    );
  }
}

// A run only claims its slot if it actually measured something. Anything less is quarantined in
// runs/failed/ for the record, leaving the slot open for a later poll inside its catch-up window.
const allRows = results.flatMap((r) => r.rows);
const goodRows = allRows.filter((r) => !r.error).length;
const everySeriesHasBaseline = results.every((r) => r.baseline_rate !== null);
const complete = everySeriesHasBaseline && goodRows >= allRows.length * MIN_COMPLETE;

const stamp = actual.replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z');

if (!complete) {
  mkdirSync(FAILED_DIR, { recursive: true });
  const name = `${stamp}-run${meta.run_number ?? 'x'}-INCOMPLETE.jsonl`;
  writeFileSync(join(FAILED_DIR, name), lines.join('\n') + '\n');
  console.log(`\n[slippage] INCOMPLETE (${goodRows}/${allRows.length} rows) -> runs/failed/${name}`);
  console.log(`[slippage] slot ${meta.run_number ?? '-'} left OPEN for a later poll`);
  process.exit(0);
}

mkdirSync(RUNS_DIR, { recursive: true });
const name = MANUAL ? `${stamp}-manual.jsonl`
  : FORCE ? `${stamp}-forced.jsonl`
  : `${stamp}-run${meta.run_number}.jsonl`;
writeFileSync(join(RUNS_DIR, name), lines.join('\n') + '\n');
console.log(`\n[slippage] wrote runs/${name}  (${goodRows}/${allRows.length} rows good)`);
