// Read a trade-size sweep and turn it into the numbers the grant argument needs.
//
// Three things happen here that measure.mjs deliberately does not do:
//
// 1. DEDUPE MULTI-HOP OPERATIONS. A path payment routed YxT -> USDC -> XLM touches two of the
//    swept orderbooks, so the same operation id lands in both pair sweeps. Summing the legs would
//    count one taker order twice and inflate its size; the value that actually passed through is
//    the LARGEST leg, so that is what is kept.
// 2. RESOLVE WHAT EACH LARGE OPERATION REALLY WAS. measure.mjs only ever sees a leg, so its
//    `leg_dir` is the direction on that one orderbook. Above the headline threshold the set is
//    small enough to ask Horizon directly for each operation's type, true end-to-end assets and
//    source account.
// 3. SEPARATE BOT LOOPS FROM CUSTOMER FLOW. A path payment whose `from` equals its `to` is a
//    circular arbitrage, not somebody moving value. Counting those toward "trades at size happen"
//    would overstate the case, so they are reported on their own line and excluded from the
//    headline. This is the number most likely to be challenged by a reviewer, so it is stated up
//    front rather than buried.
//
// Usage:
//   node tools/tradesize/report.mjs                          # newest run in runs/
//   node tools/tradesize/report.mjs --run 20260903T0700Z      # a specific stamp
//   node tools/tradesize/report.mjs --threshold 20000         # headline threshold in USD

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HORIZON = 'https://horizon.stellar.org';
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(HERE, 'runs');

const arg = (name, dflt) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt;
const THRESHOLD = Number(arg('--threshold', '20000'));

const stamps = readdirSync(RUNS_DIR)
  .filter((f) => f.endsWith('-summary.json'))
  .map((f) => f.replace('-summary.json', ''))
  .sort();
const stamp = arg('--run', stamps[stamps.length - 1]);
if (!stamp) throw new Error('no runs found in runs/; run measure.mjs first');

const summary = JSON.parse(readFileSync(join(RUNS_DIR, `${stamp}-summary.json`), 'utf8'));
const detail = readFileSync(join(RUNS_DIR, summary.detail_file), 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const usd = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (a, b) => (b ? ((100 * a) / b).toFixed(2) + '%' : '-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolving thousands of operations WILL earn a 429 from public Horizon if pushed, and the
// cross-check runs right after that burst, so it is the first thing to fall over. Measured
// 2026-09-03: 6,880 operation fetches at 6 concurrent with no pacing tripped the limit, and it
// did not clear within 5 seconds. Hence a long backoff here (2s, 8s, 32s, 128s) rather than the
// sub-second one measure.mjs can afford, and the paced resolve loop below.
const BACKOFF_MS = [2000, 8000, 32000, 128000];
async function getJson(url) {
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return res.json();
      if (res.status !== 429 && res.status < 500) return { __status: res.status };
      if (res.status === 429 && attempt === 0) console.log('    rate limited by Horizon, backing off...');
      await sleep(BACKOFF_MS[attempt]);
    } catch {
      if (attempt === BACKOFF_MS.length - 1) throw new Error(`gave up on ${url}`);
      await sleep(BACKOFF_MS[attempt]);
    }
  }
  throw new Error(`gave up on ${url}`);
}

// --- 1. the shape of the whole window ------------------------------------------------------

console.log(`\nTRADE-SIZE DISTRIBUTION  ${summary.window_start_utc} -> ${summary.window_end_utc}`
  + `  (${(+summary.days).toFixed(2).replace(/\.00$/, '')} days, ${summary.network})`);
console.log(`unit: ${summary.unit}`);
console.log(`notional: ${summary.notional_definition}\n`);

const E = summary.edges_usd;
let allOps = 0;
let allUsd = 0;
for (const st of Object.values(summary.pairs)) {
  allOps += st.ops;
  allUsd += st.usd_total;
}

console.log('  bucket'.padEnd(22) + 'operations'.padStart(12) + 'share'.padStart(9)
  + 'volume'.padStart(16) + 'share'.padStart(9) + '   cumulative ops at or above');
