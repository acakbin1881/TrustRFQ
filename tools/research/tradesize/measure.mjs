// Trade-size distribution on Stellar mainnet.
//
// WHAT THIS ANSWERS. The slippage tool (tools/slippage/) measures COST: a trade at size loses
// far more than the 10 bps protocol fee. It says nothing about FREQUENCY. This tool measures the
// other half of hypothesis H1: do trades at size actually HAPPEN on Stellar, and how often.
// Together they close H1 - trades at size both happen and are expensive.
//
// THE UNIT IS THE OPERATION, NOT THE TRADE. This is the whole trick. One taker order is filled
// against many resting offers and shows up as hundreds of separate /trades records, so a
// histogram of raw trade records is a histogram of bot micro-fills: a 200-record sample of
// XLM/USDC on 2026-08-29 spanned 2m20s with a median size of 0.01 XLM. Horizon encodes the
// operation id in the trade id as `<operation_id>-<order>`, so grouping costs no extra requests.
// Because /trades pages in cursor order and every trade of one operation shares one ledger, an
// operation's trades are always contiguous: the fold below is O(1) memory, not a 1.3M-row Map.
//
// NOTIONAL IS THE USDC LEG, NOT A PRICE FEED. Every pair in scope has a USDC side, so the USD
// notional of an operation is simply the amount of USDC that moved. No oracle, no cross-rate,
// nothing to go stale. XLM/USDC and USDC/EURC are the only two orderbooks needed: Horizon
// normalises direction into `base_is_seller`, so the slippage tool's three directed series
// (XLM->USDC, USDC->XLM, USDC->EURC) collapse to two pair sweeps.
//
// RETROACTIVE, UNLIKE THE SLIPPAGE RUN. /trades pages back indefinitely by cursor, so no forward
// measurement window is needed and the whole study finishes in one sitting (~7k requests,
// ~20 min). Read-only, public endpoints, no keys, no wallet, no cost.
//
// Usage:
//   node tools/tradesize/measure.mjs                                  # 14 days to last UTC midnight
//   node tools/tradesize/measure.mjs --days 7
//   node tools/tradesize/measure.mjs --start 2026-08-20T00:00:00Z --end 2026-09-03T00:00:00Z
//   node tools/tradesize/measure.mjs --floor 5000                     # detail rows above $5k
//   node tools/tradesize/measure.mjs --resume                         # continue an interrupted sweep

