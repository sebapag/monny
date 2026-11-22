# Atrium

Product brand **Atrium** (workspace marketing). Repo / Python package remain `monny`.

Marketing deep agent for **spend** (Google Ads + Meta) and **SEO**, with HITL.  
**Market-test deploy:** Netlify (SPA) + Supabase (Auth, Postgres/RLS, Edge Functions).  
No API Docker/Cloud Run in the happy path (optional later if LangGraph load needs it).

Skills/reparti are **subscription entitlements**. Free vs paid = skills/limits — **full 3D office for everyone**.

## Layout

```
monny/
  web/                # Vite + React (Agent + Admin) → Netlify
  supabase/           # SQL migrations + Edge Function atrium-api
  fixtures/           # Local demo data (SPA fixture runtime + legacy Python)
  tenants/            # Sample YAML (seeded into Supabase tenants.config)
  src/monny/          # Legacy Python/LangGraph (optional later / unit tests)
  Dockerfile          # OPTIONAL later — not primary deploy
  docker-compose.yml  # OPTIONAL later
  netlify.toml        # Primary frontend deploy
  tests/
```

## Product surfaces

1. **Agent UI** (`/#agent`) — 3D office twin (all plans). Login: `agent` or `admin`.
2. **Admin UI** (`/#admin`) — entitlements, tenant, knowledge, users. Login: `admin` only.

## Auth & roles

| Role | Surfaces |
|------|----------|
| `agent` | Agent only |
| `admin` | Admin + Agent |

**CI / local without Supabase:** in-browser fixtures (`agent@demo` / `agent-demo`, `admin@demo` / `admin-demo`).

**Production:** Supabase Auth + `public.profiles` RLS. Same project for free and paid.

## Quick start (fixture SPA — no cloud)

```bash
cd web && npm install && npm run dev
# http://127.0.0.1:5173 — login agent@demo / agent-demo
```

## Market-test deploy (Netlify + Supabase)

1. Create a Supabase project; apply SQL in order:
   - `supabase/migrations/20261121_profiles_rls.sql`
   - `supabase/migrations/20261122_market_stack.sql`
2. Deploy Edge Function:
   ```bash
   supabase functions deploy atrium-api
   ```
3. Set Supabase secrets (Edge):
   - `SUPABASE_SERVICE_ROLE_KEY` (auto in hosted)
   - Optional planner: `XAI_API_KEY`, `MONNY_LLM_MODEL`, `MONNY_LLM_BASE_URL`
4. Netlify site (base `web`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Bootstrap first admin:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

Details: [`supabase/README.md`](supabase/README.md).

## Planner note

Edge Function uses a **keyword stub** (+ optional short Grok call if `XAI_API_KEY` is set).  
Full LangGraph on a container is **deferred** — product still supports login, office, entitlements, HITL for market test.

## Tests

```bash
cd web && npm test && npm run build          # fixture runtime (no Supabase)
python3 -m pytest                            # legacy Python unit tests still green
```

## Optional later (not market-test path)

`Dockerfile` / `docker-compose.yml` / FastAPI under `src/monny/api` remain in-repo for a future LangGraph container. Prefer Netlify + Supabase until then.
