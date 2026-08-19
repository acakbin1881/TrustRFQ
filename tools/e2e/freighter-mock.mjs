// Fake Freighter for the click-census E2E (tools/e2e/driver.mjs).
//
// The production bundle never sees a "window.freighterApi": @stellar/freighter-api
// talks to the extension's content script over window.postMessage. This module
// impersonates that content script, so the UNMODIFIED production bundle runs
// headless with no extension installed.
//
// Two halves:
//   - initScriptFor(publicKey): a string injected via context.addInitScript.
//     Runs before any app code. Answers the silent status queries in-page and
//     forwards the four signing/consent calls to Node via the exposed binding
//     window.__e2eWallet (the page has no stellar-sdk, so it cannot sign).
//   - makeWalletHandler(...): the Node side of that binding. Holds the role's
//     Keypair, signs for real (real Testnet keys), and tallies every call that
//     opens a popup in real Freighter as one "wallet prompt".
//
// Counted as prompts: REQUEST_ACCESS + SUBMIT_TRANSACTION/SUBMIT_BLOB/
// SUBMIT_AUTH_ENTRY. Not counted: REQUEST_CONNECTION_STATUS, REQUEST_PUBLIC_KEY,
// REQUEST_ALLOWED_STATUS, REQUEST_NETWORK_DETAILS (silent in real Freighter).

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { TransactionBuilder } from '@stellar/stellar-sdk';

export const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export function initScriptFor(publicKey) {
  return `(() => {
    // window.freighter = true short-circuits freighter-api's isConnected(), so
    // the wallets-kit 500ms isAvailable() race can never make the modal render
    // Freighter as "not available".
    window.freighter = true;
    const PUB = ${JSON.stringify(publicKey)};
    const NET = {
      network: 'TESTNET', networkName: 'Test Net',
      networkUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: ${JSON.stringify(NETWORK_PASSPHRASE)},
      sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
    };
    window.addEventListener('message', (ev) => {
      const d = ev && ev.data;
      if (!d || d.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return;
      // NOTE: the response field really is "messagedId". freighter-api matches
      // responses on that misspelling of the request's messageId. Do not fix it.
      const reply = (payload) => window.postMessage(
        { source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE', messagedId: d.messageId, ...payload },
        window.location.origin,
      );
      switch (d.type) {
        case 'REQUEST_CONNECTION_STATUS': return reply({ isConnected: true });
        case 'REQUEST_ALLOWED_STATUS':
        case 'SET_ALLOWED_STATUS': return reply({ isAllowed: true });
        case 'REQUEST_PUBLIC_KEY': return reply({ publicKey: PUB });
        case 'REQUEST_NETWORK_DETAILS': return reply({ networkDetails: NET });
        case 'REQUEST_ACCESS':
        case 'SUBMIT_TRANSACTION':
        case 'SUBMIT_BLOB':
        case 'SUBMIT_AUTH_ENTRY':
          window.__e2eWallet({
            type: d.type,
            transactionXdr: d.transactionXdr,
            blob: d.blob,
            entryXdr: d.entryXdr,
          }).then(reply, (e) => reply({
            apiError: { code: -1, message: String((e && e.message) || e) },
          }));
          return;
        default: return; // types the app never sends
      }
    }, false);
  })();`;
}

export function makeWalletHandler({ keypair, tally, stepRef }) {
  const pub = keypair.publicKey();
  return async (msg) => {
    const label = stepRef.current ?? msg.type;
    switch (msg.type) {
      case 'REQUEST_ACCESS':
        // The "connect and share your address?" popup.
        tally.record('wallet-prompt', label, { promptType: 'REQUEST_ACCESS' });
        return { publicKey: pub };

      case 'SUBMIT_TRANSACTION': {
        // Envelope signing: the changeTrust tx (trustline branch) and the final
        // fill tx both arrive here.
        tally.record('wallet-prompt', label, { promptType: 'SUBMIT_TRANSACTION' });
        const tx = TransactionBuilder.fromXDR(msg.transactionXdr, NETWORK_PASSPHRASE);
        tx.sign(keypair);
        return { signedTransaction: tx.toXDR(), signerAddress: pub };
      }

      case 'SUBMIT_BLOB': {
        // signMessage: the RFQ/accept signatures. Nothing in the app verifies
        // these (stored-but-unverified by design), so the exact byte convention
        // is not load-bearing; sign the utf-8 bytes of the message.
        tally.record('wallet-prompt', label, { promptType: 'SUBMIT_BLOB' });
        const sig = keypair.sign(Buffer.from(String(msg.blob), 'utf8'));
        return { signedBlob: sig.toString('base64'), signerAddress: pub };
      }

      case 'SUBMIT_AUTH_ENTRY': {
        // Freighter signs sha256(preimageXdr) and resolves with the 64 raw
        // signature bytes as a base64 STRING. Returning the same string makes
        // the wallets-kit 1.9.5 module re-encode it (its unguarded
        // Buffer.from(str).toString('base64') bug), which exercises the exact
        // production unwrap path in src/wallet/authSignature.ts.
        tally.record('wallet-prompt', label, { promptType: 'SUBMIT_AUTH_ENTRY' });
        const payload = createHash('sha256').update(Buffer.from(msg.entryXdr, 'base64')).digest();
        const sig = keypair.sign(payload);
        return { signedAuthEntry: Buffer.from(sig).toString('base64'), signerAddress: pub };
      }

      default:
        throw new Error(`unexpected wallet call: ${msg.type}`);
    }
  };
}