import { writeFileSync, appendFileSync, readFileSync, existsSync, mkdirSync, truncateSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HORIZON = 'https://horizon.stellar.org';
const USDC = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const EURC = 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(HERE, 'runs');

// Bucket edges in USD. Deliberately aligned with the slippage tool's USDC size grid
// (250 / 1k / 2.5k / 5k / 10k / 25k / 50k / 100k / 250k) so the cost curve and the frequency
// curve can be read against each other, plus 20k because that is the threshold the grant
// argument quotes, and sub-dollar edges to make the bot-dust floor visible rather than hidden.
const EDGES = [0, 1, 10, 100, 250, 1000, 2500, 5000, 10000, 20000, 25000, 50000, 100000, 250000, 500000, 1000000];

// DIRECTION: `base_is_seller` MARKS THE MAKER, NOT THE FLOW. Reading it as "which way value
// moved" is the trap here, and it silently produces a 99%-one-sided market. Measured on this
// window rather than assumed:
//   * on 5,810 of 5,810 orderbook trades where exactly one side carried a synthetic offer id,
//     `base_is_seller === (the taker was the counter side)`;
//   * on 100 of 100 liquidity-pool trades, the pool (always the maker) is the side
//     `base_is_seller` points at.
// So the maker sits on the base side exactly when `base_is_seller` is true, and the taker sells
// the OTHER side's asset. The whole rule collapses to `takerSellsBase = !base_is_seller`, which
// needs no offer-id heuristic and covers AMM fills and crossing offers alike.
//
// Cross-checked end to end against operation 275911198766125057, whose own Horizon record is a
// path_payment_strict_receive spending 17211.1538184 USDC to receive 99000 XLM. Every one of its
// 15 trades carries base_is_seller=true, so the rule yields USDC->XLM, and the fold reproduces
// both legs to the last stroop.
const takerSellsBase = (t) => !t.base_is_seller;

// Horizon assigns a taker that arrived as a fill a synthetic offer id at or above 2^62; resting
// offers get small sequential ids. This is recorded for context only - direction no longer
// depends on it - and it is null for a crossing manage_offer, where both sides are real offers.
const SYNTHETIC_OFFER_FLOOR = 4611686018427387904n;

function takerSideOf(t) {
  if (t.base_liquidity_pool_id) return 'counter';
  if (t.counter_liquidity_pool_id) return 'base';
  if (t.base_offer_id && BigInt(t.base_offer_id) >= SYNTHETIC_OFFER_FLOOR) return 'base';
  if (t.counter_offer_id && BigInt(t.counter_offer_id) >= SYNTHETIC_OFFER_FLOOR) return 'counter';
  return null;
}

const PAIRS = [
  {
    key: 'XLM/USDC',
    q: `base_asset_type=native&counter_asset_type=credit_alphanum4&counter_asset_code=USDC&counter_asset_issuer=${USDC}`,
    usdLeg: 'counter',
    baseSym: 'XLM',
    counterSym: 'USDC',
  },
  {
    key: 'USDC/EURC',
    q: `base_asset_type=credit_alphanum4&base_asset_code=USDC&base_asset_issuer=${USDC}&counter_asset_type=credit_alphanum4&counter_asset_code=EURC&counter_asset_issuer=${EURC}`,
    usdLeg: 'base',
    baseSym: 'USDC',
    counterSym: 'EURC',
  },
];

const arg = (name, dflt) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : dflt;
const RESUME = process.argv.includes('--resume');
const FLOOR = Number(arg('--floor', '1000'));
const DAYS = Number(arg('--days', '14'));

const log = (...a) => console.log('[tradesize]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return res.json();
      // 429 and 5xx are transient and worth backing off; a 400 means we built a bad URL.
      if (res.status !== 429 && res.status < 500) {
        throw new Error(`${label}: HTTP ${res.status} for ${url}`);
      }
      await sleep(1000 * 2 ** attempt);
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${label}: gave up after 4 attempts on ${url}`);
}

// Resolve an instant to the first ledger closing at or after it, then to its TOID cursor.
// A TOID is `ledger << 32 | txorder << 12 | opindex`, so `ledger << 32` is the cursor that sits
// immediately before every event in that ledger.
async function ledgerAt(iso, latest) {
  const target = Date.parse(iso);
  let seq = latest.sequence;
  let ct = Date.parse(latest.closed_at);
  for (let i = 0; i < 8; i++) {
    const guess = Math.max(2, seq - Math.round((ct - target) / 5000));
    const l = await getJson(`${HORIZON}/ledgers/${guess}`, 'ledger probe');
    seq = l.sequence;
    ct = Date.parse(l.closed_at);
    if (Math.abs(ct - target) < 6000) break;
  }
  while (ct < target) {
    const l = await getJson(`${HORIZON}/ledgers/${seq + 1}`, 'ledger walk');
    seq = l.sequence;
    ct = Date.parse(l.closed_at);
  }
  for (;;) {
    const l = await getJson(`${HORIZON}/ledgers/${seq - 1}`, 'ledger walk back');
    if (Date.parse(l.closed_at) < target) break;
    seq = l.sequence;
    ct = Date.parse(l.closed_at);
  }
  return { seq, closed_at: new Date(ct).toISOString() };
}

const bucketIndex = (usd) => {
  let i = 0;
  while (i + 1 < EDGES.length && usd >= EDGES[i + 1]) i++;
  return i;
};

function emptyStats() {
  return {
    ops: 0,
    trades: 0,
    usd_total: 0,
    hist: EDGES.map(() => 0),
    hist_usd: EDGES.map(() => 0),
    by_dir: {},
    unknown_taker_ops: 0,
    max_usd: 0,
    max_op: null,
  };
}

// Fold one operation's worth of trades into the running stats, and return a detail row if it
// clears the floor. `acc` is whatever accumulateTrade built up for this operation.
function flushOp(acc, pair, stats, out) {
  if (!acc) return;
  const usd = acc.usd;
  stats.ops += 1;
  stats.trades += acc.n;
  stats.usd_total += usd;
  const b = bucketIndex(usd);
  stats.hist[b] += 1;
  stats.hist_usd[b] += usd;
  // Majority vote across the operation's trades; a single fill decides its own direction.
  // This is the direction of the operation's leg ON THIS PAIR. A multi-hop path payment
  // (say YxT -> USDC -> XLM) also shows up here, and its end-to-end assets are NOT these two;
  // report.mjs resolves the true source and destination for the operations that matter.
  const dir = acc.sellsBaseVotes >= 0
    ? `${pair.baseSym}->${pair.counterSym}`
    : `${pair.counterSym}->${pair.baseSym}`;
  stats.by_dir[dir] = (stats.by_dir[dir] || 0) + 1;
  if (acc.unknownTaker === acc.n) stats.unknown_taker_ops += 1;
  if (usd > stats.max_usd) {
    stats.max_usd = usd;
    stats.max_op = acc.op;
  }
  if (usd >= FLOOR) {
    out.push({
      type: 'op',
      op: acc.op,
      t: acc.t,
      pair: pair.key,
      usd: Number(usd.toFixed(7)),
      base: Number(acc.base.toFixed(7)),
      counter: Number(acc.counter.toFixed(7)),
      leg_dir: dir,
      n: acc.n,
      pool_fills: acc.pool,
      taker_side: acc.takerSide,
    });
  }
}

async function sweepPair(pair, meta, detailPath) {
  const stampPath = join(RUNS_DIR, `.checkpoint-${pair.key.replace('/', '-')}.json`);
  let stats = emptyStats();
  let cursor = meta.start_cursor;
  let pages = 0;

  if (RESUME && existsSync(stampPath)) {
    const cp = JSON.parse(readFileSync(stampPath, 'utf8'));
    if (cp.window === meta.window_key) {
      stats = cp.stats;
      cursor = cp.cursor;
      pages = cp.pages;
      // The detail file is appended to as we go, so roll it back to the checkpointed length.
      if (existsSync(detailPath) && statSync(detailPath).size > cp.detail_bytes) {
        truncateSync(detailPath, cp.detail_bytes);
      }
      log(`${pair.key}: resuming at page ${pages}, ${stats.ops} ops so far`);
    }
  }

  let acc = null;
  let done = false;

  while (!done) {
    const url = `${HORIZON}/trades?${pair.q}&order=asc&limit=200&cursor=${cursor}`;
    const body = await getJson(url, `trades ${pair.key}`);
    const recs = body._embedded.records;
    if (recs.length === 0) break;

    const out = [];
    for (const t of recs) {
      if (Date.parse(t.ledger_close_time) >= meta.end_ms) {
        done = true;
        break;
      }
      const op = t.id.split('-')[0];
      if (!acc || acc.op !== op) {
        flushOp(acc, pair, stats, out);
        acc = {
          op,
          t: t.ledger_close_time,
          base: 0,
          counter: 0,
          usd: 0,
          n: 0,
          pool: 0,
          sellsBaseVotes: 0,
          unknownTaker: 0,
          takerSide: null,
        };
      }
      const base = Number(t.base_amount);
      const counter = Number(t.counter_amount);
      acc.base += base;
      acc.counter += counter;
      acc.usd += pair.usdLeg === 'base' ? base : counter;
      acc.n += 1;
      if (t.trade_type === 'liquidity_pool') acc.pool += 1;
      acc.sellsBaseVotes += takerSellsBase(t) ? 1 : -1;
      const side = takerSideOf(t);
      if (side === null) acc.unknownTaker += 1;
      else if (acc.takerSide === null) acc.takerSide = side;
    }

    if (out.length) appendFileSync(detailPath, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
    cursor = recs[recs.length - 1].paging_token;
    pages += 1;
    if (recs.length < 200) done = true;

    if (pages % 25 === 0) {
      writeFileSync(
        stampPath,
        JSON.stringify({
          window: meta.window_key,
          cursor,
          pages,
          stats,
          detail_bytes: existsSync(detailPath) ? statSync(detailPath).size : 0,
        })
      );
      log(
        `${pair.key}: page ${pages}, ${stats.trades} trades, ${stats.ops} ops, ` +
          `last ${recs[recs.length - 1].ledger_close_time}`
      );
    }
  }

  // The final operation cannot straddle the window edge: every trade of one operation shares a
  // ledger, so the operation is wholly inside or wholly outside.
  const tail = [];
  flushOp(acc, pair, stats, tail);
  if (tail.length) appendFileSync(detailPath, tail.map((o) => JSON.stringify(o)).join('\n') + '\n');
  if (existsSync(stampPath)) unlinkSync(stampPath);
  return { stats, pages };
}

// ---------------------------------------------------------------------------

mkdirSync(RUNS_DIR, { recursive: true });

const root = await getJson(`${HORIZON}/`, 'root');
const latest = (await getJson(`${HORIZON}/ledgers?order=desc&limit=1`, 'latest ledger'))._embedded.records[0];

const midnight = new Date();
midnight.setUTCHours(0, 0, 0, 0);
const endIso = arg('--end', midnight.toISOString().replace('.000Z', 'Z'));
const startIso = arg('--start', new Date(Date.parse(endIso) - DAYS * 86400000).toISOString().replace('.000Z', 'Z'));

log(`window ${startIso} -> ${endIso}  (floor for detail rows: $${FLOOR})`);
const startLedger = await ledgerAt(startIso, latest);
const endLedger = await ledgerAt(endIso, latest);
log(`ledgers ${startLedger.seq} (${startLedger.closed_at}) -> ${endLedger.seq} (${endLedger.closed_at})`);

const meta = {
  start_cursor: (BigInt(startLedger.seq) << 32n).toString(),
  end_ms: Date.parse(endIso),
  window_key: `${startIso}/${endIso}`,
};

const scriptSha = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const stamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\.\d+Z$/, 'Z');
const detailPath = join(RUNS_DIR, `${stamp}-ops.jsonl`);
const summaryPath = join(RUNS_DIR, `${stamp}-summary.json`);

const results = {};
for (const pair of PAIRS) {
  const t0 = Date.now();
  const { stats, pages } = await sweepPair(pair, meta, detailPath);
  results[pair.key] = stats;
  log(
    `${pair.key}: DONE ${pages} pages, ${stats.trades} trades -> ${stats.ops} operations ` +
      `in ${((Date.now() - t0) / 1000).toFixed(0)}s`
  );
}

const summary = {
  type: 'run',
  kind: 'trade-size-distribution',
  network: 'mainnet',
  horizon: HORIZON,
  window_start_utc: startIso,
  window_end_utc: endIso,
  days: (Date.parse(endIso) - Date.parse(startIso)) / 86400000,
  start_ledger: startLedger,
  end_ledger: endLedger,
  horizon_latest_ledger: root.history_latest_ledger,
  detail_floor_usd: FLOOR,
  notional_definition: 'USD notional = the USDC leg of the operation; no price feed involved',
  unit: 'operation (one taker order), reconstructed by grouping /trades on their operation id',
  edges_usd: EDGES,
  detail_file: `${stamp}-ops.jsonl`,
  script_sha256: scriptSha,
  node_version: process.version,
  measured_at_utc: new Date().toISOString(),
  pairs: results,
};
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');

log(`wrote ${summaryPath}`);
log(`wrote ${detailPath}`);
