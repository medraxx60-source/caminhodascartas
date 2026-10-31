alter table public.orders add column if not exists is_free boolean not null default false;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;

create table public.free_reading_claims (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  ip_hash text not null,
  order_id uuid,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  consumed_at timestamptz
);
grant all on public.free_reading_claims to service_role;
alter table public.free_reading_claims enable row level security;
-- One active/consumed benefit per browser id, enforced by the database.
create unique index free_claims_device_active_uq on public.free_reading_claims (device_id) where status in ('reserved','consumed');
create index free_claims_ip_idx on public.free_reading_claims (ip_hash, created_at);
create index free_claims_order_idx on public.free_reading_claims (order_id);

-- Atomic reservation. Returns claim id or raises: already_used | in_progress | ip_limit
create or replace function public.reserve_free_reading(_device uuid, _ip text, _order uuid default null, _ip_limit int default 3)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid; _n int;
begin
  perform pg_advisory_xact_lock(hashtext('free-dev:' || _device::text));
  perform pg_advisory_xact_lock(hashtext('free-ip:' || _ip));
  update public.free_reading_claims set status = 'released'
   where status = 'reserved' and expires_at < now() and (device_id = _device or ip_hash = _ip);
  if exists (select 1 from public.free_reading_claims where device_id = _device and status = 'consumed') then
    raise exception 'already_used';
  end if;
  select id into _id from public.free_reading_claims where device_id = _device and status = 'reserved';
  if _id is not null then
    if _order is not null and exists (select 1 from public.free_reading_claims where id = _id and (order_id = _order or order_id is null)) then
      update public.free_reading_claims set order_id = _order, expires_at = now() + interval '10 minutes' where id = _id;
      return _id;
    end if;
    raise exception 'in_progress';
  end if;
  select count(*) into _n from public.free_reading_claims
   where ip_hash = _ip and status in ('reserved','consumed') and created_at > now() - interval '30 days';
  if _n >= _ip_limit then raise exception 'ip_limit'; end if;
  insert into public.free_reading_claims (device_id, ip_hash, order_id) values (_device, _ip, _order) returning id into _id;
  return _id;
end $$;
revoke all on function public.reserve_free_reading(uuid, text, uuid, int) from public, anon, authenticated;
grant execute on function public.reserve_free_reading(uuid, text, uuid, int) to service_role;