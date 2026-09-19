// Aggregate every slippage run in runs/ into the distribution that the repeat-run window is for.
//
// Prints three things, in this order:
//   1. Coverage: which of the planned slots are done, pending, or drifted, and whether every run
//      was produced by the same version of measure.mjs.
//   2. Per pair and size, the min / median / max across runs, naming the run behind each extreme.
//   3. The floor: the best case observed at each headline size. That is the number the SCF
//      argument rests on, because it says "even at the most liquid moment we measured, a trade
//      this size still loses this much".
//
// Usage: node tools/slippage/report.mjs [--mid]     (--mid reports bps_vs_mid instead of the
// original spread-excluded bps_vs_baseline metric)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = join(HERE, 'runs');
const FAILED_DIR = join(RUNS_DIR, 'failed');
const SCHEDULE = JSON.parse(readFileSync(join(HERE, 'schedule.json'), 'utf8'));

const METRIC = process.argv.includes('--mid') ? 'bps_vs_mid' : 'bps_vs_baseline';
const hourlyMedian = SCHEDULE.hourly_median_volume_xlm ?? {};
const HEADLINE = { 'XLM->USDC': [100000, 500000, 1000000], 'USDC->XLM': [100000, 250000], 'USDC->EURC': [100000, 250000] };

const files = existsSync(RUNS_DIR)
  ? readdirSync(RUNS_DIR).filter((f) => f.endsWith('.jsonl')).sort()
  : [];