const combined = E.map(() => 0);
const combinedUsd = E.map(() => 0);
for (const st of Object.values(summary.pairs)) {
  st.hist.forEach((c, i) => (combined[i] += c));
  st.hist_usd.forEach((v, i) => (combinedUsd[i] += v));
}
let cum = 0;
const cumAtOrAbove = combined.map(() => 0);
for (let i = combined.length - 1; i >= 0; i--) {
  cum += combined[i];
  cumAtOrAbove[i] = cum;
}
for (let i = 0; i < E.length; i++) {
  if (!combined[i] && !cumAtOrAbove[i]) continue;
  const hi = i + 1 < E.length ? usd(E[i + 1]) : 'and up';
  const label = i + 1 < E.length ? `${usd(E[i])} - ${hi}` : `${usd(E[i])} ${hi}`;
  console.log(
    '  ' + label.padEnd(20)
    + String(combined[i]).padStart(12)
    + pct(combined[i], allOps).padStart(9)
    + usd(combinedUsd[i]).padStart(16)
    + pct(combinedUsd[i], allUsd).padStart(9)
    + String(cumAtOrAbove[i]).padStart(16)
  );
}
console.log('  ' + 'TOTAL'.padEnd(20) + String(allOps).padStart(12) + ''.padStart(9) + usd(allUsd).padStart(16));
console.log('\n  per pair:');
for (const [k, st] of Object.entries(summary.pairs)) {
  console.log(`    ${k.padEnd(11)} ${String(st.ops).padStart(9)} ops from ${String(st.trades).padStart(9)} trade records`
    + `  (fan-out ${(st.trades / st.ops).toFixed(2)}x)  ${usd(st.usd_total).padStart(14)}`
    + `  largest ${usd(st.max_usd)}`);
  console.log(`    ${''.padEnd(11)} legs: ${JSON.stringify(st.by_dir)}`
    + `   taker side unresolved on ${st.unknown_taker_ops} ops`);
}

// --- 1b. cross-check the sweep against Horizon's own aggregation ---------------------------
//
// The sweep walks 1.3M individual trade records and folds them by hand, so it is worth proving
// that nothing was dropped at a page boundary or double-counted on a retry. /trade_aggregations
// computes trade counts and per-asset volume for the same window server-side, by a completely
// different code path, which makes it an independent check rather than a restatement.

const AGG = {
  'XLM/USDC': 'base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=USDC'
    + '&counter_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  'USDC/EURC': 'base_asset_type=credit_alphanum4&base_asset_code=USDC'
    + '&base_asset_issuer=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
    + '&counter_asset_type=credit_alphanum4&counter_asset_code=EURC'
    + '&counter_asset_issuer=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
};
const startMs = Date.parse(summary.window_start_utc);
const endMs = Date.parse(summary.window_end_utc);

console.log('\n  cross-check against /trade_aggregations (independent server-side count):');
console.log('  ' + 'pair'.padEnd(12) + 'trades swept'.padStart(14) + 'trades agg'.padStart(13)
  + 'delta'.padStart(9) + 'USDC swept'.padStart(16) + 'USDC agg'.padStart(16) + 'delta'.padStart(9));
for (const [pairKey, q] of Object.entries(AGG)) {
  const st = summary.pairs[pairKey];
  if (!st) continue;
  const url = `${HORIZON}/trade_aggregations?${q}&start_time=${startMs}&end_time=${endMs}`
    + '&resolution=86400000&limit=200';
  const recs = (await getJson(url))._embedded.records;
  const aggTrades = recs.reduce((s, r) => s + Number(r.trade_count), 0);
  // The USDC leg is `counter_volume` on XLM/USDC and `base_volume` on USDC/EURC.
  const volKey = pairKey === 'USDC/EURC' ? 'base_volume' : 'counter_volume';
  const aggUsd = recs.reduce((s, r) => s + Number(r[volKey]), 0);
  const dT = pct(Math.abs(st.trades - aggTrades), aggTrades);
  const dU = pct(Math.abs(st.usd_total - aggUsd), aggUsd);
  console.log('  ' + pairKey.padEnd(12) + String(st.trades).padStart(14) + String(aggTrades).padStart(13)
    + dT.padStart(9) + usd(st.usd_total).padStart(16) + usd(aggUsd).padStart(16) + dU.padStart(9));
}

// --- 2. dedupe the detail rows and resolve the large operations -----------------------------

const byOp = new Map();
for (const r of detail) {
  const prev = byOp.get(r.op);
  // One operation, possibly two legs: the value that passed through is the largest leg.
  if (!prev || r.usd > prev.usd) byOp.set(r.op, { ...r, legs: (prev?.legs || 0) + 1 });
  else prev.legs += 1;
}
const deduped = [...byOp.values()].sort((a, b) => b.usd - a.usd);
const multiLeg = deduped.filter((r) => r.legs > 1).length;
console.log(`\n  detail rows at or above ${usd(summary.detail_floor_usd)}: ${detail.length} legs`
  + ` -> ${deduped.length} distinct operations (${multiLeg} touched both pairs)`);

// EVERY deduped operation is resolved, not just those above the headline threshold. The slicing
// analysis in section 4 exists precisely to catch parent orders whose individual slices sit
// BELOW the threshold, so it cannot be fed a threshold-filtered set. Resolutions are cached per
// run, so re-reading the same sweep at a different threshold costs no requests at all.
const cachePath = join(RUNS_DIR, `${stamp}-resolved.json`);
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const missing = deduped.filter((r) => !cache[r.op]);
console.log(`  resolving all ${deduped.length} operations against Horizon`
  + `  (${deduped.length - missing.length} cached, ${missing.length} to fetch)`);

