# TrustRFQ — peer-to-peer OTC on Stellar

A peer-to-peer OTC layer for Stellar (XLM/USDC), modeled on the Swap/AirSwap peer protocol:
parties negotiate **off-chain** and settle **on-chain**. Both halves are implemented: the
off-chain RFQ (create / sign / deliver / accept a directed order) and on-chain **atomic
settlement** via a Soroban contract using AirSwap-style **off-chain-signed authorizations** + a
permissionless `fill` (no separate on-chain `approve` step).

## Pages

| File | What it is |
|------|------------|
| `hero.html` | Landing page — electric-indigo glassmorphism, hand-written, never bundled. Links to the desk and the intent board. |
| `otc.html` | The desk shell — wallet gate, RFQ ticket, incoming/sent inboxes, settlement UI (markup only; styles in `styles.css`). |
| `otc.js` | The app logic (ES module) — externalized from `otc.html` so the CSP needs no `'unsafe-inline'` for scripts. |
| `styles.css` | The **desk's** design system (`otc.html` / `intent.html`). The landing does not load it. |
| `hero.css` | The **landing's** design system — self-contained, `.lp-`-prefixed, no overlap with `styles.css`. |
| `hero.js` | Landing-only: scroll reveal + pointer parallax (self-hosted; honors `prefers-reduced-motion`, and fails *visible* — if it never runs, nothing is hidden). |
| `favicon.svg` | The TrustRFQ swap-mark. |
| `supabase-config.js` | Sets `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY`. |
| `otc-config.js` | Sets `RPC_URL` / `NETWORK_PASSPHRASE` / `OTC_CONTRACT_ID` for settlement. |
| `contracts/otc_swap/` | Soroban contract (`fill`) that settles an accepted order atomically. |
| `vercel.json` | `cleanUrls` + rewrites `/` → `/hero` + HTTP security headers (CSP, HSTS, X-Frame-Options). |

## How it works

- **No sign-in.** Connecting a Stellar wallet (via [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit))
  is the only gate — the connected address *is* your identity.
- **Maker** fills an order — what they send, what they want back, an expiry, and the
  **taker's wallet address** — then **signs the order with their wallet** and sends it.
- The order is stored in Supabase and **routed by `taker_address`**. The **taker** (whoever
  connects that wallet) sees it live in **Incoming** and either **Accept** (signs) or
  **Decline**. Accept just flips the status off-chain; settlement is the next phase.
- Because routing is by address, the two parties connect **separately** — no link to share.

### Order fields

`maker_address`, `maker_amount`, `maker_token`, `taker_address`, `taker_amount`,
`taker_token`, `expiration` (absolute), `nonce` (unique per maker). The maker's wallet
`signature` over the canonical payload and the exact `signed_payload` are stored alongside;
`taker_signature` is captured on accept/decline.

### Trust model

There is no server-side auth, so RLS **cannot** prove a request comes from a wallet's owner.
Integrity instead comes from **wallet signatures** on the order and on the accept/decline
action. Order rows are readable with the anon key (not secret) — acceptable for a testnet
off-chain MVP. A future Sign-In-With-Stellar flow (sign a nonce → Edge Function mints a JWT)
would enable true per-wallet RLS and private reads.

## Setup

### 1. Supabase schema

In your Supabase project → **SQL Editor**, run:

```sql
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  maker_address text not null,
  maker_amount numeric not null,
  maker_token text not null,
  taker_address text not null,
  taker_amount numeric not null,
  taker_token text not null,
  expiration timestamptz not null,
  nonce text not null,
  signature text not null,         -- maker signature over signed_payload
  signed_payload text not null,    -- exact canonical message the maker signed
  taker_signature text,            -- taker signature over the accept/decline action
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (maker_address, nonce)
);
create index on public.orders (taker_address);
create index on public.orders (maker_address);

alter table public.orders enable row level security;

-- anon (no auth): explicit, permissive; integrity is enforced by signatures, not RLS
create policy orders_anon_select on public.orders for select to anon using (true);
create policy orders_anon_insert on public.orders for insert to anon with check (status = 'pending');
create policy orders_anon_update on public.orders for update to anon using (true) with check (true);

-- stream new offers + status changes to clients
alter publication supabase_realtime add table public.orders;
```

