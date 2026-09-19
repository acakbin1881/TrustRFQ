# Slippage measurement

Measures what a trader actually receives on Stellar **mainnet** at increasing trade sizes, using
Horizon's strict-send path finder. The path finder routes through both the classic orderbook and
the AMM pools, so the rate it returns is a real fill, not a quoted mid.

This is the evidence behind §6.2 (hypothesis H1) of the SCF Customer Development Plan. It is
read-only and touches only public endpoints: no keys, no wallet, no transaction, no cost.

## Why it has to be repeated forward in time

`/paths/strict-send` only answers "right now". Horizon serves no historical orderbook, and
reconstructing one would mean replaying every offer create, modify and delete on the network up to
that instant. So a series of samples can only be collected going forward, one at a time. That is
what the schedule below is for.

## What it is trying to prove

Not that slippage varies by hour. The claim is the **floor**: even at the most liquid hour of the
most liquid weekday, a trade at size still loses far more than the 10 bps maker-paid protocol fee.
The spread of runs is how the floor is located, not the finding itself.

## Commands

```bash
node tools/research/slippage/measure.mjs --manual   # ad-hoc run; never fills a scheduled slot
node tools/research/slippage/measure.mjs            # poll; runs only if a slot's window is open, else exits
node tools/research/slippage/measure.mjs --force    # run now and record it, ignoring the slot window
node tools/research/slippage/report.mjs             # coverage + distribution + the floor
node tools/research/slippage/report.mjs --mid       # same, using the spread-inclusive metric
```

A run takes about 15 seconds and makes 30 requests (9 sizes x 3 pairs, plus one order book per
pair, plus the ledger probe).

## The two metrics

| Column | Baseline | Meaning |
|---|---|---|
| `bps_vs_baseline` | the smallest trade in the series | The original 2026-08-24 metric, formula unchanged so the old numbers stay comparable. Excludes the bid-ask spread, so it **understates** real cost. |
| `bps_vs_mid` | the true `/order_book` mid | Added 2026-08-29. Includes the spread, so it is the honest total cost. Reported alongside, never instead of, the original. |

The spread is not a rounding detail: on the first run, XLM/USDC top-of-book was 4.7 bps and
USDC/EURC was 50.6 bps, against a 10 bps protocol fee.

## The schedule

`schedule.json` holds the eight slots and the reason for each. They were chosen from 14 days of
Horizon `/trade_aggregations` data measured on 2026-08-29, not from intuition:

- Hourly XLM/USDC volume varies **4.5x** across the day: 180k XLM median at 19:00 UTC, 818k at 14:00.
- Weekday medians: Thu 544k, Fri 495k, **Sat 446k**, Sun 362k, Wed 279k, Tue 249k, **Mon 245k**.
  The weekend is *not* the thin period on Stellar. Monday to Wednesday is.

Run 5 (Mon 2026-08-31 19:00 UTC) is the expected worst case; run 8 (Thu 2026-09-03 14:00 UTC) is
the expected best case and therefore the one that sets the floor.

## Scheduler

`com.trustrfq.slippage.plist` is a `launchd` user agent that does one thing: run `measure.mjs`
every 5 minutes. It knows nothing about the schedule. `measure.mjs` holds the slot table and
decides **in UTC epoch milliseconds** whether anything is due, so almost every invocation exits in
a few milliseconds having found nothing. A slot's window opens 2.5 minutes before its planned time
and stays open for 3 hours, which is what lets a slot survive the machine being asleep.

No `sudo`, no daemon, nothing outside the user account.

```bash
# install
cp tools/slippage/com.trustrfq.slippage.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.trustrfq.slippage.plist

# confirm it is registered
launchctl list | grep trustrfq
launchctl print gui/$(id -u)/com.trustrfq.slippage   # shows every calendar trigger

# remove when the window closes (do this: launchd has no year, so the dates recur in 2027)
launchctl unload ~/Library/LaunchAgents/com.trustrfq.slippage.plist
rm ~/Library/LaunchAgents/com.trustrfq.slippage.plist
```

If the Mac is asleep at a slot, the first poll after wake picks it up, as long as that is within
the 3-hour catch-up window. `report.mjs` prints the drift and flags anything over two hours.

## Two failures on the first day, and what changed

Both are recorded in `schedule.json` under `corrections`, and `report.mjs` prints them.

**1. `launchd` fired an hour early.** The original plist used `StartCalendarInterval` with local
times. Slot 1 was set to 16:00 local, expecting 14:00 UTC, and the job ran at **13:00 UTC**, which
is 15:00 CEST. `launchd` had applied standard time (CET, UTC+1) and ignored that the machine is on
summer time (CEST, UTC+2). Run 1 is kept: it is a valid measurement, just of the 13:00 UTC hour
(14d median 519k XLM) rather than the intended peak (818k), and its record carries `-60m` drift.
The fix was to stop expressing the schedule in local time at all.

**2. A run on wake burned its slot.** Slot 2 fired 5 minutes after wake, before the network
interface was up. All 27 rows returned `network: fetch failed`, and the empty file was still
written, which **claimed the slot**. That is the dangerous failure: not a missing measurement, but
a measurement that looks present and is empty. Two fixes: `measure.mjs` now probes Horizon before
starting and exits writing nothing if it is unreachable, and any run that fails a completeness
check (every series must have a baseline, and at least 80% of rows must succeed) is quarantined in
`runs/failed/` instead of claiming its slot. Both paths were tested against a dead host before
being trusted. Slot 2 was re-dated to Sunday 2026-08-30 19:00 UTC, which is a better thin-weekend
sample anyway since Sunday is the quieter weekend day.

Because `measure.mjs` changed mid-window, `schedule.json` carries a `script_versions` list. The
measurement logic is identical across versions, same endpoint, pairs, sizes and both bps formulas,
so runs stay comparable; `report.mjs` prints the declared reason for each version and shouts if it
finds an undeclared one.

## Reading the data

One JSONL file per run in `runs/`, committed. First line is the run header, then one line per pair:

```
{"type":"run","kind":"scheduled","run_number":1,"planned_at_utc":…,"actual_at_utc":…,
 "drift_minutes":0,"horizon_latest_ledger":…,"script_sha256":…}
{"type":"series","pair":"XLM->USDC","mid":…,"spread_bps":…,"baseline_send":1000,
 "rows":[{"send":…,"receive":…,"rate":…,"bps_vs_baseline":…,"bps_vs_mid":…,"hops":…,"url":…}]}
```

Every row keeps the exact Horizon URL it came from, so any number can be re-fetched and checked by
hand. `script_sha256` is the runner hashing its own source: if `measure.mjs` is edited mid-window
the hash changes and `report.mjs` warns instead of silently mixing two methods.

## Out of scope

This measures **cost**, not **frequency**. It shows large trades are expensive; it does not show
that large trades happen often. That second half of H1 needs a separate retroactive study over
Horizon `/trades` and `/trade_aggregations`, tracked as its own Work-plan card.
