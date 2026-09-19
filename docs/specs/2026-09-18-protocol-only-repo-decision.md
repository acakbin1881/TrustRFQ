# Decision: TrustRFQ becomes a protocol-only repository

Date: 2026-09-18. Status: DECIDED (owner + Claude, chat). Supersedes, in part, the
2026-09-17 repository-professionalization design: the SDK extraction it prescribed stays, the
`apps/desk` plumbing it prescribed is abandoned (see "Consequences for in-flight work").

This file is also the handoff for the next session: it carries every fact a fresh context needs
to execute the decision without rediscovering it.

## The decision

TrustRFQ ships as a protocol and nothing else:

- the wire specification (`docs/specs/2026-08-17-rfq-protocol-architecture-design.md`, §6),
- the two contracts, `rfq_swap` and `rfq_registry`,
- `@trustrfq/sdk` (taker path today; maker-side quote signing moves into it),
- one reference maker (`trustrfq-maker-server`, the maker's OWN always-on endpoint),
- one developer-facing demo (`tools/rfq-terminal-demo.mjs`) and, as a judgment call, one thin
  static browser client (the current `trustrfqdemo.vercel.app` page, frozen).

Everything that made it an application is removed in one piece: the desk, the directed OTC lane,
the broadcast/intent fan-out, Supabase, `otc_swap`, the desk's Vercel project, the mock-Freighter
E2E harness, the vanilla reference implementation.

"There is no OTC any more, only RFQ" is exact, not a slogan: `rfq_swap`'s `Order` binds
`order.taker`, so a maker quoting one specific taker a firm price IS the RFQ protocol (AirSwap's
own glossary: "Alice signs and gives Bob a priced order. Bob sends the order to the Swap
contract."). A counter-offer is asking for another quote. The only thing that disappears is the
Supabase-coordinated negotiation UI, which was also the one centralised component in a
"no middleman" design.

## Why now

1. POS-D1 (2026-08-24) already fixed the positioning: protocol, not interface; the desk exists to
   demonstrate, and interface metrics never count as evidence. The desk has since consumed most of
   the maintenance and "gotcha" budget (two CSS systems, CSP allow-list, the wallets-kit
   `signAuthEntry` double-encoding, Supabase realtime, Playwright census) for zero evidentiary value.
2. The measured demand data (`tools/tradesize`: above $20k, one market order in 14 days on mainnet)
   says the value is in protocol primitives and a maker network, not a retail screen.
3. The in-flight professionalization work is about to spend more effort on `apps/desk` plumbing
   (Vercel output directory, `.vercelignore`, workspace wiring) that a desk-less repo never needs.
   Deciding today avoids finishing dead work.

## What is removed

| Removed | Notes |
|---|---|
| `apps/desk/` (59 source files) | the whole desk: OTC, broadcast, threads, rounds, Ticket, the RFQ panel's desk shell, `hero.*` landing, `styles.css`/`intent.css`, `otc-config.js`/`supabase-config.js` |
| Supabase | client, config, CSP origins, `docs/migrations/*.sql` (archive the SQL under `docs/archive/` with a note; the live project's schema drop is a human action) |
| `contracts/otc_swap/` | retirement was already decided 2026-08-19; the `83f60b85` wasm-hash gate goes with it |
| `tools/e2e/` (78 files) | the mock-Freighter census/RFQ drivers are desk tests; `rfq-demo-check.mjs` stays ONLY if the thin browser client is kept |
| `tools/reference/` and `tools/checks/` | vanilla `otc.js`/`canonical.js`, bundle/dev-smoke/capture: all pin the OTC `fill` canonical bytes |
| root `vercel.json`, `.vercelignore`, `vercel.rfq-demo.json` | the desk's deploy; the thin client's deploy config, if kept, is derived by `tools/build-rfq-demo.mjs` |
| desk Vercel project `trustrfq` | delete, or repoint the domain at the thin client / a one-page README pointer (open question) |

Note on `rounds`: the RETIRE-01 wording ("remove `broadcasts`/`rounds`/`intents`") contradicted
Phase 4's own success criterion 3, because `rounds` also powers the directed lane's counter-offers
(`ThreadView` -> `useRounds`). Deleting the desk resolves the contradiction: nothing directed
survives to be broken.

Note on `rfq_swap`: the 2026-08-19 amendment (`require_fill_guard` in the signed tuple, new wasm)
was never implemented; the deployed `Order` has nine fields and no guard flag. There is nothing to
remove from the contract; it is already pure RFQ.

## What stays

| Stays | Where |
|---|---|
| `rfq_swap` (`CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT`), `rfq_registry` (clean instance `CBEFE7JY3PT5XF6CT3BMWF5RGPNUBGHKWPUDD3KLFZBLXFE3RPIDRLL3`) | `contracts/` (workspace root keeps `[profile.release]`) |
| `@trustrfq/sdk` 0.1.0: wire, order, validate, discover, network, retry, settle, trustline, assets | `packages/sdk/` |
| maker-side quote signing (`priceQuote`, `validateRequest`, `signQuote`) | today in `trustrfq-maker-server/src/signing.ts`; moves into the SDK so "OTC by hand" is a library call |
| reference maker `GDUXGYZPDZVZI4LYPAPNGW3MHPBAQB7WBPPFPOP4HUQZDRFQ6FT2YWT3` at `https://trustrfq-maker-server.vercel.app/api/rpc` | sibling repo `/Users/acakbin1881/Projects/trustrfq-maker-server` (fold into the monorepo: open question) |
| `tools/rfq-terminal-demo.mjs` (currently UNTRACKED WIP): the whole lane in one command, incl. tamper and replay proofs | commit it; it becomes the canonical reproduction path |
| `docs/evidence/live-rfq-run.{md,json}` | tx hashes are on-chain and stay valid; only the "reproduce" section changes |
| `tools/slippage/`, `tools/tradesize/` | the grant's demand evidence |
| demo-USDC issuer tooling (`derive-keys`, `fund-demo`, `mint-usdc`, `sweep-xlm`) | the maker sells demo USDC; keep under `tools/` |
| the protocol spec and this file | `docs/specs/` |

## Two clarifications on "remove Vercel and the backend"

- "No backend" is true for the PROTOCOL: no shared server, no database, nothing central. It is
  not true for a maker: the protocol requires each maker to run an always-on quote server. The
  reference maker is hosted on Vercel because that is the maker's own deployment, not TrustRFQ's
  infrastructure. Removing it would kill the live demo and the evidence chain. It stays hosted
  (Vercel or anywhere).
- "Remove the UI" is accepted for the desk. The thin browser client is a judgment call and is
  KEPT for now: it is ~100 lines over the SDK, static, no backend, and it is the one artefact a
  non-developer (grant reviewer, prospective maker) can click through in 60 seconds with a real
  wallet. Decide finally at grant submission; if the terminal demo is enough by then, delete it.

## Consequences for in-flight work

Branch `feat/rfq-milestone` state on 2026-09-18 (before this commit): 14 commits ahead of
`origin/main`, 9 of them unpushed; tests 204/204 (15 files), typecheck and build clean.

- STOP the remaining `apps/desk` items of the 2026-09-17 spec: root `vercel.json` still says
  `outputDirectory: dist` while the build writes `apps/desk/dist` (a merge to `main` today would
  break the production deploy), the stale tracked `vercel.rfq-demo.json` (the build script already
  derives the demo config from the root file), the `.vercelignore` update. None of it is needed
  once the desk goes. Do NOT merge the branch to `main` before Phase 4 lands.
- The deployed `rfq_swap` / `rfq_registry` instances on Testnet do NOT match `HEAD` source (the
  09-17 work recorded registry TTL widening and an `is_paused` read as in-scope fixes; a redeploy
  needs an explicit go from the owner). Phase 4's contract criterion must state which source the
  live ids correspond to, or include the redeploy as a planned, human-gated step.
- KEEP the SDK extraction (`packages/sdk`), the clean registry repoint, the maker's code-review
  fixes (`74f10c2`, `11686ff` in the sibling repo).
- Production (`https://trustrfq.vercel.app`, tracks `origin/main`) still reads the OLD registry
  `CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G`; the maker is registered on both, so
  production's RFQ lane keeps working until the desk is retired. Nothing urgent there.
- `https://trustrfqdemo.vercel.app` (Vercel project `trustrfqdemo`, static, CSP without Supabase)
  already runs against the clean registry. It is the thin client referred to above.
- Do not 404 any URL already sent to anyone externally until its replacement is live.

## Phase 4, rewritten (paste into ROADMAP.md via `/gsd-phase edit 4`)

**Phase 4: Protocol-Only Repository**

**Goal**: With the RFQ protocol shipped and evidenced, retire the application layer in one
piece: the desk, the OTC and broadcast lanes, Supabase, `otc_swap`, the desk's hosting and E2E
harness. What ships is the protocol: spec, `rfq_swap`, `rfq_registry`, `@trustrfq/sdk`
(taker and maker sides), a reference maker, a terminal demo, and one thin static browser client.

**Depends on**: Phase 3.

**Requirements**: RETIRE-01 (rewritten below).

**Success criteria** (what must be TRUE):

1. No Supabase anywhere in the shipped tree: no client import, no config script, no CSP origin,
   no `docs/migrations/`. The SQL is archived under `docs/archive/` with a note that the live
   project's schema drop is a recorded human follow-up.
2. `contracts/` holds exactly `rfq_swap` and `rfq_registry`; `otc_swap` and its wasm-hash gate
   are gone; `cargo test --manifest-path contracts/Cargo.toml` is green for both members.
3. `apps/desk`, `tools/e2e` (except the thin client's own check if the client is kept),
   `tools/reference`, `tools/checks`, the root `vercel.json`/`.vercelignore`, the `/intent`
   redirect and the landing are deleted; no path in the repo references `apps/desk`.
4. `@trustrfq/sdk` exposes a documented public API for the taker path AND maker-side quote
   signing (moved out of the maker server, which then imports it), with unit tests green.
5. `tools/rfq-terminal-demo.mjs` is committed and completes a live quote + settle against the
   registered maker on Testnet, including its tamper and replay rejections; it is the canonical
   reproduction path named in `docs/evidence/live-rfq-run.md`.
6. README is rewritten as a protocol README (what it is, spec, contracts, SDK, run a maker, take
   a quote, evidence); `npm test` and `npm run typecheck` are green at the root.

**Plans**: TBD. Suggested waves: (1) SDK gains maker signing + maker server imports it;
(2) terminal demo committed + evidence/README rewritten; (3) contracts + config: drop `otc_swap`;
(4) delete desk, Supabase, tools, deploy config LAST, so something runnable exists until the end.

**RETIRE-01, rewritten (REQUIREMENTS.md)**: Once the RFQ protocol has shipped (Phase 3), the
application layer is retired all together: the desk (`apps/desk`), the OTC directed lane and the
broadcast/intent fan-out with their Supabase schema and client, `otc_swap` and its deployment
gate, the desk's Vercel project, the mock-Freighter E2E harness and the vanilla reference. What
remains is the protocol: spec, `rfq_swap`, `rfq_registry`, `@trustrfq/sdk`, the reference maker,
a terminal demo and one thin static browser client (judgment call, revisit at grant submission).

## Open questions for `/gsd-discuss-phase 4`

1. Keep the thin browser client (recommendation: keep, frozen) or terminal demo only?
2. Fold `trustrfq-maker-server` into the monorepo as `packages/maker-server`? The 2026-08-17 spec
   wanted maker + SDK in a separate repo; the SDK is now in-repo, so the argument weakens.
3. What does `trustrfq.vercel.app` serve afterwards: the thin client, a one-page pointer to the
   repo, or nothing (delete the project)?
4. Supabase live project `zaflldqvenbgfaxtzbjc`: drop the schema now (human, SQL editor) or record
   as follow-up? Nothing else lives in that project.
5. IDX-01 (events indexer) stays an open question; decide at milestone close, not here.

## Sequence

0. This file committed on `feat/rfq-milestone`. STATE.md points at it.
1. Fresh session: `/gsd-phase edit 4` with the Phase 4 and RETIRE-01 text above.
2. `/gsd-discuss-phase 4` with the open questions above.
3. `/gsd-plan-phase 4`, then `/gsd-execute-phase 4`, then verification.
4. `/gsd-audit-milestone`, `/gsd-complete-milestone` (v1.0 closes); decide IDX-01.
5. Human-only actions (the permission classifier blocks them for Claude): push, merge to
   `main` (deploys production), Vercel project deletion/repoint, Supabase schema drop.

## Gotchas to carry forward

- Long headless runs on this Mac must be wrapped in `caffeinate -i -s`; idle sleep suspends the
  browser's network and surfaces as "no maker responded" or a bare `fetch failed`.
- A `vercel deploy` from inside this repo picks up the ROOT `vercel.json` unless `--local-config`
  is passed explicitly (this shipped the demo with the desk's CSP once).
- `git push` to `main`, `git commit-tree` onto `main`, and `vercel --prod` are blocked for Claude
  by the auto-mode classifier; the owner runs them.