### 2. Config

Put your project URL and **anon** key in `supabase-config.js` (anon key is browser-safe).

### 3. Run locally

Any static server works (the app is plain HTML + ES-module CDN imports, no build step):

```bash
npx serve .
# or
vercel dev
```

Open the served URL → **OTC** → **Connect wallet**.

### 4. Security headers (production)

`vercel.json` ships a `headers` block: a strict **Content-Security-Policy** (the primary defense
against a script injected via the CDN/DNS rewriting a transaction before the wallet prompts), plus
HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, and `Referrer-Policy`. The CSP is an
**allow-list** — if you add a new external origin the app talks to (RPC/Horizon/Supabase →
`connect-src`; fonts → `style-src`/`font-src`; a wallet module beyond Freighter → its relay in
`connect-src`), add it there or the browser silently blocks it. Verify with
zero CSP violations in the browser console, and optionally via [Mozilla
Observatory](https://observatory.mozilla.org). The app JS is kept in `otc.js` (not inlined) so the
CSP needs no `'unsafe-inline'` for scripts — don't move it back inline.

## End-to-end test

Use two Stellar wallets (two browsers / two extension accounts), e.g. Freighter on Testnet.

1. **Wallet A** → Connect (`G_A`).
2. **Wallet B** → in a separate browser → Connect (`G_B`).
3. **A** (Create order): set send/receive amounts + tokens, an expiry, counterparty `= G_B`
   → **Sign & send** → sign in the wallet → appears in A's **Sent** as `pending`.
4. **B** sees it appear **live** in **Incoming** → **Accept** (signs) → status `accepted`; A
   sees the flip live. Repeat with **Decline**.
5. An order created while B is disconnected shows up as soon as B connects `G_B`.
6. An order past its `expiration` shows as **expired** and can't be accepted.

## On-chain settlement (Phase 2)

Once an order is **accepted**, it settles atomically on Testnet via the Soroban contract in
`contracts/otc_swap/` (AirSwap-style signed `fill`). There is **no separate `approve` step**:
each party signs an **off-chain Soroban authorization entry** over the *exact* order terms
(counterparty, tokens, **amounts**, expiration, order id); a permissionless `fill` then carries
both signatures and moves the two legs in one transaction. Because the signatures pin every
term, the submitter (either party) cannot alter amounts, tokens or recipients.

### 1. Extend the schema

In Supabase → **SQL Editor**:

```sql
alter table public.orders
  add column settlement_status text not null default 'idle'
    check (settlement_status in ('idle','signing','ready','settling','settled','failed')),
  add column maker_auth text,   -- base64 XDR of the maker's signed SorobanAuthorizationEntry
  add column taker_auth text,   -- base64 XDR of the taker's signed SorobanAuthorizationEntry
  add column settle_tx_hash text,
  add column settle_error text,
  add column settled_at timestamptz;
```

#### Harden the anon policies (recommended)

The anon role can read and write every row, so integrity lives on-chain (in the signed auth
entries), not in the DB. Two cheap, defense-in-depth measures make the *off-chain* layer much
harder to abuse — run them once all columns above exist:

```sql
-- 1. Freeze the order TERMS after insert. The anon role may only advance workflow
--    columns; it can never rewrite addresses / tokens / expiration / nonce
--    (so a row can't be mutated between accept and sign). maker_amount and
--    taker_amount ARE grantable: the intent layer writes the accepted round's
--    amounts back onto the order row, and on-chain dual-auth over the exact
--    fill args remains the integrity boundary.
revoke update on public.orders from anon;
grant  update (status, taker_signature, updated_at,
               settlement_status, maker_auth, taker_auth,
               settle_tx_hash, settle_error, settled_at,
               maker_amount, taker_amount) on public.orders to anon;

-- 2. Reject markup / malformed values at the database (defense in depth behind the
--    client's HTML-escaping), and enforce positive amounts + address/token shape.
--    Clean up any pre-existing rows that violate these before adding the constraints.
alter table public.orders
  add constraint maker_amount_pos  check (maker_amount > 0),
  add constraint taker_amount_pos  check (taker_amount > 0),
  add constraint maker_addr_shape  check (maker_address ~ '^G[A-Z2-7]{55}$'),
  add constraint taker_addr_shape  check (taker_address ~ '^G[A-Z2-7]{55}$'),
  add constraint maker_token_shape check (maker_token ~ '^[A-Z0-9]{1,12}(:G[A-Z2-7]{55})?$'),
  add constraint taker_token_shape check (taker_token ~ '^[A-Z0-9]{1,12}(:G[A-Z2-7]{55})?$');
```

Note these are DB-side backstops; the client also (a) escapes every stored field before it
touches the DOM, and (b) refuses to Accept or Sign an order whose token isn't on its recognized
allow-list (a look-alike asset with an attacker-controlled issuer otherwise renders like the real
one). Keep both layers.

The exact grant above (including `maker_amount, taker_amount`) is what's live — the
reconciliation SQL that applied it, together with the intent-layer schema and realtime setup,
lives in `docs/migrations/2026-07-10-intent-layer.sql`.

### 2. Build, test & deploy the contract

Needs the [Stellar CLI](https://developers.stellar.org/docs/tools/cli) + the wasm target.

```bash
rustup target add wasm32v1-none           # soroban-sdk 26 requires wasm32v1-none, NOT wasm32-unknown-unknown
cd contracts/otc_swap
cargo test                 # 6 unit tests: swap, replay, expiry, zero-amount, scoped-auth, amount-tampering
stellar contract build
stellar keys generate deployer --network testnet --fund
stellar contract deploy \
  --wasm target/wasm32v1-none/release/otc_swap.wasm \
  --source deployer --network testnet
# (once) ensure the USDC asset has a SAC on testnet:
stellar contract asset deploy --asset USDC:<issuer> --source deployer --network testnet
```

Paste the deployed `C…` id into `OTC_CONTRACT_ID` in `otc-config.js`. The XLM/USDC SAC ids are
derived in-app from the asset + network passphrase.

> **wasm target:** soroban-sdk 26 rejects `wasm32-unknown-unknown` (it now needs `wasm32v1-none`,
> Rust 1.84+). `stellar contract build` selects it automatically.
> **Native `cargo test` on Windows** needs a working linker — MSVC Build Tools, or rustup's GNU
> toolchain (`cargo +stable-x86_64-pc-windows-gnu test`) invoked from an **ASCII-only** path
> (MinGW's `ld` chokes on non-ASCII paths like `…\Masaüstü\…`), with the temp copy's `Cargo.toml`
> set to `crate-type = ["rlib"]` (the real `cdylib` triggers a MinGW "export ordinal" error).

### 3. On-chain E2E

Both wallets funded via friendbot. Start with an **XLM↔XLM** order (native — no trustlines).
After **Accept**, the accepted order shows a settlement strip in each party's view:

1. **Maker** → *Sign order* (signs an off-chain authorization entry; receive trustline is
   auto-created for non-native legs).
2. **Taker** → *Sign order* (independently, from their own browser).
3. Either party → *Settle now* → one permissionless `fill` tx → balances move; the card flips to
   **Settled** with a link to the transaction on stellar.expert.

Replay is blocked on-chain (`Filled` guard + the Soroban auth-entry nonces); expired orders are
rejected. Each party's signature binds the **exact amounts**, so a tampered `fill` is rejected.

> **USDC (non-native) legs** require *both* parties' receive trustlines to exist *before* signing
> (the signing simulation runs the transfers). XLM↔XLM avoids this; broaden to USDC after the
> first native E2E works.

## Out of scope (later)

- Mainnet; fees/spread, partial fills, on-chain order registry.
- A relayer / fee-sponsorship so the filler needn't hold XLM for fees.
- Sign-In-With-Stellar session + per-wallet RLS / private reads.
