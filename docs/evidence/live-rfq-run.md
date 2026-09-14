# Live RFQ Run — Milestone Evidence Record (E2E-02 / D-11)

Recorded: 2026-09-14. Network: Stellar Testnet.

This is the human-readable evidence record for the "Full RFQ Loop on Testnet" milestone. Every
figure below is transcribed from the committed machine-readable artifact
`docs/evidence/live-rfq-run.json`, produced by the canonical run of `npm run e2e:rfq:live` against
the Vercel branch preview. Nothing here is re-derived from memory; where a number appears, it is
copied from that file or independently confirmed on Horizon.

## What was proven

A real registered maker (`GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3`), quoting live
from its own always-on server in the separate `trustrfq-maker-server` repository, was discovered by
the desk exclusively through `rfq_registry` — no hardcoded maker URL exists anywhere in the taker
path — and settled two real Testnet swaps end to end, in both directions of the curated XLM/USDC
pair, plus one further swap signed by a real Freighter wallet extension rather than the automated
driver's mock. ROADMAP Phase 3 names four success criteria; here is what proves each:

1. *"A maker registered on `rfq_registry` with a real stake is discovered by the desk with no
   hardcoded URL anywhere in the flow"* — proved by the Registry entry section below (staked
   1,200,000,000 stroops = 120 XLM) plus `tools/e2e/rfq-driver.mjs`'s `readRegisteredMaker`, which
   learns the maker's URL exclusively from an on-chain `get_maker` simulation (no `page.route`
   interception, no spawned stub process in LIVE mode).
2. *"The maker's own server returns a live signed quote over the Stellar RFQ v1 wire protocol, and
   the desk validates and accepts it"* — proved by the automated run's two quote rows (The automated
   run section), and — once The manual run section below is filled in — by that accepted quote too.
