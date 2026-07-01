// ---------------------------------------------------------------------------
// On-chain (Soroban / Stellar Testnet) configuration
// ---------------------------------------------------------------------------
// Loaded by otc.html alongside supabase-config.js. Used by the settlement flow
// (approve + fill). The token SAC contract ids are DERIVED in-app from the asset
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
