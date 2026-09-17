// The desk's binding of the RFQ SDK to its runtime configuration and its
// token allow-list. UI code imports from here, never from the SDK directly,
// so the config is resolved in exactly one place.

import { Address } from '@stellar/stellar-sdk';
import {
  discoverMakerUrls as sdkDiscoverMakerUrls,
  fanOutMakerSideOrder as sdkFanOutMakerSideOrder,
  settleQuote as sdkSettleQuote,
  simulateRead,
  type FanOutOutcome,
  type GetMakerSideOrderParams,
  type RfqClientConfig,
  type RfqOrder,
  type SettleResult,
  type TransactionSigner,
} from '@trustrfq/sdk';
import { HORIZON_URL, PASSPHRASE, RFQ_REGISTRY_ID, RFQ_SWAP_CONTRACT_ID, RPC_URL } from '../config';
import { TOKENS } from '../core/tokens';

export const rfqClient: RfqClientConfig = {
  rpcUrl: RPC_URL,
  horizonUrl: HORIZON_URL,
  passphrase: PASSPHRASE,
  registryId: RFQ_REGISTRY_ID,
  swapContractId: RFQ_SWAP_CONTRACT_ID,
  allowedTokens: TOKENS.map((t) => t.value),
};

export const discoverMakerUrls = (makerTokenSac: string, takerTokenSac: string): Promise<string[]> =>
  sdkDiscoverMakerUrls(rfqClient, makerTokenSac, takerTokenSac);

export const fanOutMakerSideOrder = (urls: string[], params: GetMakerSideOrderParams): Promise<FanOutOutcome> =>
  sdkFanOutMakerSideOrder(rfqClient, urls, params);

/** The registry's `get_maker` read for one maker address. */
export const readMakerConfig = async (makerAddress: string): Promise<{ url: string }> =>
  (await simulateRead(rfqClient, RFQ_REGISTRY_ID, 'get_maker', [new Address(makerAddress).toScVal()])) as { url: string };

export const settleQuote = (order: RfqOrder, authEntryBase64: string, signer: TransactionSigner): Promise<SettleResult> =>
  sdkSettleQuote(rfqClient, order, authEntryBase64, signer);
