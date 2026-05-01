export type AssetCode = "XLM" | "USDC" | "AQUA";
export type RfqStatus = "open" | "closed" | "expired" | "cancelled";
export type QuoteStatus = "pending" | "accepted" | "rejected";
export type DealStatus = "pending_deposits" | "settled" | "refunded";

export interface Rfq {
  id: string;
  creatorAddress: string;
  sellAsset: AssetCode;
  sellAmount: number;
  buyAsset: AssetCode;
  buyAmount: number;
  status: RfqStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  rfqId: string;
  takerAddress: string;
  quoteAmount: number;
  status: QuoteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  rfqId: string;
  quoteId: string;
  makerAddress: string;
  takerAddress: string;
  sellAsset: AssetCode;
  sellAmount: number;
  buyAsset: AssetCode;
  buyAmount: number;
  status: DealStatus;
  makerDeposited: boolean;
  takerDeposited: boolean;
  expiresAt: string;
  createdAt: string;
  settledAt?: string;
}

const now = Date.now();
const h = (n: number) => new Date(now + n * 3_600_000).toISOString();

export const MOCK_RFQS: Rfq[] = [
  {
    id: "rfq-1",
    creatorAddress: "GAXHX7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX",
    sellAsset: "XLM",
    sellAmount: 1000,
    buyAsset: "USDC",
    buyAmount: 200,
    status: "open",
    expiresAt: h(24),
    createdAt: h(-2),
  },
  {
    id: "rfq-2",
    creatorAddress: "GBXKF7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2AB",
    sellAsset: "USDC",
    sellAmount: 500,
    buyAsset: "XLM",
    buyAmount: 2500,
    status: "open",
    expiresAt: h(48),
    createdAt: h(-1),
  },
  {
    id: "rfq-3",
    creatorAddress: "GCXKF7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2CD",
    sellAsset: "XLM",
    sellAmount: 5000,
    buyAsset: "USDC",
    buyAmount: 950,
    status: "closed",
    expiresAt: h(-6),
    createdAt: h(-48),
  },
];

export const MOCK_QUOTES: Record<string, Quote[]> = {
  "rfq-1": [
    {
      id: "quote-1",
      rfqId: "rfq-1",
      takerAddress: "GBYYY7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2EF",
      quoteAmount: 195,
      status: "pending",
      expiresAt: h(12),
      createdAt: h(-1),
    },
    {
      id: "quote-2",
      rfqId: "rfq-1",
      takerAddress: "GCZZZ7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2GH",
      quoteAmount: 198,
      status: "pending",
      expiresAt: h(8),
      createdAt: h(-0.5),
    },
  ],
  "rfq-2": [
    {
      id: "quote-3",
      rfqId: "rfq-2",
      takerAddress: "GDAAA7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
      quoteAmount: 2450,
      status: "pending",
      expiresAt: h(24),
      createdAt: h(-0.25),
    },
  ],
  "rfq-3": [],
};

// When a quote is accepted on an RFQ, navigate to this deal ID
export const DEAL_ID_FOR_RFQ: Record<string, string> = {
  "rfq-1": "deal-rfq1",
  "rfq-2": "deal-rfq2",
};

export const MOCK_DEALS: Record<string, Deal> = {
  "deal-1": {
    id: "deal-1",
    rfqId: "rfq-3",
    quoteId: "quote-x",
    makerAddress: "GCXKF7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2CD",
    takerAddress: "GDAAA7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
    sellAsset: "XLM",
    sellAmount: 5000,
    buyAsset: "USDC",
    buyAmount: 950,
    status: "pending_deposits",
    makerDeposited: true,
    takerDeposited: false,
    expiresAt: h(18),
    createdAt: h(-6),
  },
  "deal-rfq1": {
    id: "deal-rfq1",
    rfqId: "rfq-1",
    quoteId: "quote-1",
    makerAddress: "GAXHX7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2CX",
    takerAddress: "GBYYY7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2EF",
    sellAsset: "XLM",
    sellAmount: 1000,
    buyAsset: "USDC",
    buyAmount: 195,
    status: "pending_deposits",
    makerDeposited: false,
    takerDeposited: false,
    expiresAt: h(24),
    createdAt: h(0),
  },
  "deal-rfq2": {
    id: "deal-rfq2",
    rfqId: "rfq-2",
    quoteId: "quote-3",
    makerAddress: "GBXKF7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2AB",
    takerAddress: "GDAAA7UVMRX6NVPJQ5FZGD2NBZJF4S5M3KGDQR7VWPJL8T9YNDM2IJ",
    sellAsset: "USDC",
    sellAmount: 500,
    buyAsset: "XLM",
    buyAmount: 2450,
    status: "pending_deposits",
    makerDeposited: false,
    takerDeposited: false,
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
