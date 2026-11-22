# Supabase — Atrium market-test backend

Primary backend for Atrium: **Auth + Postgres/RLS + Edge Functions**.  
Frontend: **Netlify**. Same Supabase project for free and paid (differentiate on skills/limits; 3D office for all).

The FastAPI/Docker API is **not** required for market test.

## 1. Migrations

In the SQL editor (or `supabase db push`), apply in order:

1. [`migrations/20261121_profiles_rls.sql`](migrations/20261121_profiles_rls.sql) — `profiles` + Auth trigger  
2. [`migrations/20261122_market_stack.sql`](migrations/20261122_market_stack.sql) — tenants, approvals, runs, knowledge, audit, artifacts + demo seed

## 2. Edge Function `atrium-api`

```bash
supabase functions deploy atrium-api
```

Routes (Bearer = user access token):

| Path | Notes |
|------|--------|
| `GET /api/health` | Public-ish via function; stack metadata |
| `GET /api/auth/me` | Profile |
| `GET/POST /api/auth/users`, `PATCH .../{id}` | Admin user mgmt (service role) |
| `GET/PUT /api/tenants…` | Tenant config (admin write) |
| `GET/POST /api/approvals…` | HITL |
| `POST /api/runs`, `GET /api/runs/{id}` | Planner stub + timeline |
| Knowledge / audit / artifacts | As before |

Planner: keyword stub; optional Grok if `XAI_API_KEY` secret is set.  
**TODO:** full LangGraph container when needed.

## 3. Secrets

### Netlify (build / browser)

| Name | Purpose |
|------|---------|
| `VITE_SUPABASE_URL` | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key (RLS enforced) |

### Supabase Edge / dashboard

| Name | Purpose |
|------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin user create / bypass RLS in function |
| `XAI_API_KEY` | Optional short planner |
| `MONNY_LLM_MODEL` / `MONNY_LLM_BASE_URL` | Optional |

Never put `service_role` in Netlify `VITE_*`.

## 4. First admin

Sign up via the SPA (role `agent`), then:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

Or create via Admin «Utenti e ruoli» once one admin exists.

## 5. Local / CI without Supabase

Omit `VITE_SUPABASE_*` → SPA uses in-browser fixture backend (`agent@demo` / `admin@demo`).