// Returns null on failure. A FAILED LOOKUP MUST NEVER BE CACHED: an earlier version stored
// `http_429` entries during a rate-limit storm, and because they carried a klass they silently
// dropped 4,621 operations out of the slicing analysis while the report still printed a
// confident-looking total. A missing number is recoverable; a wrong number that looks present
// is not.
async function resolve(r) {
  const d = await getJson(`${HORIZON}/operations/${r.op}`);
  if (d.__status) return null;
  const sym = (type, code) => (type === 'native' ? 'XLM' : code);
  const out = { op_type: d.type, source_account: d.source_account || null };
  if (d.type && d.type.startsWith('path_payment')) {
    out.src = sym(d.source_asset_type, d.source_asset_code);
    out.dst = sym(d.asset_type, d.asset_code);
    out.hops = Array.isArray(d.path) ? d.path.length : 0;
    // A path payment that pays itself is an arbitrage loop, not value being moved.
    out.klass = d.from === d.to ? 'arbitrage_loop' : 'market_order';
  } else if (d.type && d.type.includes('offer')) {
    out.src = sym(d.selling_asset_type, d.selling_asset_code);
    out.dst = sym(d.buying_asset_type, d.buying_asset_code);
    // An offer that crossed the book took liquidity, but it is a limit order, not a market
    // order, and at this size it is usually a market maker. Kept apart from both other classes.
    out.klass = 'crossing_offer';
  } else {
    out.klass = 'other';
  }
  return out;
}

// Paced against a public endpoint: 3 at a time with a breath in between. Progress is
// checkpointed to the cache every 400, so an interrupted pass resumes for free.
//
// Running out of rate-limit budget is EXPECTED on a large sweep, not exceptional: the operation
// endpoint is one request per row, and 9,012 rows on top of the sweep's own 6,678 exhausts what
// public Horizon will give one IP. So exhaustion is handled as a normal outcome - save, warn,
// and analyse what we have - rather than as a crash that throws away the partial pass.
let exhausted = false;
for (let i = 0; i < missing.length && !exhausted; i += 3) {
  const batch = missing.slice(i, i + 3);
  try {
    const got = await Promise.all(batch.map(resolve));
    batch.forEach((r, k) => { if (got[k]) cache[r.op] = got[k]; });
  } catch {
    exhausted = true;
    console.log(`\n    Horizon rate limit not clearing; stopping the resolve pass at ${i}/${missing.length}.`);
    console.log('    Everything resolved so far is cached. Re-run this command later to continue.');
  }
  if (i && i % 400 === 0) {
    writeFileSync(cachePath, JSON.stringify(cache));
    process.stdout.write(`    resolved ${i}/${missing.length}\r`);
  }
  await sleep(200);
}
if (missing.length) {
  writeFileSync(cachePath, JSON.stringify(cache));
  process.stdout.write(' '.repeat(40) + '\r');
}
const unresolved = deduped.filter((r) => !cache[r.op]).length;
if (unresolved) {
  console.log(`    WARNING: ${unresolved} of ${deduped.length} operations could not be resolved`
    + ` and are excluded from classification and slicing. Re-run to fill them in.`);
}
const allResolved = deduped.filter((r) => cache[r.op]).map((r) => ({ ...r, ...cache[r.op] }));
const resolved = allResolved.filter((r) => r.usd >= THRESHOLD);

// --- 3. the headline ------------------------------------------------------------------------

const CLASSES = ['market_order', 'crossing_offer', 'arbitrage_loop', 'other'];
const LABEL = {
  market_order: 'market order   (path payment, from != to)',
  crossing_offer: 'crossing offer (manage_*_offer that filled)',
  arbitrage_loop: 'arbitrage loop (path payment, from == to)',
  other: 'other',
};
const group = Object.fromEntries(CLASSES.map((c) => [c, resolved.filter((r) => r.klass === c)]));

console.log(`\n  at or above ${usd(THRESHOLD)}, by what the operation actually was:`);
console.log('  ' + 'class'.padEnd(46) + 'ops'.padStart(7) + 'volume'.padStart(15)
  + 'accounts'.padStart(10));
for (const c of CLASSES) {
  const g = group[c];
  if (!g.length) continue;
  const accts = new Set(g.map((r) => r.source_account).filter(Boolean));
  console.log('  ' + LABEL[c].padEnd(46) + String(g.length).padStart(7)
    + usd(g.reduce((s, r) => s + r.usd, 0)).padStart(15) + String(accts.size).padStart(10));
}

