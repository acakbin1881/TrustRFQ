import {
  CURRENT_USER_ADDRESS,
  MOCK_DEALS,
  MOCK_QUOTES,
  DEAL_ID_FOR_RFQ,
  MOCK_RFQS,
  isExpired,
  type AssetCode,
  type Deal,
  type DealStatus,
  type Quote,
  type Rfq,
  type RfqStatus,
} from "./mock-data";
import type { Database, Json } from "./database.types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./supabase";

type RfqRow = Database["public"]["Tables"]["rfqs"]["Row"];
type QuoteRow = Database["public"]["Tables"]["quotes"]["Row"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
type EscrowEventRow = Database["public"]["Tables"]["escrow_events"]["Row"];
type EscrowEventInsert = Database["public"]["Tables"]["escrow_events"]["Insert"];

export interface CreateRfqInput {
  creatorAddress?: string;
  sellAsset: AssetCode;
  sellAmount: number;
  buyAsset: AssetCode;
  minBuyAmount: number;
  expiresAt: string;
  invitedMakerAddress?: string | null;
}

export interface SubmitQuoteInput {
  rfqId: string;
  makerAddress?: string;
  quoteAmount: number;
  expiresAt: string;
}

export interface EscrowEvent {
  id: string;
  dealId: string;
  eventType: EscrowEventRow["event_type"];
  actorAddress?: string;
  txHash?: string;
  metadata: Json;
  createdAt: string;
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function mapRfq(row: RfqRow): Rfq {
  return {
    id: row.id,
    creatorAddress: row.creator_address,
    sellAsset: row.sell_asset,
    sellAmount: toNumber(row.sell_amount),
    buyAsset: row.buy_asset,
    buyAmount: toNumber(row.min_buy_amount),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapQuote(row: QuoteRow): Quote {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    makerAddress: row.maker_address,
    quoteAmount: toNumber(row.quote_amount),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapDeal(row: DealRow): Deal {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    quoteId: row.quote_id,
    takerAddress: row.rfq_creator_address,
    makerAddress: row.quote_maker_address,
    sellAsset: row.rfq_creator_asset,
    sellAmount: toNumber(row.rfq_creator_amount),
    buyAsset: row.quote_maker_asset,
    buyAmount: toNumber(row.quote_maker_amount),
    status: row.status,
    takerDeposited: row.rfq_creator_deposited,
    makerDeposited: row.quote_maker_deposited,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    settledAt: row.settled_at ?? undefined,
  };
}

function mapEscrowEvent(row: EscrowEventRow): EscrowEvent {
  return {
    id: row.id,
    dealId: row.deal_id,
    eventType: row.event_type,
    actorAddress: row.actor_address ?? undefined,
    txHash: row.tx_hash ?? undefined,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

function assertOpenRfq(rfq: Rfq) {
  if (rfq.status !== "open" || isExpired(rfq.expiresAt)) {
    throw new Error("This RFQ is closed or expired.");
  }
}

async function syncExpiredRfqRows(rows: RfqRow[]): Promise<RfqRow[]> {
  const expiredIds = rows
    .filter((row) => row.status === "open" && isExpired(row.expires_at))
    .map((row) => row.id);

  if (expiredIds.length === 0) return rows;

  const supabase = getSupabaseBrowserClient();
  await supabase.from("rfqs").update({ status: "expired" }).in("id", expiredIds).throwOnError();

  const expiredSet = new Set(expiredIds);
  return rows.map((row) => (expiredSet.has(row.id) ? { ...row, status: "expired" } : row));
}

export async function listRfqs(): Promise<Rfq[]> {
  if (!isSupabaseConfigured) return MOCK_RFQS;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("rfqs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  const syncedRows = await syncExpiredRfqRows(data);
  return syncedRows.map(mapRfq);
}

export async function getRfq(id: string): Promise<Rfq | null> {
  if (!isSupabaseConfigured) {
    return MOCK_RFQS.find((rfq) => rfq.id === id) ?? null;
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("rfqs").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [syncedRow] = await syncExpiredRfqRows([data]);
  return mapRfq(syncedRow);
}

export async function createRfq(input: CreateRfqInput): Promise<Rfq> {
  if (!isSupabaseConfigured) {
    return {
      id: `rfq-${Date.now()}`,
      creatorAddress: input.creatorAddress ?? CURRENT_USER_ADDRESS,
      sellAsset: input.sellAsset,
      sellAmount: input.sellAmount,
      buyAsset: input.buyAsset,
      buyAmount: input.minBuyAmount,
      status: "open",
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("rfqs")
    .insert({
      creator_address: input.creatorAddress ?? CURRENT_USER_ADDRESS,
      sell_asset: input.sellAsset,
      sell_amount: input.sellAmount,
      buy_asset: input.buyAsset,
      min_buy_amount: input.minBuyAmount,
      invited_maker_address: input.invitedMakerAddress ?? null,
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapRfq(data);
}

export async function listQuotesForRfq(rfqId: string): Promise<Quote[]> {
  if (!isSupabaseConfigured) return MOCK_QUOTES[rfqId] ?? [];

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("rfq_id", rfqId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(mapQuote);
}

export async function submitQuote(input: SubmitQuoteInput): Promise<Quote> {
  const rfq = await getRfq(input.rfqId);
  if (!rfq) throw new Error("RFQ not found.");
  assertOpenRfq(rfq);

  if (input.quoteAmount < rfq.buyAmount) {
    throw new Error("Quote amount is below the RFQ minimum receive amount.");
  }

  if (!isSupabaseConfigured) {
    return {
      id: `quote-${Date.now()}`,
      rfqId: input.rfqId,
      makerAddress: input.makerAddress ?? CURRENT_USER_ADDRESS,
      quoteAmount: input.quoteAmount,
      status: "pending",
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("quotes")
    .insert({
      rfq_id: input.rfqId,
      maker_address: input.makerAddress ?? CURRENT_USER_ADDRESS,
      quote_amount: input.quoteAmount,
      expires_at: input.expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapQuote(data);
}

export async function getDeal(id: string): Promise<Deal | null> {
  if (!isSupabaseConfigured) return MOCK_DEALS[id] ?? null;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return data ? mapDeal(data) : null;
}

export async function acceptQuote(rfq: Rfq, quote: Quote): Promise<Deal> {
  assertOpenRfq(rfq);

  if (quote.status !== "pending") {
    throw new Error("Only pending quotes can be accepted.");
  }

  if (isExpired(quote.expiresAt)) {
    throw new Error("This quote is expired.");
  }

  if (quote.quoteAmount < rfq.buyAmount) {
    throw new Error("Cannot accept a quote below the RFQ minimum receive amount.");
  }

  if (!isSupabaseConfigured) {
    const mockDealId = DEAL_ID_FOR_RFQ[rfq.id] ?? `deal-${rfq.id}`;
    const existingDeal = MOCK_DEALS[mockDealId];
    if (existingDeal) return existingDeal;

    return {
      id: mockDealId,
      rfqId: rfq.id,
      quoteId: quote.id,
      takerAddress: rfq.creatorAddress,
      makerAddress: quote.makerAddress,
      sellAsset: rfq.sellAsset,
      sellAmount: rfq.sellAmount,
      buyAsset: rfq.buyAsset,
      buyAmount: quote.quoteAmount,
      status: "pending_deposits",
      takerDeposited: false,
      makerDeposited: false,
      expiresAt: rfq.expiresAt,
      createdAt: new Date().toISOString(),
    };
  }

  const supabase = getSupabaseBrowserClient();

  await supabase.from("quotes").update({ status: "accepted" }).eq("id", quote.id).throwOnError();
  await supabase
    .from("quotes")
    .update({ status: "rejected" })
    .eq("rfq_id", rfq.id)
    .neq("id", quote.id)
    .throwOnError();
  await supabase.from("rfqs").update({ status: "closed" }).eq("id", rfq.id).throwOnError();

  const { data, error } = await supabase
    .from("deals")
    .insert({
      rfq_id: rfq.id,
      quote_id: quote.id,
      rfq_creator_address: rfq.creatorAddress,
      quote_maker_address: quote.makerAddress,
      rfq_creator_asset: rfq.sellAsset,
      rfq_creator_amount: rfq.sellAmount,
      quote_maker_asset: rfq.buyAsset,
      quote_maker_amount: quote.quoteAmount,
      expires_at: rfq.expiresAt,
    })
    .select("*")
    .single();

  if (error) throw error;

  await recordEscrowEvent({
    deal_id: data.id,
    event_type: "deal_created",
    actor_address: rfq.creatorAddress,
    metadata: { rfqId: rfq.id, quoteId: quote.id },
  });

  return mapDeal(data);
}

export async function updateDealStatus(id: string, status: DealStatus): Promise<Deal> {
  if (!isSupabaseConfigured) {
    const deal = MOCK_DEALS[id];
    if (!deal) throw new Error("Deal not found.");
    return { ...deal, status };
  }

  const supabase = getSupabaseBrowserClient();
  const patch: Database["public"]["Tables"]["deals"]["Update"] = { status };
  if (status === "settled") patch.settled_at = new Date().toISOString();

  const { data, error } = await supabase.from("deals").update(patch).eq("id", id).select("*").single();

  if (error) throw error;

  if (status === "settled" || status === "refunded") {
    await recordEscrowEvent({
      deal_id: id,
      event_type: status,
      metadata: { status },
    });
  }

  return mapDeal(data);
}

export async function updateDealDeposit(
  id: string,
  side: "rfq_creator" | "quote_maker"
): Promise<Deal> {
  if (!isSupabaseConfigured) {
    const deal = MOCK_DEALS[id];
    if (!deal) throw new Error("Deal not found.");
    return side === "rfq_creator"
      ? { ...deal, takerDeposited: true }
      : { ...deal, makerDeposited: true };
  }

  const supabase = getSupabaseBrowserClient();
  const patch: Database["public"]["Tables"]["deals"]["Update"] =
    side === "rfq_creator"
      ? { rfq_creator_deposited: true }
      : { quote_maker_deposited: true };

  const { data, error } = await supabase.from("deals").update(patch).eq("id", id).select("*").single();

  if (error) throw error;

  await recordEscrowEvent({
    deal_id: id,
    event_type: side === "rfq_creator" ? "rfq_creator_funded" : "quote_maker_funded",
    actor_address: side === "rfq_creator" ? data.rfq_creator_address : data.quote_maker_address,
    metadata: {},
  });

  return mapDeal(data);
}
export async function listEscrowEvents(dealId: string): Promise<EscrowEvent[]> {
  if (!isSupabaseConfigured) return [];

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("escrow_events")
    .select("*")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data.map(mapEscrowEvent);
}

export async function recordEscrowEvent(input: EscrowEventInsert): Promise<EscrowEvent | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.from("escrow_events").insert(input).select("*").single();

  if (error) throw error;
  return mapEscrowEvent(data);
}

export function deriveRfqStatus(rfq: Rfq): RfqStatus {
  if (rfq.status === "open" && isExpired(rfq.expiresAt)) return "expired";
  return rfq.status;
}
