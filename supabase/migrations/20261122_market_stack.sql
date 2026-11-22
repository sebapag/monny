-- Atrium market-test stack: tenants, HITL, runs, knowledge on the same Supabase project.
-- Free vs paid = subscription.skills / limits only. Full 3D office for everyone.
-- Apply after 20261121_profiles_rls.sql.

-- ---------------------------------------------------------------------------
-- Tenants (config JSON mirrors former tenants/*/tenant.yaml)
-- ---------------------------------------------------------------------------
create table if not exists public.tenants (
  id text primary key,
  display_name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

drop policy if exists "tenants_select_member" on public.tenants;
create policy "tenants_select_member"
  on public.tenants for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = tenants.id
    )
  );

drop policy if exists "tenants_update_admin" on public.tenants;
create policy "tenants_update_admin"
  on public.tenants for update to authenticated
  using (
    public.current_profile_role() = 'admin'
    and public.current_profile_tenant() = tenants.id
  )
  with check (
    public.current_profile_role() = 'admin'
    and public.current_profile_tenant() = tenants.id
  );

grant select, update on public.tenants to authenticated;
grant all on public.tenants to service_role;

-- ---------------------------------------------------------------------------
-- Approvals (HITL)
-- ---------------------------------------------------------------------------
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  thread_id text not null default '',
  action_type text not null default 'proposal',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'delegated', 'escalated')),
  note text,
  delegate_to text,
  apply_result jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists approvals_tenant_status_idx
  on public.approvals (tenant_id, status, created_at desc);

alter table public.approvals enable row level security;

drop policy if exists "approvals_member_all" on public.approvals;
create policy "approvals_member_all"
  on public.approvals for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = approvals.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = approvals.tenant_id
    )
  );

grant select, insert, update on public.approvals to authenticated;
grant all on public.approvals to service_role;

-- ---------------------------------------------------------------------------
-- Agent runs (timeline for office lights / polling)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants (id) on delete cascade,
  thread_id text not null default '',
  goal text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_approval', 'completed', 'error')),
  active_skill text,
  status_line text not null default '',
  steps jsonb not null default '[]'::jsonb,
  reply text,
  report jsonb,
  approval_ids uuid[] not null default '{}',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_tenant_updated_idx
  on public.agent_runs (tenant_id, updated_at desc);

alter table public.agent_runs enable row level security;

drop policy if exists "runs_member_all" on public.agent_runs;
create policy "runs_member_all"
  on public.agent_runs for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = agent_runs.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = agent_runs.tenant_id
    )
  );

grant select, insert, update on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;

-- ---------------------------------------------------------------------------
-- Knowledge sources (portable docs per tenant)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_sources (
  id text not null,
  tenant_id text not null references public.tenants (id) on delete cascade,
  title text not null,
  type text not null default 'markdown',
  body text not null default '',
  tags text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id)
);

alter table public.knowledge_sources enable row level security;

drop policy if exists "knowledge_select_member" on public.knowledge_sources;
create policy "knowledge_select_member"
  on public.knowledge_sources for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = knowledge_sources.tenant_id
    )
  );

drop policy if exists "knowledge_write_admin" on public.knowledge_sources;
create policy "knowledge_write_admin"
  on public.knowledge_sources for all to authenticated
  using (
    public.current_profile_role() = 'admin'
    and public.current_profile_tenant() = knowledge_sources.tenant_id
  )
  with check (
    public.current_profile_role() = 'admin'
    and public.current_profile_tenant() = knowledge_sources.tenant_id
  );

grant select on public.knowledge_sources to authenticated;
grant insert, update, delete on public.knowledge_sources to authenticated;
grant all on public.knowledge_sources to service_role;

-- ---------------------------------------------------------------------------
-- Audit events
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id bigserial primary key,
  tenant_id text not null references public.tenants (id) on delete cascade,
  event text not null,
  payload jsonb not null default '{}'::jsonb,
  ts timestamptz not null default now()
);

create index if not exists audit_events_tenant_ts_idx
  on public.audit_events (tenant_id, ts desc);

alter table public.audit_events enable row level security;

drop policy if exists "audit_select_member" on public.audit_events;
create policy "audit_select_member"
  on public.audit_events for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = audit_events.tenant_id
    )
  );

drop policy if exists "audit_insert_member" on public.audit_events;
create policy "audit_insert_member"
  on public.audit_events for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = audit_events.tenant_id
    )
  );

grant select, insert on public.audit_events to authenticated;
grant all on public.audit_events to service_role;

-- ---------------------------------------------------------------------------
-- Artifacts (JSON blobs produced by runs)
-- ---------------------------------------------------------------------------
create table if not exists public.artifacts (
  tenant_id text not null references public.tenants (id) on delete cascade,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, name)
);

alter table public.artifacts enable row level security;

drop policy if exists "artifacts_member" on public.artifacts;
create policy "artifacts_member"
  on public.artifacts for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = artifacts.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = artifacts.tenant_id
    )
  );

grant select, insert, update on public.artifacts to authenticated;
grant all on public.artifacts to service_role;

-- ---------------------------------------------------------------------------
-- Seed demo tenant (idempotent)
-- ---------------------------------------------------------------------------
insert into public.tenants (id, display_name, config)
values (
  'demo',
  'Demo Shop',
  '{
    "tenant_id": "demo",
    "display_name": "Demo Shop",
    "shopify": {
      "shop_domain": "demo-shop.myshopify.com",
      "api_version": "2025-10",
      "auth": { "secret_ref": "SHOPIFY_TOKEN_DEMO" },
      "scopes_expected": ["read_products", "write_content", "read_orders"]
    },
    "ads": {
      "google": { "customer_id": "000-000-0000", "login_customer_id": null, "secret_ref": "GOOGLE_ADS_DEMO" },
      "meta": { "ad_account_id": "act_demo", "secret_ref": "META_ADS_DEMO" }
    },
    "site": {
      "base_url": "https://www.demo-shop.example",
      "sitemap_url": "https://www.demo-shop.example/sitemap.xml",
      "cms_adapter": "shopify_online_store",
      "locales": ["it", "en"],
      "priority_urls": [
        "https://www.demo-shop.example/",
        "https://www.demo-shop.example/collections/all",
        "https://www.demo-shop.example/products/sample"
      ]
    },
    "policy": {
      "hitl_default": true,
      "spend": {
        "max_budget_delta_pct": 15.0,
        "auto_apply": { "enabled": false, "allow": ["pause_underperforming_adgroup"] },
        "thresholds": { "min_roas": 2.0, "max_cpa": 40.0, "lookback_days": 14 }
      },
      "seo": { "auto_apply": false, "max_urls_per_run": 50 },
      "decision_rights": {
        "spend": "always_ask", "seo": "always_ask", "shopify": "always_ask", "leads": "always_ask",
        "operations": "always_ask", "design": "always_ask", "it": "always_ask", "controlling": "always_ask"
      }
    },
    "integrations": {
      "search_console": { "site_url": "https://www.demo-shop.example/", "secret_ref": "GSC_DEMO" }
    },
    "subscription": {
      "plan": "growth",
      "skills": {
        "spend": true, "seo": true, "shopify": false, "leads": false,
        "operations": true, "design": true, "it": true, "controlling": false
      },
      "features": { "office_view": true },
      "office_mode": "full"
    }
  }'::jsonb
)
on conflict (id) do update
  set display_name = excluded.display_name,
      updated_at = now();

insert into public.knowledge_sources (id, tenant_id, title, type, body, tags, enabled)
values
  ('brand-voice', 'demo', 'Tono di voce', 'markdown',
   '# Tono di voce\n\nChiaro, concreto, italiano. Evitare jargon tecnico in UI.',
   array['brand','copy','spend','seo'], true),
  ('product-faq', 'demo', 'FAQ prodotti', 'markdown',
   '# FAQ\n\nSpedizione 2-4 giorni. Resi 30 giorni.',
   array['commerce','support'], true),
  ('spend-guidelines', 'demo', 'Linee guida spend', 'markdown',
   '# Spend\n\nROAS minimo 2.0. CPA max 40. Escalation Leadership se fuori soglia.',
   array['spend','ads','brand'], true)
on conflict (tenant_id, id) do nothing;
