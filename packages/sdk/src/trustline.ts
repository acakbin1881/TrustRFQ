// Trustline pre-flight for a receiving account. Chain operations only: the
// wallet is injected as a one-method signer, so this module never touches UI
// state and can never request more than a transaction signature.

import * as Stellar from '@stellar/stellar-sdk';
import { assetFor } from './assets';

/** The one signing method a taker-side flow may request. */
export interface TransactionSigner {
  address: string;
  signTransaction(
    xdr: string,
    opts: { address: string; networkPassphrase: string },
  ): Promise<{ signedTxXdr: string }>;
}

/**
 * Make sure `signer` can receive `tokenStr`: a no-op for the native asset or
 * an existing trustline, otherwise one signed `changeTrust` submitted to Horizon.
 */
export async function ensureTrustline(
  c: { horizonUrl: string; passphrase: string },
  tokenStr: string,
  signer: TransactionSigner,
): Promise<void> {
  const { asset, native } = assetFor(tokenStr);
  if (native) return;
  const horizon = new Stellar.Horizon.Server(c.horizonUrl);
  const acct = await horizon.loadAccount(signer.address);
  if (acct.balances.some((b) => 'asset_code' in b && b.asset_code === asset.code && b.asset_issuer === asset.issuer)) return;
  const tx = new Stellar.TransactionBuilder(acct, { fee: Stellar.BASE_FEE, networkPassphrase: c.passphrase })
    .addOperation(Stellar.Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();
  const { signedTxXdr } = await signer.signTransaction(tx.toXDR(), {
    address: signer.address,
    networkPassphrase: c.passphrase,
  });
  await horizon.submitTransaction(Stellar.TransactionBuilder.fromXDR(signedTxXdr, c.passphrase) as Stellar.Transaction);
}