const takers = [...group.market_order, ...group.crossing_offer].sort((a, b) => b.usd - a.usd);
const takerUsd = takers.reduce((s, r) => s + r.usd, 0);
const takerAccts = new Set(takers.map((r) => r.source_account).filter(Boolean));

// Concentration matters as much as the count: "N trades at size" reads very differently if they
// all came from one desk.
const perAcct = {};
for (const r of takers) perAcct[r.source_account] = (perAcct[r.source_account] || 0) + 1;
const topAccts = Object.entries(perAcct).sort((a, b) => b[1] - a[1]).slice(0, 5);
if (topAccts.length) {
  console.log('\n  most active accounts among those (ops at or above threshold):');
  for (const [a, c] of topAccts) console.log(`    ${a}  ${String(c).padStart(5)}`);
}

console.log('\n  largest 15 non-arbitrage operations:');
for (const r of takers.slice(0, 15)) {
  console.log(`    ${r.t}  ${usd(r.usd).padStart(12)}  ${(r.src + '->' + r.dst).padEnd(14)}`
    + `${String(r.op_type).padEnd(28)} ${String(r.n).padStart(4)} fills  ${r.op}`);
}

// --- 4. order slicing --------------------------------------------------------------------
//
// The obvious objection to a low count of large operations is that a trader facing the slippage
// curve the other tool measured would not send one large order at all - they would slice it.
// A naive per-operation count would then report "no size flow" for a trader who moved size all
// afternoon. So the same non-arbitrage operations are regrouped by (source account, direction,
// hour) and the parent order is measured instead. This is a lower bound on slicing: it cannot
// see slices spread across hours, or across accounts.

const clusters = new Map();
for (const r of allResolved.filter((r) => r.klass === 'market_order' || r.klass === 'crossing_offer')) {
  if (!r.source_account) continue;
  const key = `${r.source_account}|${r.src}->${r.dst}|${r.t.slice(0, 13)}`;
  if (!clusters.has(key)) {
    clusters.set(key, { n: 0, mo: 0, usd: 0, acct: r.source_account, dir: `${r.src}->${r.dst}`, hour: r.t.slice(0, 13) });
  }
  const c = clusters.get(key);
  c.n += 1;
  c.usd += r.usd;
  if (r.klass === 'market_order') c.mo += 1;
}
const parents = [...clusters.values()].sort((a, b) => b.usd - a.usd);
const bigParents = parents.filter((c) => c.usd >= THRESHOLD);
const slicedParents = bigParents.filter((c) => c.n > 1);

console.log(`\n  regrouped as parent orders (same account, same direction, same hour,`
  + ` over every non-arbitrage operation at or above ${usd(summary.detail_floor_usd)}):`);
console.log(`    parent orders at or above ${usd(THRESHOLD)}: ${bigParents.length}`
  + `   (${slicedParents.length} of them arrived as more than one operation)`);
const parentAccts = new Set(bigParents.map((c) => c.acct));
const parentWithMo = bigParents.filter((c) => c.mo > 0).length;
console.log(`    versus single operations at or above ${usd(THRESHOLD)}: ${takers.length}`);
console.log(`    from ${parentAccts.size} distinct accounts; ${parentWithMo} contain any market order`
  + ` (the rest are entirely limit orders that crossed, i.e. most likely market makers)`);
console.log('\n  largest 10 parent orders:');
for (const c of parents.slice(0, 10)) {
  console.log(`    ${c.hour}:00  ${usd(c.usd).padStart(12)}  in ${String(c.n).padStart(3)} ops  `
    + `${c.dir.padEnd(13)} ${c.acct}`);
}

const days = +summary.days;
const daysLabel = days.toFixed(2).replace(/\.00$/, '');
console.log(`\n  HEADLINE`);
console.log(`  Over the ${daysLabel} days to ${summary.window_end_utc.slice(0, 10)}, Stellar saw`
  + ` ${takers.length} non-arbitrage taker orders above ${usd(THRESHOLD)}`);
console.log(`  across XLM/USDC and USDC/EURC, totalling ${usd(takerUsd)},`
  + ` from ${takerAccts.size} distinct accounts (~${(takers.length / days).toFixed(1)} per day).`);
console.log(`  Of those, only ${group.market_order.length} were market orders`
  + ` (${usd(group.market_order.reduce((s, r) => s + r.usd, 0))});`
  + ` the rest were limit orders that crossed.`);
console.log(`  A further ${group.arbitrage_loop.length} operations above ${usd(THRESHOLD)}`
  + ` were circular arbitrage and are excluded.`);
console.log(`  Allowing for slicing, ${bigParents.length} parent orders from ${parentAccts.size} accounts`
  + ` reached ${usd(THRESHOLD)} within a single hour in one direction,`);
console.log(`  but only ${parentWithMo} of those contain a market order at all.\n`);
