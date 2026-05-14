import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import { Networks } from "@stellar/stellar-sdk";

let initialized = false;

export function initializeWalletKit() {
  if (typeof window === "undefined" || initialized) return;

  StellarWalletsKit.init({
    modules: defaultModules(),
    network: Networks.TESTNET,
  });

  initialized = true;
}

export async function connectWallet(): Promise<string> {
  initializeWalletKit();

  await StellarWalletsKit.authModal();
  const { address } = await StellarWalletsKit.getAddress();

  if (!address) {
    throw new Error("Wallet address is missing after connection.");
  }

  return address;
}

export async function getConnectedWalletAddress(): Promise<string> {
  initializeWalletKit();

  const { address } = await StellarWalletsKit.getAddress();

  if (!address) {
    throw new Error("Wallet is not connected.");
  }

  return address;
}

export async function signTransaction({
  unsignedTransaction,
  address,
}: {
  unsignedTransaction: string;
  address: string;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Transactions can only be signed in the browser.");
  }

  initializeWalletKit();

  const { signedTxXdr } = await StellarWalletsKit.signTransaction(
    unsignedTransaction,
    {
      address,
      networkPassphrase: Networks.TESTNET,
    }
  );

  if (!signedTxXdr) {
    throw new Error("Wallet did not return a signed transaction.");
  }

  return signedTxXdr;
}
