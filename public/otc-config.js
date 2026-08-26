// ---------------------------------------------------------------------------
// On-chain (Soroban / Stellar Testnet) configuration
// ---------------------------------------------------------------------------
// Loaded by otc.html alongside supabase-config.js. Used by the settlement flow
// (signed fill). The token SAC contract ids are DERIVED in-app from the asset
// + network passphrase, so only the OTC contract id needs to be set here.
//
// After deploying the contract:
//   stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/otc_swap.wasm \
//     --source-account <key> --network testnet
// paste the returned C... id into OTC_CONTRACT_ID below.
// ---------------------------------------------------------------------------

window.RPC_URL = 'https://soroban-testnet.stellar.org';
window.HORIZON_URL = 'https://horizon-testnet.stellar.org';
window.NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

// <-- fill after `stellar contract deploy` (starts with 'C'); empty = settlement disabled
window.OTC_CONTRACT_ID = 'CCAPYEWHYSGORPUOC7FBSIRBIWSJJSPJOIWPJNEZLGDXUWJVWV7MTKBJ';

// Reflector price oracle (SEP-40), testnet "External CEXs & DEXs" feed. Read
// via read-only RPC simulation to suggest a reference fair price on the compose
// ticket. Never signed, never on the settlement path. Empty = the suggestion
// silently turns off. Update on a Testnet reset, same as OTC_CONTRACT_ID.
window.REFLECTOR_ORACLE_ID = 'CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63';

// RFQ settlement contract (rfq_swap). Deployed 2026-08-18; the desk does not
// call it yet, the id lives here so there is one place to look for it and so it
// joins the Testnet-reset checklist alongside the two ids above.
//   cd contracts && stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/rfq_swap.wasm \
//     --source-account <key> --network testnet \
//     -- --admin <G...> --fee-bps 10 --fee-collector <G...>
window.RFQ_SWAP_CONTRACT_ID = 'CCNP7626WIJVWVTBPLPG6QM77TY6JBU42D4PYONUFTDEPIIW6ZFJQIDT';

// RFQ maker/discovery registry (rfq_registry). Deployed and initialized
// 2026-08-26; no UI reads it yet (the desk's taker path is Phase 2). Joins
// the Testnet-reset checklist alongside the three ids above.
//
// IMPORTANT: this contract has no constructor, so a reset is a TWO-STEP
// deploy -- `initialize` must be invoked separately after `deploy`, or the
// instance is unusable (the re-init guard then permanently blocks recovery):
//   cd contracts && stellar contract build
//   stellar contract deploy --wasm target/wasm32v1-none/release/rfq_registry.wasm \
//     --source-account deployer --network testnet
//   stellar contract invoke --id <NEW ID> --source-account deployer --network testnet -- \
//     initialize --admin GB3WSGXR5GBMJ7HSBWTBWSWGI3A5AJGD4Y254XBI2P6AKS5N2VIXV7HI \
//     --stake-token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC \
//     --base-cost 1000000000 --per-token-cost 100000000 --max-makers-per-token 100
//
// CR-01 (code review, 2026-08-26 fix): `initialize` now calls
// `admin.require_auth()`, so the two-step gap above is no longer a "whoever
// calls first becomes admin" race -- but it is still a race an attacker
// could try to WIN by naming and signing for THEMSELVES between `deploy` and
// your own `initialize` call (the re-init guard would then make that
// permanent). Before pasting a freshly deployed id into this file:
//   stellar contract invoke --id <NEW ID> --source-account deployer --network testnet -- \
//     get_config
// and confirm `admin` reads back as the intended deployer address BEFORE
// publishing the id here. If it doesn't match, the instance is compromised
// and unrecoverable (no `upgrade` entry point by design) -- redeploy fresh.
window.RFQ_REGISTRY_ID = 'CBA43RFMQBPBHVQENUZK5OMTE2MRC3BLHFKA7FWXUHNIQ2GSORUNIU5G';