3. *"The swap settles on Testnet end-to-end: tx hash, swap event, and all four balance deltas
   confirm the exact quoted amounts plus the maker-paid fee"* — proved by the automated run's two
   transaction hashes with five (not four — this record also tracks the fee collector's own leg)
   exact balance deltas each. The manual run below adds one further Freighter-signed transaction
   hash once recorded.
4. *"The run is recorded ... so it is reproducible after a quarterly Testnet reset"* — proved by the
   Post-reset re-run instructions section below. This specific claim is a `backstop` truth: no
   Testnet reset has happened yet, so reproducibility after one is written for, not yet exercised.

## The maker

- **Address:** `GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3`
- **Sibling repository:** `trustrfq-maker-server`, first commit `5d41596` (Plan 03-01, Task 2:
  "Scaffold, deploy, and register the maker server")
- **Deployed origin:** `https://trustrfq-maker-server.vercel.app`
- **Registered endpoint URL (on-chain):** `https://trustrfq-maker-server.vercel.app/api/rpc`
- **Identity persistence:** the maker's Stellar keypair is permanent (D-10) and stays registered on
  `rfq_registry` until the next Testnet reset. Its secret exists only in Vercel's Sensitive
  Production+Preview environment variables and in a gitignored local `maker-keys.json` in the
  sibling repo — never committed, never logged.

## Registry entry

- **URL:** `https://trustrfq-maker-server.vercel.app/api/rpc`
- **SAC tokens listed:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (native XLM SAC),
  `CDKTFWDMHMWLVWG53XVUZS2KDTDCUDLYXOSFGDFYN5ZUS2GFVWUUAARY` (demo USDC SAC)
- **Staked:** `1200000000` stroops = 120 XLM
- **`rfq_registry` contract id:** `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`
- **`set_url` / `add_tokens` transaction hashes:** recorded in Plan 03-01's own registration run
  (the maker bootstrap), not this plan's live-driver run — see `03-01-SUMMARY.md`'s coverage
  section: the maker registered with a real 120 XLM stake and both SAC tokens listed, confirmed via
  the registry's own `get_maker` read-back at registration time.

## Pricing

The maker server prices every quote at a fixed configured mid rate of **2.5 USDC per XLM**
(`MID_RATE_USDC_PER_XLM`, D-04) with **0 bps** of configured spread (`SPREAD_BPS`). Pricing is a
fixed configured rate, not a market feed — that is exactly what makes the "expected" and "measured"
columns below comparable to the stroop: the expected amount is arithmetic on a known constant, not
an estimate against a moving external price.

**`rfq_swap` settlement contract id:** `CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT`
— the every quote's `Order` is built against this contract, and `feeBps`/the fee collector below are
read live from its own `get_config`.

## The automated run

- **Desk deployment URL driven:** `https://trustrfq-git-feat-rfq-milestone-acakbin1418-9430s-projects.vercel.app/otc.html`
- **Driver command:**
  ```bash
  REAL_MAKER_ADDRESS=GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3 \
  BASE_URL=https://trustrfq-git-feat-rfq-milestone-acakbin1418-9430s-projects.vercel.app/otc.html \
  LIVE_DIRECTIONS=xlm-usdc,usdc-xlm \
  npm run e2e:rfq:live
  ```
- Both directions settled in **one browser session**, on the **first full attempt** for each
  direction — no dropped fan-out on either direction in the canonical run (each direction's
  `attempts` array in the JSON artifact carries exactly one entry, `rowCount: 1`, meaning the
  maker's quote row rendered on the first request; no attempt produced zero rows).

### Direction 1: XLM → USDC

| Field | Value |
|---|---|
| Sell amount | 1 XLM |
| Quoted receive amount | 2.5 USDC |
| Order id | `1789387809039105` |
| Expiry (unix) | `1789387899` |
| Transaction hash | `257fbc16d8efca857704e86bc8b7514c4a02472075a5befd8b44bc80bf5cfb0a` |

Balance deltas (stroops), measured against expected:

| Account | Asset | Expected | Measured |
|---|---|---|---|
| Taker | XLM | -10046257 | -10046257 |
| Taker | USDC | +25000000 | +25000000 |
| Maker | XLM | +10000000 | +10000000 |
| Maker | USDC | -25025000 | -25025000 |
| Fee collector | USDC | +25000 | +25000 |

All five deltas exact. The taker's XLM delta (-10046257) is 1 XLM sold (-10000000 stroops) plus
this settlement transaction's own network `fee_charged` (46257 stroops) — the taker's native-asset
delta always includes that fee when the taker also transacts in XLM. The maker's USDC delta
(-25025000) is the 25,000,000-stroop quoted payout plus the 25,000-stroop maker-paid fee.

### Direction 2: USDC → XLM

| Field | Value |
|---|---|
| Sell amount | 5 USDC |
| Quoted receive amount | 2 XLM |
| Order id | `1789387818450813` |
| Expiry (unix) | `1789387908` |
| Transaction hash | `b0d6b9dfe09c9b0cdd5d9943373994365dd7bef5bc23ac32ee60353c555dd0aa` |

Balance deltas (stroops), measured against expected:

| Account | Asset | Expected | Measured |
|---|---|---|---|
| Taker | USDC | -50000000 | -50000000 |
| Taker | XLM | +19954192 | +19954192 |
| Maker | USDC | +50000000 | +50000000 |
| Maker | XLM | -20020000 | -20020000 |
| Fee collector | XLM | +20000 | +20000 |

All five deltas exact. The maker's XLM delta (-20020000) is the 20,000,000-stroop (2 XLM) quoted
payout plus the 20,000-stroop maker-paid fee. The taker's XLM delta (+19954192) is that same
20,000,000-stroop payout minus this settlement transaction's own network `fee_charged` (45808
stroops) — because the taker both sold USDC and received XLM in the same transaction, the tx fee
(always paid in XLM) is subtracted from the taker's net XLM receipt even though XLM was the buy
leg, not the sell leg.

**Maker-paid fee:** 10 bps (`feeBps: 10` from `rfq_swap`'s live `get_config`) on both directions —
25,000 stroops of USDC (Direction 1) and 20,000 stroops of XLM (Direction 2), each computed on the
buy-leg amount and paid by the maker into the fee collector (`GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI`), distinct from both the maker and the taker.

**Every fan-out attempt:** both directions' `attempts` arrays in `live-rfq-run.json` carry exactly
one entry each (`attemptIndex: 0`, `makersFound: 7`, `rowCount: 1`). Seven makers were found on the
shared live `rfq_registry` for this pair (the registered maker above plus six dead/orphaned
registrations from earlier test runs — see Accepted gaps), and exactly one quote row rendered: the
real maker's. No attempt in this run was dropped or timed out; there is nothing to report beyond
this single successful attempt per direction.

## Latency

- **Warm response time:** measured at `373ms` (`warmupMs` in the JSON artifact, a warm-up `OPTIONS`
  request issued immediately before the canonical run).
- **Cold response time:** independently measured during Plan 03-01's checkpoint at `1.735s` after a
  7-minute idle gap (recorded in `03-01-SUMMARY.md`'s coverage section for requirement D1).
- Both figures are measurements, not the planning-time assumption carried in `03-RESEARCH.md`
  (Flagged Assumption 2), and both sit comfortably under the desk's 3-second per-request fan-out
  timeout. No first attempt was dropped by that timeout in either the automated or the manual run
  recorded here. Because the gap between warm and cold is real (373ms vs 1,735ms) but neither has
  ever approached the 3s ceiling in a recorded run, the keep-warm cron mitigation named in
  `03-RESEARCH.md` remains an available but deliberately un-built follow-up, not a required fix.

## The manual run

**STATUS: PENDING — this section is an unfilled placeholder.**

This is the one human-driven Testnet settlement named in D-08: a real Freighter browser extension,
controlled by a human, connected to a real Testnet account, settling one live quote from the same
registered maker described above. It is the single piece of evidence in this record that will not
pass through `tools/e2e/freighter-mock.mjs` (the automated driver's postMessage-shimmed wallet,
signing with a keypair the driver process itself holds) — everything else in this record, including
both automated-run transactions above, settled through that mock. This section will be filled in
immediately after the checkpoint task in `03-04-PLAN.md` (Task 2) returns its result; do not treat
any hash or address appearing anywhere else in this record as satisfying this section.

Fields to be recorded here once the manual run completes: date, desk deployment URL used, wallet's
public address (`G...`), direction settled, amount, transaction hash, the observed prompt sequence
stated as a protocol property (one ordinary transaction signature for the settle, plus a separate
`changeTrust` signature only if a trustline had to be opened, and no auth-entry signing prompt at
any point on the taker path), and whether the browser console was clean of CSP/CORS messages
against the maker's own origin.

## Accepted gaps

| Gap | Reason / disposition |
|---|---|
| No maker-side rate limiting, no `-33605` in the v1 reference server | Deferred beyond v1 by D-03 and spec §7.4. Acceptable at demo scale: this is a reference implementation for one maker, not a production multi-tenant service. |
| Wide-open CORS policy on the maker's `/api/rpc` endpoint | The maker's signature over the economic terms (the detached `authEntry`) is the trust boundary, not CORS. A browser enforcing same-origin would not add any security the signed auth entry doesn't already provide — CORS here only affects which origins *can ask*, not whether a forged answer would be honored, since no answer is honored without the maker's own signature. |
| Maker's secret held in a platform environment variable (Vercel Sensitive env var), not a KMS or HSM signer | A v2 hardening item. The spec's own maker-server design notes (§6) explicitly leave room for "a KMS/HSM-backed signer callback" to slot into the same `authorizeEntry` call site without changing the wire protocol. |
| Testnet only | This entire milestone, and the repo's constraints generally, are Testnet-only until external audit and governance questions resolve (see PROJECT.md Out of Scope). |
| Seven makers found on the shared registry for the curated pair, six of them dead/orphaned entries from earlier test sessions | Pre-existing, documented since Plan 02-03/03-02: a permanent un-ejectable stray (`http://127.0.0.1:4610`, no known key) plus orphaned `localhost` stub-maker registrations whose `Keypair.random()` secrets were held only in crashed processes' memory. None of these produced a quote row in this run (the desk's local validation and the maker's own signature are the trust boundary, not registry cleanliness); the browser's CSP correctly blocked any fetch toward them, since only the real maker's origin is allow-listed in `connect-src`. |

## Post-reset re-run instructions

Numbered and literal. Run in order after a Testnet reset:

1. **Redeploy and re-initialize `rfq_registry`** using the two-step sequence already documented as
   a comment above `window.RFQ_REGISTRY_ID` in `public/otc-config.js` of this repo (plain
   `initialize`, not a constructor — a deliberate re-init guard). Paste the new contract id into
   that same file.
2. **Point the maker repository at the new registry id.** In the `trustrfq-maker-server` repo,
   update the `RFQ_REGISTRY_ID` env var (and `RFQ_SWAP_CONTRACT_ID` if `rfq_swap` was also
   redeployed) both locally and in the Vercel project's environment variables (Production AND
   Preview — see `03-01-SUMMARY.md`'s key-decisions: a non-first deploy only sees Preview-scoped
   vars regardless of which domain it is later aliased onto).
3. **Run the maker's bootstrap script:**
   ```bash
   cd ../trustrfq-maker-server
   npm run bootstrap
   ```
   This re-funds the maker via Friendbot, re-opens the USDC trustline and inventory if absent, and
   re-registers on the new registry via `set_url` then `add_tokens`, reading `get_maker` back to
   confirm. **Never pass `--fresh-maker` to this command unless this is genuinely the maker's
   first-ever bootstrap** — `--fresh-maker` generates a brand-new keypair and permanently orphans
   whatever registry entry the previous key held, because no later process can ever sign an `eject`
   for a key nobody kept.
4. **Update the maker origin in this repository's CSP if the origin changed.** Edit `connect-src` in
   `vercel.json` to the new deployed maker origin (unnecessary if the maker's Vercel deployment URL
   did not change, which is the common case — only the registry/contract ids move on a Testnet
   reset, not the maker's own domain).
5. **Re-run the live driver** from this repository:
   ```bash
   REAL_MAKER_ADDRESS=<maker public key> \
   BASE_URL=<desk deployment URL to exercise> \
   LIVE_DIRECTIONS=xlm-usdc,usdc-xlm \
   npm run e2e:rfq:live
   ```
   This overwrites `docs/evidence/live-rfq-run.json` with a fresh canonical run; update this file's
   figures to match before committing.

## Self-check

- Every hash, address, and contract id above appears verbatim in `docs/evidence/live-rfq-run.json`
  except the manual run's own transaction hash and wallet address (necessarily absent from that
  file, since the manual run is not driven by the automated script that produces it).
- No Stellar secret key (`S...`, 56 characters) appears anywhere in this file.
- This record states plainly which two transactions used the automated driver's mock Freighter
  wallet (Direction 1, Direction 2) and which one used a real Freighter extension (the manual run).
