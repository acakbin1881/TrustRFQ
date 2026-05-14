"use client";

import { useInitializeEscrow, useSendTransaction } from "@trustless-work/escrow/hooks";
import type {
  InitializeSingleReleaseEscrowPayload,
  InitializeSingleReleaseEscrowResponse,
  SendTransactionResponse,
} from "@trustless-work/escrow/types";
import type { AssetCode, Deal } from "./mock-data";
import { recordEscrowEvent, updateDealEscrow } from "./rfq-repository";
import { signTransaction } from "./wallet";

type TrustlessWorkSendResponse = SendTransactionResponse & {
  txHash?: string;
  hash?: string;
  transactionHash?: string;
};

export interface InitializeTrustlessEscrowResult {
  contractId: string;
  engagementId: string;
  txHash?: string;
}

function extractTxHash(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;

  const value = response as TrustlessWorkSendResponse;
  return value.txHash ?? value.hash ?? value.transactionHash;
}

function getTrustlineAddress(asset: AssetCode): string {
  if (asset === "XLM") {
    const nativeTrustline =
      process.env.NEXT_PUBLIC_XLM_SAC_ADDRESS ??
      process.env.NEXT_PUBLIC_XLM_TRUSTLINE_ADDRESS;
    if (nativeTrustline) return nativeTrustline;

    throw new Error(
      "NEXT_PUBLIC_XLM_SAC_ADDRESS is required before initializing an XLM escrow."
    );
  }

  const envName = `NEXT_PUBLIC_${asset}_ISSUER_ADDRESS`;
  const issuer = process.env[envName];

  if (!issuer) {
    throw new Error(`${envName} is required before initializing a ${asset} escrow.`);
  }

  return issuer;
}

function getPlatformAddress(): string {
  const platformAddress = process.env.NEXT_PUBLIC_ROLE_ADDRESS;
  if (!platformAddress) {
    throw new Error("NEXT_PUBLIC_ROLE_ADDRESS is required before initializing escrow.");
  }
  return platformAddress;
}

function getPlatformFee(): number {
  const fee = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE ?? "0");
  if (Number.isNaN(fee) || fee < 0) {
    throw new Error("NEXT_PUBLIC_PLATFORM_FEE must be a non-negative number.");
  }
  return fee;
}

function buildSingleReleaseEscrowPayload(deal: Deal, signer: string): InitializeSingleReleaseEscrowPayload {
  const engagementId = deal.engagementId ?? `trustrfq-${deal.id}-${Date.now()}`;
  const platformAddress = getPlatformAddress();
  const trustlineAddress = getTrustlineAddress(deal.sellAsset);

  return {
    signer,
    engagementId,
    title: `TrustRFQ ${deal.rfqId}`,
    description: `Accepted quote ${deal.quoteId}: ${deal.sellAmount} ${deal.sellAsset} for ${deal.buyAmount} ${deal.buyAsset}.`,
    amount: deal.sellAmount,
    platformFee: getPlatformFee(),
    trustline: {
      address: trustlineAddress,
      symbol: deal.sellAsset,
    },
    roles: {
      approver: deal.takerAddress,
      serviceProvider: deal.makerAddress,
      platformAddress,
      releaseSigner: deal.takerAddress,
      disputeResolver: platformAddress,
      receiver: deal.makerAddress,
    },
    milestones: [
      {
        description: "Seller completed the agreed off-chain settlement.",
      },
    ],
  };
}

export function useTrustlessWorkEscrow() {
  const { deployEscrow } = useInitializeEscrow();
  const { sendTransaction } = useSendTransaction();

  async function initializeEscrow(deal: Deal, signer: string): Promise<InitializeTrustlessEscrowResult> {
    await updateDealEscrow(deal.id, { escrowStatus: "initializing" });

    const payload = buildSingleReleaseEscrowPayload(deal, signer);
    const deployResult = (await deployEscrow(
      payload,
      "single-release"
    )) as InitializeSingleReleaseEscrowResponse;

    if (!deployResult.unsignedTransaction) {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { error: "Unsigned transaction missing from deployEscrow response." },
      });
      throw new Error("Unsigned transaction missing from deployEscrow response.");
    }

    const signedXdr = await signTransaction({
      unsignedTransaction: deployResult.unsignedTransaction,
      address: signer,
    });

    const sendResult = await sendTransaction(signedXdr);

    if (sendResult.status !== "SUCCESS") {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { payload, deployResult, sendResult },
      });
      throw new Error(sendResult.message || "Trustless Work transaction failed.");
    }

    const txHash = extractTxHash(sendResult);
    const contractId = deployResult.contractId;

    if (!contractId) {
      await updateDealEscrow(deal.id, {
        escrowStatus: "failed",
        twPayload: { payload, deployResult, sendResult },
      });
      throw new Error("Contract ID missing from deployEscrow response.");
    }

    const nextHashes = {
      ...deal.transactionHashes,
      ...(txHash ? { initialize: txHash } : {}),
    };

    await updateDealEscrow(deal.id, {
      contractId,
      engagementId: payload.engagementId,
      escrowStatus: "initialized",
      milestoneStatus: "pending",
      trustlineAddress: payload.trustline.address,
      transactionHashes: nextHashes,
      twPayload: { payload, deployResult, sendResult },
    });

    await recordEscrowEvent({
      deal_id: deal.id,
      event_type: "escrow_initialized",
      actor_address: signer,
      tx_hash: txHash,
      metadata: {
        contractId,
        engagementId: payload.engagementId,
        asset: deal.sellAsset,
        amount: deal.sellAmount,
      },
    });

    return {
      contractId,
      engagementId: payload.engagementId,
      txHash,
    };
  }

  return {
    initializeEscrow,
  };
}
