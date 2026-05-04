export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      rfqs: {
        Row: {
          id: string;
          creator_address: string;
          sell_asset: "XLM" | "USDC" | "EURC";
          sell_amount: string;
          buy_asset: "XLM" | "USDC" | "EURC";
          min_buy_amount: string;
          status: "open" | "closed" | "expired" | "cancelled";
          invited_maker_address: string | null;
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_address: string;
          sell_asset: "XLM" | "USDC" | "EURC";
          sell_amount: number | string;
          buy_asset: "XLM" | "USDC" | "EURC";
          min_buy_amount: number | string;
          status?: "open" | "closed" | "expired" | "cancelled";
          invited_maker_address?: string | null;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rfqs"]["Insert"]>;
        Relationships: [];
      };
      quotes: {
        Row: {
          id: string;
          rfq_id: string;
          maker_address: string;
          quote_amount: string;
          status: "pending" | "accepted" | "rejected";
          expires_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rfq_id: string;
          maker_address: string;
          quote_amount: number | string;
          status?: "pending" | "accepted" | "rejected";
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
        Relationships: [];
      };
      deals: {
        Row: {
          id: string;
          rfq_id: string;
          quote_id: string;
          rfq_creator_address: string;
          quote_maker_address: string;
          rfq_creator_asset: "XLM" | "USDC" | "EURC";
          rfq_creator_amount: string;
          quote_maker_asset: "XLM" | "USDC" | "EURC";
          quote_maker_amount: string;
          status: "pending_deposits" | "settled" | "refunded";
          rfq_creator_deposited: boolean;
          quote_maker_deposited: boolean;
          expires_at: string;
          settled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rfq_id: string;
          quote_id: string;
          rfq_creator_address: string;
          quote_maker_address: string;
          rfq_creator_asset: "XLM" | "USDC" | "EURC";
          rfq_creator_amount: number | string;
          quote_maker_asset: "XLM" | "USDC" | "EURC";
          quote_maker_amount: number | string;
          status?: "pending_deposits" | "settled" | "refunded";
          rfq_creator_deposited?: boolean;
          quote_maker_deposited?: boolean;
          expires_at: string;
          settled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["deals"]["Insert"]>;
        Relationships: [];
      };
      escrow_events: {
        Row: {
          id: string;
          deal_id: string;
          event_type:
            | "deal_created"
            | "rfq_creator_funded"
            | "quote_maker_funded"
            | "settled"
            | "refunded"
            | "expired";
          actor_address: string | null;
          tx_hash: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          deal_id: string;
          event_type:
            | "deal_created"
            | "rfq_creator_funded"
            | "quote_maker_funded"
            | "settled"
            | "refunded"
            | "expired";
          actor_address?: string | null;
          tx_hash?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["escrow_events"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
