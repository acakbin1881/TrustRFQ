# Phase 3: Live Full RFQ Loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-09-13
**Phase:** 3-Live Full RFQ Loop
**Areas discussed:** Maker server bootstrap, Origin and CSP, Who drives the run, Maker lifecycle and run record

---

## Maker server bootstrap

| Option | Description | Selected |
|--------|-------------|----------|
| Seed from stub, we build it | Create the separate repo now; stub-maker.mjs signing/wire logic is the seed (knobs dropped, persistent identity + config added) | ✓ |
| Write from scratch | New repo independent of the stub, written from spec §6 | |
| Wait for external party | Phase stays blocked until an ecosystem maker builds a server | |

**User's choice:** Seed from stub, we build it (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 3 plans drive it from here | This GSD project's plans include the separate-repo tasks; code lands in the sibling repo | ✓ |
| New repo gets its own GSD project | Independent .planning/ setup; this phase waits on it | |
| Ad-hoc non-GSD work | Plain session, no planning discipline | |

**User's choice:** Phase 3 plans drive it from here (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| D-12 minimal exactly | getMakerSideOrder + real signing + needed wire errors only | ✓ |
| Minimal + ops endpoints | Adds health endpoint and -33605 rate limiting | |

**User's choice:** D-12 minimal exactly (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed config rate | Fixed rate + optional spread in server config; deterministic record | ✓ |
| Reflector + spread | SEP-40 oracle price with spread; more realistic, less deterministic | |
| Pluggable hook, fixed default | Pricing interface with fixed-rate default | |

**User's choice:** Fixed config rate (Recommended)

---

## Origin and CSP

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy to real https origin | Permanent https origin; registry URL real; connect-src gains the origin | ✓ |
| Tunnel (cloudflared/ngrok) | Server on the Mac behind a temporary https URL; churny | |
| Localhost + preview desk | Phase 2 setup continues; production CSP untested | |

**User's choice:** Deploy to real https origin (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel serverless | getMakerSideOrder as one function; secret in Vercel env; familiar platform | ✓ |
| Always-on container (Fly.io/Render) | Persistent Node process; new platform account | |
| Own VPS | systemd + reverse proxy; full control, full burden | |

**User's choice:** Vercel serverless (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Prove on preview first | Run on the branch preview deployment (real CSP headers); merge to main after E2E-02 passes | ✓ |
| Merge first, run on production | Publish, then prove on the live URL | |

**User's choice:** Prove on preview first (Recommended)

---

## Who drives the run

| Option | Description | Selected |
|--------|-------------|----------|
| Automated + one manual run | Extended rfq-driver as the reproducible tool + one real-Freighter run as recorded evidence | ✓ |
| Automated only | Fully scripted; wallet layer stays mocked | |
| Manual only | Strongest realism, weakest reproducibility | |

**User's choice:** Automated + one manual run (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Both directions | Automated driver settles XLM->USDC and USDC->XLM; manual run one direction | ✓ |
| One direction: sell XLM receive USDC | Single settle; covers trustline path | |
| One direction: sell USDC receive XLM | Single settle; no trustline coverage | |

**User's choice:** Both directions (Recommended)

---

## Maker lifecycle and run record

| Option | Description | Selected |
|--------|-------------|----------|
| Stays registered and live | Persistent identity; registry entry kept until next Testnet reset; stake locked | ✓ |
| Register -> run -> eject | Phase 2 pattern; registry empties again | |

**User's choice:** Stays registered and live (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown + JSON together | Driver emits committed JSON artifact; dated markdown record under docs/ | ✓ |
| Markdown only | Single narrative doc; manual copying of driver output | |
| JSON only | Driver file is the record; loses manual-run narrative | |

**User's choice:** Markdown + JSON together (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| One-command re-bootstrap | Script in the maker repo: fund, trustline + inventory, register on new registry | ✓ |
| Documented manual steps | CLI steps followed by hand each reset | |

**User's choice:** One-command re-bootstrap (Recommended)

---

## Claude's Discretion

- Maker repo name, sibling location, internal layout.
- Key custody details (Vercel env var names, local gitignored key-file convention).
- CORS handling on the maker function.
- Exact record file paths, JSON artifact schema, npm script naming for the live driver run.
- Run amounts; manual-run evidence capture beyond the mandatory tx hash.
- Whether in-repo integration fixes get their own plan or fold into the run plan.

## Deferred Ideas

- Maker server ops endpoints (health, -33605 rate limiting).
- Pluggable pricing hook / Reflector-derived quoting.
- getPricing, getTakerSideOrder, WSS/LastLook (spec deferrals).
- Taker SDK extraction from src/core/rfq/ (after the milestone).
- Carried forward: IDX-01 events indexer, CSP wildcard revisit, registry indexer/HTTP cache.
