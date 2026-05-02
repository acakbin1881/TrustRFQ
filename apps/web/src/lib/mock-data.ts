export type AssetCode = "XLM" | "USDC" | "EURC";
export type RfqStatus = "open" | "closed" | "expired" | "cancelled";
export type QuoteStatus = "pending" | "accepted" | "rejected";
export type DealStatus = "pending_deposits" | "settled" | "refunded";

export interface Rfq {
  id: string;
  creatorAddress: string;
  sellAsset: AssetCode;
  sellAmount: number;
  buyAsset: AssetCode;
  // minimum receive amount — hard floor; quotes below this are invalid
  buyAmount: number;
  status: RfqStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  rfqId: string;
  makerAddress: string;
  quoteAmount: number;
  status: QuoteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  rfqId: string;
  quoteId: string;
  takerAddress: string;
  makerAddress: string;
  sellAsset: AssetCode;
  sellAmount: number;
  buyAsset: AssetCode;
  buyAmount: number;
  status: DealStatus;
  takerDeposited: boolean;
  makerDeposited: boolean;
  expiresAt: string;
  createdAt: string;
  settledAt?: string;
}

// Mock current user. Set to rfq-1's creator so the demo shows both views:
//   rfq-1 → creator view (can see quotes and accept)
//   rfq-2, rfq-3 → maker view (can submit quote, cannot see competing quotes)
export const CURRENT_USER_ADDRESS = "GAXHX7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX";

const now = Date.now();
const h = (n: number) => new Date(now + n * 3_600_000).toISOString();

// OTC-size examples. Minimum receive amount is a hard floor.
export const MOCK_RFQS: Rfq[] = [
  {
    id: "rfq-1",
    creatorAddress: "GAXHX7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX",
    sellAsset: "XLM",
    sellAmount: 250_000,
    buyAsset: "USDC",
    buyAmount: 50_000, // minimum receive amount
    status: "open",
    expiresAt: h(24),
    createdAt: h(-2),
  },
  {
    id: "rfq-2",
    creatorAddress: "GBXKF7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2AB",
    sellAsset: "USDC",
    sellAmount: 100_000,
    buyAsset: "XLM",
    buyAmount: 480_000, // minimum receive amount
    status: "open",
    expiresAt: h(48),
    createdAt: h(-1),
  },
  {
    id: "rfq-3",
    creatorAddress: "GCXKF7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CD",
    sellAsset: "EURC",
    sellAmount: 75_000,
    buyAsset: "USDC",
    buyAmount: 74_500, // minimum receive amount
    status: "closed",
    expiresAt: h(-6),
    createdAt: h(-48),
  },
];

// Quotes for rfq-1: quote-1 is valid, quote-2 is intentionally below minimum.
export const MOCK_QUOTES: Record<string, Quote[]> = {
  "rfq-1": [
    {
      id: "quote-1",
      rfqId: "rfq-1",
      makerAddress: "GBYYY7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2EF",
      quoteAmount: 51_200, // valid — above 50,000 minimum
      status: "pending",
      expiresAt: h(12),
      createdAt: h(-1),
    },
    {
      id: "quote-2",
      rfqId: "rfq-1",
      makerAddress: "GCZZZ7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2GH",
      quoteAmount: 48_500, // BELOW MINIMUM — cannot be accepted
      status: "pending",
      expiresAt: h(8),
      createdAt: h(-0.5),
    },
  ],
  "rfq-2": [
    {
      id: "quote-3",
      rfqId: "rfq-2",
      makerAddress: "GDAAA7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
      quoteAmount: 483_000, // valid — above 480,000 minimum
      status: "pending",
      expiresAt: h(24),
      createdAt: h(-0.25),
    },
  ],
  "rfq-3": [],
};

// When a quote is accepted on an RFQ, navigate to this pre-built deal ID
export const DEAL_ID_FOR_RFQ: Record<string, string> = {
  "rfq-1": "deal-rfq1",
  "rfq-2": "deal-rfq2",
};

export const MOCK_DEALS: Record<string, Deal> = {
  "deal-1": {
    id: "deal-1",
    rfqId: "rfq-3",
    quoteId: "quote-x",
    takerAddress: "GCXKF7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CD",
    makerAddress: "GDAAA7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
    sellAsset: "EURC",
    sellAmount: 75_000,
    buyAsset: "USDC",
    buyAmount: 74_800,
    status: "pending_deposits",
    takerDeposited: true,
    makerDeposited: false,
    expiresAt: h(18),
    createdAt: h(-6),
  },
  "deal-rfq1": {
    id: "deal-rfq1",
    rfqId: "rfq-1",
    quoteId: "quote-1",
    takerAddress: "GAXHX7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX",
    makerAddress: "GBYYY7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2EF",
    sellAsset: "XLM",
    sellAmount: 250_000,
    buyAsset: "USDC",
    buyAmount: 51_200,
    status: "pending_deposits",
    takerDeposited: false,
    makerDeposited: false,
    expiresAt: h(24),
    createdAt: h(0),
  },
  "deal-rfq2": {
    id: "deal-rfq2",
    rfqId: "rfq-2",
    quoteId: "quote-3",
    takerAddress: "GBXKF7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2AB",
    makerAddress: "GDAAA7UVMRX6NVPJQ5FZGDVNBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
    sellAsset: "USDC",
    sellAmount: 100_000,
    buyAsset: "XLM",
    buyAmount: 483_000,
    status: "pending_deposits",
    takerDeposited: false,
    makerDeposited: false,
    expiresAt: h(48),
    createdAt: h(0),
  },
};

export function fmt(date: string) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isExpired(date: string) {
  return new Date(date) < new Date();
}

export const STATUS_LABEL: Record<RfqStatus, string> = {
  open: "Open",
  closed: "Closed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const STATUS_COLOR: Record<RfqStatus, string> = {
  open: "bg-green-900 text-green-300",
  closed: "bg-slate-700 text-slate-300",
  expired: "bg-red-900 text-red-300",
  cancelled: "bg-red-900 text-red-300",
};
