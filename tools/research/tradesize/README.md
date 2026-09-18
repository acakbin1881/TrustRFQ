# Trade-size distribution

Measures how **often** trades at size happen on Stellar **mainnet**, by reconstructing taker
orders from Horizon's trade history and bucketing them by USD notional.

This is the other half of §6.2 (hypothesis H1) of the SCF Customer Development Plan. The
[slippage measurement](../slippage/README.md) proves trades at size are **expensive**; it says
nothing about whether they **happen**. Together the two close H1. Read-only, public endpoints
only: no keys, no wallet, no transaction, no cost.

## Why this one is retroactive

Unlike slippage, nothing has to be waited for. `/paths/strict-send` only answers "right now", but
`/trades` pages back through history indefinitely by cursor, so the whole study is a single sweep.
About 7,000 requests, roughly 20 minutes for a two-week window.

## The three traps

**1. The unit is the operation, not the trade.** One taker order is filled against many resting
offers and lands in Horizon as hundreds of separate `/trades` records. A histogram of raw trade
records is a histogram of bot micro-fills: a 200-record sample of XLM/USDC on 2026-08-29 spanned
2 minutes 20 seconds with a median size of **0.01 XLM**. Horizon puts the operation id in the
trade id as `<operation_id>-<order>`, so the grouping costs no extra requests. Because `/trades`
pages in cursor order and every trade of one operation shares a ledger, an operation's trades are
always contiguous, which makes the fold O(1) memory rather than a 1.3M-row map.

**2. `base_is_seller` marks the maker, not the flow.** Reading it as the trade's direction inverts
every operation whose taker sat on the counter side, and produces a market that looks 99.5%
one-sided. This was measured rather than assumed:

- on **5,810 of 5,810** orderbook trades with exactly one synthetic offer id,
  `base_is_seller === (the taker was the counter side)`;
- on **100 of 100** liquidity-pool trades, the pool (always the maker) is the side `base_is_seller`
  points at.

So the rule is just `takerSellsBase = !base_is_seller`, with no offer-id heuristic, covering AMM
fills and crossing offers alike. Cross-checked end to end against operation
`275911198766125057`, whose Horizon record is a `path_payment_strict_receive` spending
`17211.1538184` USDC to receive `99000` XLM: the fold reproduces both legs exactly and the rule
yields `USDC->XLM`, while every one of its 15 trades carries `base_is_seller=true`.

**3. The biggest operations are often bots, not customers.** A path payment whose `from` equals its
`to` is a circular arbitrage loop, not somebody moving value. In the very first one-hour smoke
window the single largest operation, at $17,211, was exactly that. `report.mjs` counts these
separately and **excludes them from the headline**, because it is the first thing a reviewer will
ask about.

**4. Horizon rate-limits the resolve pass, not the sweep.** The sweep itself (6,678 paged
requests) never tripped a limit. Resolving 6,880 individual operations at 6 concurrent with no
pacing did, and it did not clear within 5 seconds. `report.mjs` therefore paces itself (4 at a
time, 120 ms between batches), backs off 2s / 8s / 32s / 128s on a 429, and checkpoints
resolutions into `<stamp>-resolved.json` so an interrupted pass resumes for free.

## Two pairs, not three

Horizon normalises direction into `base_is_seller`, so the slippage tool's three directed series
(`XLM->USDC`, `USDC->XLM`, `USDC->EURC`) collapse to two orderbook sweeps: **XLM/USDC** and
**USDC/EURC**. Direction is recovered per operation.

## Notional needs no price feed

Every pair in scope has a USDC leg, so an operation's USD notional is simply the amount of USDC
that moved. No oracle, no cross-rate, nothing to go stale or to argue about.

The exception is multi-hop: a path payment routed `YxT -> USDC -> XLM` touches two swept
orderbooks and so appears in both sweeps under one operation id. Summing the legs would count one
taker order twice, so `report.mjs` keeps the **largest** leg, which is the value that actually
passed through.

## Commands

```bash
node tools/tradesize/measure.mjs                       # 14 days back from the last UTC midnight
node tools/tradesize/measure.mjs --days 7
node tools/tradesize/measure.mjs --start 2026-08-20T00:00:00Z --end 2026-09-03T00:00:00Z
node tools/tradesize/measure.mjs --floor 5000          # detail rows above $5k (default $1,000)
node tools/tradesize/measure.mjs --resume              # continue an interrupted sweep

node tools/tradesize/report.mjs                        # newest run: distribution + headline
node tools/tradesize/report.mjs --threshold 20000      # headline threshold (default $20,000)
node tools/tradesize/report.mjs --run 20260903T070000Z
```

