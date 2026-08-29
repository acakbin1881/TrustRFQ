# Phase 2: Desk RFQ Taker Path - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29 (discussion ran 2026-08-26 → 2026-08-29)
**Phase:** 2-Desk RFQ Taker Path
**Areas discussed:** RFQ placement in the desk, Quote display and selection, Trustline and settlement UX, Stub maker and E2E wiring

---

## Pre-area detour: should there be an interface at all?

The user interrupted the first placement question twice with "bizim interface'imiz olacak mı?
Sonuçta protokol yapıyoruz" and then "arayüz olmalı mı?", and had Claude read the SCF Customer
Development Plan live from the private Notion RFQ page before continuing.

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal reference interface | Desk surface stays deliberately small; exists to demonstrate the protocol; taker logic SDK-shaped | ✓ |
| Full product experience | Desk as the protocol's showcase trading UX | |
| Headless Phase 2 | No UI at all; would require rewording the milestone DoD and E2E-02 | |

**User's choice:** Minimal reference interface ("Minimal referans arayüz, karar bu"), then
"mevcut milestone'ları ve planlamaları/alakalı dokümanları buna göre revize et".
**Notes:** Resolved by the plan's own §3.1 (Final): "Our own web interface exists only to
demonstrate the protocol." Planning docs revised as POS-D1/UI-D1 (PROJECT.md, REQUIREMENTS.md,
ROADMAP.md, STATE.md; commit `2edd092`). Notion deliberately untouched ("hiçbir şeyi değiştirme
ama oku ve anla").

---

## RFQ placement in the desk

| Option | Description | Selected |
|--------|-------------|----------|
| Separate minimal RFQ panel | Independent surface; Ticket.tsx and broadcast untouched | ✓ |
| RFQ mode toggle in Ticket | One form carries directed/broadcast/RFQ | |
| Post-compose branching | Empty counterparty asks "broadcast or RFQ?" at send time | |

**User's choice:** Separate minimal RFQ panel, then "Dördüncü bölüm" for its position
(fourth section in the bar nav, peer of create/incoming/sent).

Discovery visibility sub-question:

| Option | Description | Selected |
|--------|-------------|----------|
| Strictly minimal | Makers invisible until quotes arrive (AirSwap-style) | |
| N-makers count indicator | One line, e.g. "3 makers found", after pair selection | ✓ |
| Full maker list | Addresses/URLs listed | |

**User's choice:** "n maker göstergesi olsun" after asking "AirSwap'da nasıl?" (answer: AirSwap
hides discovery entirely; user still chose the indicator for the on-chain registry's demo value).

Settlement record sub-question:

| Option | Description | Selected |
|--------|-------------|----------|
| No persistent record | In-panel confirmation (amounts + tx hash); chain is the record | ✓ |
| Session-only list | In-memory list of this session's settles | |
| Write to Supabase | RFQ settles appear in Sent history | |

**User's choice:** No persistence. The user articulated the principle themselves ("on-chain
işlemler chain üzerine yazılır, backend tutulmaz") and asked to be corrected if wrong; confirmed
correct, with the indexer nuance recorded (IDX-01 deferred).

---

## Quote display and selection

| Option | Description | Selected |
|--------|-------------|----------|
| Ranked list, best preselected | All validated quotes sorted by price; taker may pick another | ✓ |
| Best quote only | Single card, AirSwap-style | |

**User's choice:** 1 (answered in plain text after asking Claude to answer their pending
question in writing first).

| Option | Description | Selected |
|--------|-------------|----------|
| Countdown + manual refresh | Expired rows drop; re-quote button re-runs fan-out | ✓ |
| Auto re-fan-out every 15-30s | Continuous refresh while panel open | |

**User's choice:** 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Sell-side only (getMakerSideOrder) | One amount field: what the taker sells | ✓ |
| Both directions | Adds getTakerSideOrder; beyond TAKER-02 | |

**User's choice:** 1; getTakerSideOrder deferred.

