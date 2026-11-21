-- Atrium (monny) — profiles + RLS for Agent / Admin roles.
-- Apply in Supabase SQL editor or via `supabase db push`.
-- Agent runtime stays on the FastAPI container; this is Auth + entitlements only.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('agent', 'admin')),
  tenant_id text not null default 'demo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);
create index if not exists profiles_role_idx on public.profiles (role);
create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

comment on table public.profiles is
  'Atrium app roles (agent|admin) and tenant binding. Auth identity lives in auth.users.';

alter table public.profiles enable row level security;

-- Helpers: current user's role / tenant (security definer to avoid RLS recursion).
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_profile_tenant()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_profile_role() from public;
revoke all on function public.current_profile_tenant() from public;
grant execute on function public.current_profile_role() to authenticated, service_role;
grant execute on function public.current_profile_tenant() to authenticated, service_role;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (
      public.current_profile_role() = 'admin'
      and tenant_id = public.current_profile_tenant()
    )
  );

drop policy if exists "profiles_update_own_display" on public.profiles;
create policy "profiles_update_own_display"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and tenant_id = (select p.tenant_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "profiles_admin_update_tenant" on public.profiles;
create policy "profiles_admin_update_tenant"
  on public.profiles
  for update
  to authenticated
  using (
    public.current_profile_role() = 'admin'
    and tenant_id = public.current_profile_tenant()
  )
  with check (
    public.current_profile_role() = 'admin'
    and tenant_id = public.current_profile_tenant()
  );

-- Inserts go through the signup trigger or the API service role (bypasses RLS).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid() and role = 'agent');

-- Auto-create profile on Auth signup (default role: agent).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role text;
  desired_tenant text;
  desired_name text;
begin
  desired_role := coalesce(nullif(trim(new.raw_user_meta_data->>'role'), ''), 'agent');
  if desired_role not in ('agent', 'admin') then
    desired_role := 'agent';
  end if;
  -- Public signup may only mint agent; admin must be granted later by an admin / service role.
  if desired_role = 'admin' and coalesce(new.raw_user_meta_data->>'invited_by_admin', '') <> 'true' then
    desired_role := 'agent';
  end if;
  desired_tenant := coalesce(nullif(trim(new.raw_user_meta_data->>'tenant_id'), ''), 'demo');
  desired_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1),
    new.email
  );
  insert into public.profiles (id, email, display_name, role, tenant_id)
  values (new.id, lower(new.email), desired_name, desired_role, desired_tenant)
  on conflict (id) do update
    set email = excluded.email,
        display_name = excluded.display_name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
