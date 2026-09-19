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
   run section) and by the manual run's own accepted quote (The manual run section).
3. *"The swap settles on Testnet end-to-end: tx hash, swap event, and all four balance deltas
   confirm the exact quoted amounts plus the maker-paid fee"* — proved by the automated run's two
   transaction hashes with five (not four — this record also tracks the fee collector's own leg)
   exact balance deltas each, and by the manual run's own Freighter-signed transaction hash and its
   five deltas.
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

**Date:** 2026-09-14
**Desk deployment URL used:** `https://trustrfq-git-feat-rfq-milestone-acakbin1418-9430s-projects.vercel.app/otc.html`
**Wallet's public address:** `GBKWHUYU4G5N7UNWGYO3BMHWMHUQIIIE23YJ5CWWRRKF2QK52AYUWP3K`
**Direction:** XLM → USDC
**Amount:** 50 XLM
**Transaction hash:** `6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7`

Independently confirmed on Horizon: `successful: true`, ledger `4673408`, created at
`2026-09-14T12:57:07Z`, one `invoke_host_function` operation, `fee_charged` `46259` stroops, source
account (the taker, as the RFQ design requires — the taker is the transaction source, never a
detached auth-entry signer) matching the wallet address above.

Balance deltas (stroops), derived from the tx and the confirmed source/destination accounts, at the
maker's fixed 2.5 USDC-per-XLM mid rate with 10 bps maker-paid fee:

| Account | Asset | Delta |
|---|---|---|
| Taker | XLM | -500046259 (50 XLM sold, plus this tx's own 46259-stroop network fee) |
| Taker | USDC | +125000000 (125 USDC received) |
| Maker | XLM | +500000000 (50 XLM received) |
| Maker | USDC | -125125000 (125 USDC quoted payout + 125,000-stroop maker-paid fee) |
| Fee collector | USDC | +125000 (0.125 USDC = 10 bps of 125 USDC) |

Observed prompt sequence, stated as a protocol property: **one ordinary Freighter transaction
signature for the settle, and no separate Soroban auth-entry signing prompt on the taker path at
any point** — this is the design's core claim (RFQ-D1+D2, §6 of the adopted spec): the taker signs
one ordinary transaction as the transaction source account, never a detached authorization entry.
Horizon's own record of a single `invoke_host_function` operation with the taker as source account
confirms this from the chain side, independent of what the wallet UI displayed.

The human operator reported the browser console as clean throughout the run (no Content Security
Policy or CORS message against the maker's own origin, `https://trustrfq-maker-server.vercel.app`).
This is a human attestation, not machine-verified — inherent to closing the mock-wallet gap this
run exists to close (T-03-18 in this plan's threat register accepts that risk explicitly, mitigated
by the transaction hash itself being independently, on-chain checkable).

**This run used a real Freighter browser extension, connected by a human to a real Testnet
account.** It is the one piece of evidence in this record that does not pass through
`tools/e2e/freighter-mock.mjs` (the automated driver's postMessage-shimmed wallet, signing with a
keypair the driver process itself holds). The two automated-run transactions above (Direction 1 and
Direction 2) both settled through that mock wallet; this transaction is the only one in this record
signed by an actual wallet extension holding its own key material never exposed to any script in
this repository. This run also discharges the real-browser + real-Freighter-extension manual check
originally named in Plan 03-02's Task 3 `how-to-verify` and deferred from there to this plan (see
`deferred-items.md`'s "03-02 Task 3" entry) — that item is now closed, not merely deferred again.

## The post-merge production check (D-07)

D-07's gate was answered `merge-after-production-check` (human decision, 2026-09-14): the merge of
`feat/rfq-milestone` into `main` was authorised **on the condition** that one live settle then ran
against the production URL itself, with its hash recorded here. The merge landed as `2f3706f` and
auto-deployed production on 2026-09-16; this section closes that condition.

**Date:** 2026-09-16
**Desk deployment URL used:** `https://trustrfq.vercel.app/otc` — the production URL, not a preview
**Driver:** `tools/e2e/rfq-driver.mjs` LIVE mode (mock Freighter wallet), both directions
**Warm-up:** 344 ms · **makers discovered:** 7 · **quote rows rendered:** 1 per direction

| Direction | Transaction hash | Horizon | Deltas |
|---|---|---|---|
| XLM → USDC | `95db66486ca6596b351e9d571094dfd362a2f6b8268d9c1efa5133ed86e818cf` | `successful: true`, ledger `4707571`, `2026-09-16T12:24:02Z` | 5/5 exact |
| USDC → XLM | `c1d10c5e365864dd68af993d58bee96b346db8a9dbec9f75fecc38340354c7fd` | `successful: true`, ledger `4707573`, `2026-09-16T12:24:12Z` | 5/5 exact |

Production's served CSP was read directly from the response headers and carries the maker origin
(`connect-src … https://trustrfq-maker-server.vercel.app`), so the CSP-01 change survived the merge
into the production deployment rather than only existing on the branch preview.

The run's `cspViolations` array is non-empty (12 entries) and, exactly as in every earlier run,
every entry is a dead or orphaned `rfq_registry` URL (`127.0.0.1:4610`, `localhost:4174/4175/4180`)
being blocked by the allow-list. **None is the maker's own origin.** This is the interpretation
approved by the human at Plan 03-02's Task 3 checkpoint, applied here unchanged.

One operational note worth recording, because it cost three failed runs before being understood: a
first attempt against production died mid-run with a bare `fetch failed`, and a later run of
`tools/e2e/rfq-demo-check.mjs` failed three times at the quote step with the panel reporting
"No registered maker responded in time" — while the same maker, asked directly by `curl` for the
same taker account, answered a valid signed quote in under a second. The cause was neither the
maker nor the deploy: this machine idle-sleeps mid-run and suspends the browser's network
(`net::ERR_NETWORK_IO_SUSPENDED` in the page console). Long headless runs on macOS must be wrapped
in `caffeinate -i -s`. Suspect that before suspecting the maker.

## The standalone RFQ demo deploy

The same RFQ lane is also published on its own, as a single-page deploy with no landing page and no
OTC/broadcast sections: **`https://trustrfqdemo.vercel.app`** (Vercel project `trustrfqdemo`,
separate from the desk's `trustrfq` project; source entry `rfq.html` → `src/RfqDemo.tsx`, built by
`npm run build:rfq-demo`).

Because that shell drops the desk's order/broadcast subscriptions, its bundle never reaches a
database client, and it therefore ships a **tighter CSP with no Supabase origin at all**
(`connect-src 'self' <rpc> <horizon> <maker>`). `tools/build-rfq-demo.mjs` asserts that property at
build time rather than assuming it, alongside single-page-ness, no inline script, and no dangling
asset reference.

Verified end-to-end against the deployed origin by `tools/e2e/rfq-demo-check.mjs`: registry
discovery (7 makers), a real maker quote, and a real settlement — transaction
`4b3dc78dfa1712c641553e31c6434663570b569c529340efd7c6e8cbad86037f`, independently confirmed on
Horizon (`successful: true`, ledger `4707805`, `2026-09-16T12:43:32Z`). The check also asserts the
RFQ panel's computed `max-width` is `560px`, which proves `public/intent.css`'s
`[data-panel="rfq"]` rules are actually applying — the silent-failure mode a renamed `data-panel`
would otherwise produce.

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

- Every hash, address, and contract id in the automated-run sections above appears verbatim in
  `docs/evidence/live-rfq-run.json`, except the manual run's own transaction hash and wallet
  address, which are necessarily absent from that file (the manual run is not driven by the
  automated script that produces it) and are instead independently confirmed on Horizon above.
- No Stellar secret key (`S...`, 56 characters) appears anywhere in this file.
- This record states plainly which two transactions used the automated driver's mock Freighter
  wallet (Direction 1, Direction 2) and which one used a real Freighter extension (the manual run,
  `6ed3a2c699155546aeaf8284fc124c6c7739a68e6f56d66358029d0209382fe7`).
- The three transactions added after the merge (two in the post-merge production check, one in the
  standalone demo check) all used a mock Freighter wallet; only the manual run above used a real
  extension. Every hash in this file was independently confirmed against Horizon at the time it was
  written, not copied from a driver's own claim of success.
