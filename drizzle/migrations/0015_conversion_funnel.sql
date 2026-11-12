-- Conversão first-party, sem perguntas, cartas, tokens de leitura ou IP.
-- Adição compatível: não altera preços, Pix nem dados históricos.
create table if not exists public.conversion_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_name text not null check (event_name in
    ('landing_view','free_start','upgrade_view','upgrade_5','upgrade_7','pix_view','pix_copy')),
  plan text not null default 'none' check (plan in ('none','essencial','profunda','completa')),
  source text not null default 'direct' check (char_length(source) <= 32),
  medium text not null default '' check (char_length(medium) <= 32),
  campaign text not null default '' check (char_length(campaign) <= 48),
  created_at timestamptz not null default now(),
  unique (session_id, event_name, plan)
);
create index if not exists idx_conversion_events_date on public.conversion_events (created_at desc);
alter table public.conversion_events enable row level security;
revoke all privileges on public.conversion_events from public, anon, authenticated;
grant select, insert on public.conversion_events to service_role;

alter table public.orders add column if not exists conversion_session uuid;
create index if not exists idx_orders_conversion_session on public.orders (conversion_session) where conversion_session is not null;