| Option | Description | Selected |
|--------|-------------|----------|
| Truncated address per row | e.g. GDXF…K2LP via AddressSeal | |
| Anonymous labels | "Maker 1/2/3" | |
| Hide identity entirely | Rows show price + countdown only | ✓ |

**User's choice:** After "maker'ı niye gösteriyoruz ki? AirSwap'da nasıl?" (answer: AirSwap
shows no maker identity; the signature, not identity, is the guarantee), the user approved
hiding identity: "evet".

---

## Trustline and settlement UX

| Option | Description | Selected |
|--------|-------------|----------|
| Early passive note + in-flow prompt | Zero-cost check via useBalances at pair selection; changeTrust prompt at accept | ✓ |
| Just-in-time only | AirSwap approve-style, in-flow only | |

**User's choice:** 1, after asking "AirSwap'da nasıl?" (answer: AirSwap is just-in-time, but
the analogy breaks on Stellar: -33700 lets maker servers refuse trustline-less takers, which
would look like an unexplained empty quote list).

| Option | Description | Selected |
|--------|-------------|----------|
| Price-guarded auto-retry | Silent single retry only at equal-or-better price; re-ask on worse | ✓ |
| Unconditional auto-retry once | Spec-literal; may sign an unseen worse price | |

**User's choice:** "AirSwap'la aynı olsun" after two clarification rounds: first a step-by-step
walkthrough of the expired-entry scenario ("bunu anlamadım"), then the firm-quote guarantee
("o birkaç saniyede fiyat değişebilir" → within validity the price CANNOT change; only an
expired quote yields a new price). AirSwap norm stated: the taker never signs at an unseen
price; the spec's unconditional sentence is an SDK convenience. Locked as price-guarded.

---

## Stub maker and E2E wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Real registration on Testnet registry | Friendbot maker stakes, registers localhost URL, desk discovers normally, eject refunds | ✓ |
| Injected/mocked discovery | Test hook points desk at localhost; discovery untested | |

**User's choice:** 1.

| Option | Description | Selected |
|--------|-------------|----------|
| Curated per-maker origins in vercel.json | Strict allow-list kept; origins added at deploy time | ✓ |
| connect-src https: wildcard | AirSwap-equivalent; any maker reachable, posture loosened | |

**User's choice:** 1, after "AirSwap'da nasıl?" was answered with a live measurement
(curl: airswap.io and trader.airswap.io send NO CSP header and no meta CSP, HSTS only).

| Option | Description | Selected |
|--------|-------------|----------|
| Faithful stub with failure knobs | Real signed quotes + togglable slow/malformed/-33700/drifted-economics/expired modes | ✓ |
| Happy-path only | Valid quotes only; failure paths left to unit tests | |

**User's choice:** 1, after a simplified re-explanation ("anlamadım basitleştirerek anlat"):
the stub as an actor that can play both the honest maker and the misbehaving one, fire-drill
analogy.

---

## Claude's Discretion

- Settlement progress display (reuse existing toast/status/tx-link patterns).
- Panel microcopy, empty states, fee footnote, section label.
- SDK-shaped module layout under `src/`; stub maker location/port and knob mechanism.
- Golden-vector fixture shape for the RFQ order encoding.

## Deferred Ideas

- getTakerSideOrder (buy-fixed) on the desk.
- RFQ trade history / read-back (IDX-01, open question).
- CSP https: wildcard if origin curation ever becomes a burden.
- Registry indexer/HTTP cache (carried from Phase 1).

## Process notes

- The user repeatedly calibrated against AirSwap ("AirSwap'da nasıl?" x4); answers were given
  from the ported protocol's source/spec knowledge and, for CSP, from a live header check.
- Mid-discussion the user set a working rule: typed questions get a visible plain-text answer
  before any question box or tool call (saved to memory as answer-in-text-first).
- Discussion paused twice on fundamentals (interface existence; blockchain-as-record) and both
  times resolved into recorded decisions (UI-D1, D-03) rather than re-litigated later.
