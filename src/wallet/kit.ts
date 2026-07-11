// Stellar Wallets Kit singleton + message signing.
// The kit instance doubles as the WalletSigner for src/core/fill.ts (it
// structurally satisfies the interface: signTransaction + signAuthEntry).

import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit';

export { FREIGHTER_ID };

export const WALLET_ID_KEY = 'otc_wallet_id';
export const ADDRESS_KEY = 'otc_address';

export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: localStorage.getItem(WALLET_ID_KEY) || FREIGHTER_ID,
  modules: allowAllModules(),
});

// sign a UTF-8 message with the connected wallet. signMessage support is
// wallet-dependent in Stellar Wallets Kit, and the return shape varies by
// version, so feature-detect and normalise to a string.
export async function walletSign(message: string, address: string): Promise<string> {
  const k = kit as StellarWalletsKit & {
    signMessage?: (m: string, o: { address: string }) => Promise<unknown>;
  };
  if (typeof k.signMessage !== 'function') {
    throw new Error('This wallet does not support message signing.');
  }
  const res = await k.signMessage(message, { address });
  const r = res as { signedMessage?: unknown; signature?: unknown } | string | Uint8Array;
  let sig: unknown =
    (r as { signedMessage?: unknown })?.signedMessage ??
    (r as { signature?: unknown })?.signature ??
    r;
  if (sig && typeof sig !== 'string') {
    // Buffer / Uint8Array -> base64
    const bytes = sig instanceof Uint8Array
      ? sig
      : new Uint8Array(((sig as { data?: ArrayLike<number> }).data ?? sig) as ArrayLike<number>);
    sig = btoa(String.fromCharCode(...bytes));
  }
  if (!sig || typeof sig !== 'string') throw new Error('Wallet returned no signature.');
  return sig;
}
