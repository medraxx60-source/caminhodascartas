create type public.app_role as enum ('admin');
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- First registered user becomes admin; later signups get no role.
create or replace function public.assign_first_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;
create trigger on_auth_user_created_admin after insert on auth.users
for each row execute function public.assign_first_admin();

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  plan text not null check (plan in ('essencial','profunda','completa')),
  price_cents int not null,
  question text not null check (char_length(question) between 5 and 1000),
  cards jsonb not null,
  status text not null default 'pending' check (status in ('pending','generating','done','error')),
  reading text,
  error_message text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz
);
grant select, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "admins read orders" on public.orders for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins update orders" on public.orders for update to authenticated using (public.has_role(auth.uid(), 'admin'));