A sweep checkpoints every 25 pages into `runs/.checkpoint-<pair>.json` and rolls the detail file
back to the checkpointed byte length on `--resume`, so an interrupted run never double-counts.

## Reading the data

Two files per run in `runs/`, both committed:

`<stamp>-summary.json` is the run header and the full histogram over **every** operation,
including the sub-dollar dust:

```json
{"type":"run","kind":"trade-size-distribution","window_start_utc":…,"window_end_utc":…,
 "start_ledger":{…},"end_ledger":{…},"edges_usd":[…],"script_sha256":…,
 "pairs":{"XLM/USDC":{"ops":…,"trades":…,"hist":[…],"hist_usd":[…],"by_dir":{…}}}}
```

`<stamp>-ops.jsonl` is one line per operation **leg** above the detail floor:

```json
{"type":"op","op":"275911198766125057","t":"2026-09-02T14:34:59Z","pair":"XLM/USDC",
 "usd":17211.1538184,"base":99000,"counter":17211.1538184,"leg_dir":"USDC->XLM",
 "n":15,"pool_fills":0,"taker_side":"counter"}
```

`leg_dir` is the direction on **that orderbook**, not the operation's end-to-end path;
`report.mjs` resolves true source and destination assets from `/operations/{id}` for everything
above the headline threshold. `script_sha256` is the runner hashing its own source, so a sweep
edited mid-flight is detectable rather than silently mixed.

## What the first full run found (2026-08-20 -> 2026-09-03)

The sweep is provably complete: 1,280,825 trade records on XLM/USDC and 54,557 on USDC/EURC,
matching `/trade_aggregations` **exactly**, and USDC volume matching to $1 on both books
(`0.00%` delta, printed by `report.mjs` on every run).

| | XLM/USDC | USDC/EURC |
|---|---|---|
| trade records | 1,280,825 | 54,557 |
| operations | 1,202,359 | 46,815 |
| fan-out | 1.07x | 1.17x |
| USDC volume | $36,800,101 | $1,712,301 |
| largest operation | $97,663 | $17,851 |

**86% of all operations are under $1.** The dust is real and it is the majority.

Above $20,000, over 14 days, across both books:

| class | ops | volume | accounts |
|---|---|---|---|
| market order (path payment, `from != to`) | **1** | $20,783 | 1 |
| crossing offer (`manage_*_offer` that filled) | 2 | $52,192 | 2 |
| arbitrage loop (path payment, `from == to`) | 20 | $707,953 | 13 |

Allowing for slicing (same account, same direction, same hour), **39** parent orders reached
$20,000, from just **10** distinct accounts, 37 of them arriving as more than one operation. But
only **1** of those 39 contains a market order at all: the other 38 are built entirely from limit
orders that crossed, which is what market making looks like.

**Read this honestly.** On these two books, over these two weeks, size is moved almost entirely by
arbitrage bots and by market makers crossing with limit orders. Directional customer flow at size
is close to absent: one path payment above $20,000 in fourteen days, and slicing does not rescue
the number - it raises the parent-order count to 39 while concentrating it in 10 accounts that are
almost all market makers. That is not the result §6.2 was hoping for, and it should be reported as
measured rather than reframed.

Three limits keep this from being the last word, and all three are testable: Soroban venues
(Soroswap, Aqua's Soroban pools) settle as contract invocations and are invisible to Horizon
trades; only two of Stellar's order books were swept; and large fiat-adjacent flow moves through
SEP-24 anchors without touching the DEX at all.

The fan-out is also far smaller than the scoping note assumed: 1.07x, not hundreds of trades per
order. The dust problem is real, but it comes from many tiny operations, not from one big order
shattering into fragments.

## Out of scope

- **Soroban DEX volume.** This reads the classic orderbook and AMM pools that Horizon indexes as
  trades. Soroswap and other Soroban AMMs settle as contract invocations and do not appear.
- **Every pair on the network.** Only the two USDC-legged books the grant argument rests on.
- **Why** the flow exists, or whether those takers would have used an RFQ desk. This measures what
  the flow is and how big it is; the interview track in §3.1 is what tests the rest.
- **Slices below the detail floor.** Parent orders are reconstructed only from operations at or
  above `--floor` (default $1,000), because only those are resolved against `/operations/{id}`.
  A trader splitting $20,000 into forty $500 clips is invisible. Lower the floor to look.
- **Slices spread across hours or across accounts.** The hour bucket is a lower bound on slicing,
  deliberately: a wider window would start merging unrelated activity by the same market maker.