const runs = files.map((f) => {
  const lines = readFileSync(join(RUNS_DIR, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { file: f, meta: lines.find((l) => l.type === 'run'), series: lines.filter((l) => l.type === 'series') };
});

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const fmt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '   n/a' : n.toFixed(1).padStart(8));

// ---------------------------------------------------------------- 1. coverage

console.log('='.repeat(78));
console.log(`COVERAGE  window ${SCHEDULE.window}   metric ${METRIC}`);
console.log('='.repeat(78));

const scheduled = runs.filter((r) => r.meta.kind === 'scheduled');
const manual = runs.filter((r) => r.meta.kind === 'manual');
const byRun = new Map(scheduled.map((r) => [r.meta.run_number, r]));

for (const slot of [...SCHEDULE.slots].sort((a, b) => Date.parse(a.planned_at_utc) - Date.parse(b.planned_at_utc))) {
  const r = byRun.get(slot.run);
  const tag = slot.role === 'expected_worst_case' ? '  <- expected worst'
    : slot.role === 'expected_best_case_sets_the_floor' ? '  <- expected best, sets the floor' : '';
  if (!r) {
    console.log(`  #${slot.run}  ${slot.planned_at_utc}  ${slot.weekday}  PENDING   ${slot.why}${tag}`);
    continue;
  }
  const d = r.meta.drift_minutes;
  const drift = Math.abs(d) <= 5 ? 'on time' : `${d > 0 ? '+' : ''}${d}m`;
  // A run is labelled by the hour it ACTUALLY measured, never by the hour it was planned for.
  // Drift of an hour or more means a different market, and the planned label would be a lie.
  const actualHour = new Date(r.meta.actual_at_utc).getUTCHours();
  const plannedHour = new Date(slot.planned_at_utc).getUTCHours();
  const vol = hourlyMedian[String(actualHour)];
  const mismatch = actualHour !== plannedHour
    ? `  !! measured the ${String(actualHour).padStart(2, '0')}:00 hour, NOT the planned ${String(plannedHour).padStart(2, '0')}:00`
    : '';
  console.log(
    `  #${slot.run}  ${slot.planned_at_utc}  ${slot.weekday}  DONE ${drift.padEnd(7)}` +
    ` measured ${String(actualHour).padStart(2, '0')}:00 UTC (${vol ? vol.toLocaleString('en-US') : '?'} XLM/h)  ${slot.why}${tag}${mismatch}`
  );
}

const done = byRun.size;
console.log(`\n  ${done} of ${SCHEDULE.slots.length} scheduled slots collected` +
  (manual.length ? `, plus ${manual.length} manual run(s) (excluded from the schedule)` : ''));

// Quarantined runs never claim a slot, but they must stay visible: a slot repeatedly failing to
// complete is a problem to fix, not an absence to shrug at.
const quarantined = existsSync(FAILED_DIR)
  ? readdirSync(FAILED_DIR).filter((f) => f.endsWith('.jsonl'))
  : [];
if (quarantined.length) {
  console.log(`\n  ${quarantined.length} quarantined run(s) in runs/failed/ (did NOT claim a slot):`);
  for (const f of quarantined) {
    const hdr = JSON.parse(readFileSync(join(FAILED_DIR, f), 'utf8').split('\n')[0]);
    console.log(`     ${f}  slot ${hdr.run_number ?? '-'}  at ${hdr.actual_at_utc}`);
  }
}

if (SCHEDULE.corrections?.length) {
  console.log(`\n  ${SCHEDULE.corrections.length} recorded correction(s) to this window, see schedule.json:`);
  for (const c of SCHEDULE.corrections) console.log(`     ${c.date}  ${c.what.slice(0, 88)}...`);
}

const hashes = new Set(runs.map((r) => r.meta.script_sha256));
if (hashes.size > 1) {
  // More than one script version in the series. That is only acceptable if every version is
  // declared in schedule.json with a reason; an undeclared one means two methods got mixed.
  const declared = new Map((SCHEDULE.script_versions ?? []).map((v) => [v.sha256, v]));
  const undeclared = [...hashes].filter((h) => !declared.has(h.slice(0, 12)));
  console.log(`\n  runs span ${hashes.size} versions of measure.mjs:`);
  for (const h of hashes) {
    const v = declared.get(h.slice(0, 12));
    console.log(`     ${h.slice(0, 12)}  ${v ? v.note : '!! UNDECLARED, method may have changed mid-window'}`);
  }
  if (undeclared.length) console.log('     !! declare every version in schedule.json before citing this series');
} else if (hashes.size === 1) {
  console.log(`  all runs produced by measure.mjs sha256 ${[...hashes][0].slice(0, 12)}`);
}

// What liquidity range did the series actually sample? This, not the slot table, is what the
// floor claim can be built on.
const sampled = runs
  .filter((r) => r.meta.kind === 'scheduled')
  .map((r) => ({ h: new Date(r.meta.actual_at_utc).getUTCHours(), run: r.meta.run_number }))
  .map((x) => ({ ...x, vol: hourlyMedian[String(x.h)] ?? null }))
  .filter((x) => x.vol !== null)
  .sort((a, b) => a.vol - b.vol);
if (sampled.length) {
  const peak = Math.max(...Object.values(hourlyMedian));
  const thin = Math.min(...Object.values(hourlyMedian));
  console.log('\n  Liquidity actually sampled, thinnest hour first:');
  for (const x of sampled) {
    console.log(`     #${x.run}  ${String(x.h).padStart(2, '0')}:00 UTC  ${x.vol.toLocaleString('en-US').padStart(9)} XLM/h`);
  }
  console.log(`     network range is ${thin.toLocaleString('en-US')} to ${peak.toLocaleString('en-US')} XLM/h;` +
    ` this series spans ${sampled[0].vol.toLocaleString('en-US')} to ${sampled[sampled.length - 1].vol.toLocaleString('en-US')}`);
  if (sampled[sampled.length - 1].vol < peak) {
    console.log(`     !! the peak hour (${peak.toLocaleString('en-US')} XLM/h) is NOT yet sampled, so the floor is not yet established`);
  }
}

if (!runs.length) { console.log('\nNo runs yet.'); process.exit(0); }

// ---------------------------------------------------------------- 2. distribution

const pairs = [...new Set(runs.flatMap((r) => r.series.map((s) => s.pair)))];

for (const pair of pairs) {
  console.log('\n' + '='.repeat(78));
  console.log(`${pair}   ${METRIC} across ${runs.length} run(s)`);
  console.log('='.repeat(78));
  console.log('      send        best     median       worst   |  best run        worst run');
  console.log('-'.repeat(78));

  const sizes = [...new Set(runs.flatMap((r) => r.series.filter((s) => s.pair === pair).flatMap((s) => s.rows.map((x) => x.send))))]
    .sort((a, b) => a - b);

  for (const size of sizes) {
    const pts = [];
    for (const r of runs) {
      const row = r.series.find((s) => s.pair === pair)?.rows.find((x) => x.send === size);
      const v = row?.[METRIC];
      if (typeof v === 'number' && !Number.isNaN(v)) pts.push({ v, r });
    }
    if (!pts.length) { console.log(`  ${String(size).padStart(8)}   no data`); continue; }
    const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const hi = pts.reduce((a, b) => (b.v > a.v ? b : a));
    const label = (p) => (p.r.meta.kind === 'manual' ? 'manual' : `#${p.r.meta.run_number}`) +
      ' ' + p.r.meta.actual_at_utc.slice(5, 16).replace('T', ' ');
    console.log(
      `  ${String(size).padStart(8)}  ${fmt(lo.v)}  ${fmt(median(pts.map((p) => p.v)))}  ${fmt(hi.v)}` +
      `   |  ${label(lo).padEnd(16)} ${label(hi)}`
    );
  }

  const spreads = runs.map((r) => r.series.find((s) => s.pair === pair)?.spread_bps).filter((x) => typeof x === 'number');
  if (spreads.length) {
    console.log(`\n  top-of-book spread across runs: min ${Math.min(...spreads).toFixed(2)}` +
      `  median ${median(spreads).toFixed(2)}  max ${Math.max(...spreads).toFixed(2)} bps`);
  }
}

// ---------------------------------------------------------------- 3. the floor

console.log('\n' + '='.repeat(78));
console.log('THE FLOOR  (best case observed, i.e. the most favourable moment we measured)');
console.log('='.repeat(78));
console.log('  Against a 10 bps maker-paid protocol fee.\n');

for (const pair of pairs) {
  for (const size of HEADLINE[pair] ?? []) {
    const pts = [];
    for (const r of runs) {
      const row = r.series.find((s) => s.pair === pair)?.rows.find((x) => x.send === size);
      const v = row?.[METRIC];
      if (typeof v === 'number' && !Number.isNaN(v)) pts.push({ v, r });
    }
    if (!pts.length) continue;
    const lo = pts.reduce((a, b) => (b.v < a.v ? b : a));
    const verdict = lo.v > 10 ? `still ${(lo.v / 10).toFixed(1)}x the protocol fee` : 'BELOW the protocol fee';
    console.log(`  ${pair.padEnd(12)} ${String(size).padStart(8)}  best case ${lo.v.toFixed(1).padStart(8)} bps  ->  ${verdict}`);
  }
}
console.log();
