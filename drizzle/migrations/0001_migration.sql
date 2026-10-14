drop trigger if exists on_auth_user_created_admin on auth.users;
drop function if exists public.assign_first_admin();

alter table public.orders add column generation_started_at timestamptz;
alter table public.orders add column client_ip_hash text;
create index orders_ip_created_idx on public.orders (client_ip_hash, created_at);

-- Atomic claim for generation: admin only, never when a reading exists,
-- stale 'generating' (>5 min) can be recovered.
create or replace function public.claim_order_for_generation(_id uuid)
returns setof public.orders language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden';
  end if;
  return query
  update public.orders
     set status = 'generating', generation_started_at = now(),
         paid_at = coalesce(paid_at, now()), error_message = null
   where id = _id and reading is null
     and (status in ('pending','error')
          or (status = 'generating' and generation_started_at < now() - interval '5 minutes'))
  returning *;
end $$;
revoke all on function public.claim_order_for_generation(uuid) from public, anon;
grant execute on function public.claim_order_for_generation(uuid) to authenticated;