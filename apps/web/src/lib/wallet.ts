import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit";
import { defaultModules } from "@creit.tech/stellar-wallets-kit/modules/utils";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

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

export async function hasAssetTrustline({
  address,
  assetCode,
  issuer,
}: {
  address: string;
  assetCode: string;
  issuer: string;
}): Promise<boolean> {
  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(address);

  return account.balances.some(
    (balance) =>
      (balance.asset_type === "credit_alphanum4" ||
        balance.asset_type === "credit_alphanum12") &&
      balance.asset_code === assetCode &&
      balance.asset_issuer === issuer
  );
}

export async function addAssetTrustline({
  address,
  assetCode,
  issuer,
}: {
  address: string;
  assetCode: string;
  issuer: string;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Trustlines can only be added in the browser.");
  }

  if (await hasAssetTrustline({ address, assetCode, issuer })) {
    return "already-exists";
  }

  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(address);
  const asset = new Asset(assetCode, issuer);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();

  const signedXdr = await signTransaction({
    unsignedTransaction: transaction.toXDR(),
    address,
  });

  const signedTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    Networks.TESTNET
  );
  const result = await server.submitTransaction(signedTransaction);

  return result.hash;
}

export function isValidStellarPublicKey(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

export async function sendNativePayment({
  from,
  to,
  amount,
  memo,
}: {
  from: string;
  to: string;
  amount: number;
  memo?: string;
}): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Payments can only be sent in the browser.");
  }

  if (!isValidStellarPublicKey(from)) {
    throw new Error("Source wallet must be a valid Stellar testnet address.");
  }

  if (!isValidStellarPublicKey(to)) {
    throw new Error("Destination must be a valid Stellar testnet address.");
  }

  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(from);
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.payment({
      destination: to,
      asset: Asset.native(),
      amount: amount.toString(),
    })
  );

  if (memo) {
    const { Memo } = await import("@stellar/stellar-sdk");
    builder = builder.addMemo(Memo.text(memo.slice(0, 28)));
  }

  const transaction = builder.setTimeout(180).build();
  const signedXdr = await signTransaction({
    unsignedTransaction: transaction.toXDR(),
    address: from,
  });
  const signedTransaction = TransactionBuilder.fromXDR(
    signedXdr,
    Networks.TESTNET
  );
  const result = await server.submitTransaction(signedTransaction);

  return result.hash;
}

export async function verifyNativePayment({
  txHash,
  from,
  to,
  amount,
}: {
  txHash: string;
  from: string;
  to: string;
  amount: number;
}): Promise<boolean> {
  const horizonUrl =
    process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
  const server = new Horizon.Server(horizonUrl);
  const operations = await server.operations().forTransaction(txHash).call();

  return operations.records.some((operation) => {
    const payment = operation as unknown as {
      type?: string;
      from?: string;
      to?: string;
      asset_type?: string;
      amount?: string;
    };

    return (
      payment.type === "payment" &&
      payment.from === from &&
      payment.to === to &&
      payment.asset_type === "native" &&
      Number(payment.amount) === amount
    );
  });
}
