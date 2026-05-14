-- Add Trustless Work escrow fields to accepted RFQ deals.
-- These fields keep the off-chain RFQ/deal state linked to the on-chain escrow.

alter table public.deals
  add column if not exists contract_id text,
  add column if not exists engagement_id text,
  add column if not exists escrow_status text not null default 'not_initialized' check (
    escrow_status in (
      'not_initialized',
      'initializing',
      'initialized',
      'funding',
      'funded',
      'settlement_sent',
      'approved',
      'releasing',
      'released',
      'disputed',
      'failed'
    )
  ),
  add column if not exists milestone_status text not null default 'none' check (
    milestone_status in (
      'none',
      'pending',
      'pending_approval',
      'approved',
      'rejected'
    )
  ),
  add column if not exists trustline_address text,
  add column if not exists transaction_hashes jsonb not null default '{}'::jsonb,
  add column if not exists tw_payload jsonb not null default '{}'::jsonb;

create unique index if not exists deals_contract_id_uidx
  on public.deals(contract_id)
  where contract_id is not null;

create unique index if not exists deals_engagement_id_uidx
  on public.deals(engagement_id)
  where engagement_id is not null;

create index if not exists deals_escrow_status_idx
  on public.deals(escrow_status);

create index if not exists deals_transaction_hashes_gin_idx
  on public.deals using gin(transaction_hashes);

alter table public.escrow_events
  drop constraint if exists escrow_events_event_type_check;

alter table public.escrow_events
  add constraint escrow_events_event_type_check check (
    event_type in (
      'deal_created',
      'rfq_creator_funded',
      'quote_maker_funded',
      'settled',
      'refunded',
      'expired',
      'escrow_initialized',
      'escrow_funded',
      'settlement_sent',
      'milestone_approved',
      'funds_released',
      'dispute_started',
      'escrow_failed'
    )
  );
