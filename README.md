# Monny

LangGraph marketing deep agent for **spend** (Google Ads + Meta) and **SEO**.  
Propose-then-approve HITL by default. Shopify / ads accounts are portable config — never hard-coded.  
Skills/reparti are **subscription entitlements** toggled per tenant (not all-on).

## Layout

```
monny/
  src/monny/          # Python agent + FastAPI
  tenants/demo/       # Sample portable tenant.yaml (+ subscription.skills)
  tenants/acme/       # Second tenant (swap YAML only)
  fixtures/spend/     # Mock Ads metrics for dry-run
  fixtures/seo/       # HTML fixtures for .example hosts
  fixtures/shopify/   # Shop + page metadata by shop_domain
  web/                # Vite + React UI (Agent + Admin)
  data/               # Runtime (checkpoints, approvals, artifacts, audit)
  Dockerfile          # Multi-stage API image (Cloud Run / App Runner / ACA)
  docker-compose.yml  # Local api (+ optional web profile)
  netlify.toml        # Frontend static deploy
  .github/workflows/  # CI, GHCR push, Cloud Run / Netlify / AWS / Azure
  tests/
```

## Product surfaces

1. **Agent UI** (`/#agent`) — 3D office twin: rooms light when skills run; locked rooms for disabled entitlements; free-text + shortcuts respect the plan.
2. **Admin UI** (`/#admin`) — tenant editor + **Attivazione piano / reparti** toggles (`subscription.skills`: spend, seo, shopify, leads). Leadership/HITL always on.

## Quick start (dry-run / mock)

No live credentials required. Dry-run is the default (`MONNY_DRY_RUN=1`, `MONNY_LIVE=0`).

### Docker Compose (recommended local)

```bash
# API only (production-like image)
docker compose up --build

# API + Vite web (profile)
docker compose --profile web up --build
```

- API health: http://127.0.0.1:8000/health (also `/api/health`)
- Web (profile): http://127.0.0.1:5173 — set `VITE_API_BASE_URL` if the UI should call a remote API

### 1. Python agent + API (venv)

```bash
cd monny
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Interactive goals
python -m monny --tenant demo --goal "report spend ultimi 7 giorni"
python -m monny --tenant demo --goal "seo audit of priority pages"

# Scheduled jobs (same graph)
python -m monny --job spend_daily --tenant demo
python -m monny --job seo_weekly --tenant demo
python -m monny --list-jobs

# Portability check — different shop via YAML only
python -m monny --tenant acme --goal "report spend ultimi 7 giorni"

# API
uvicorn monny.api.app:app --reload --host 127.0.0.1 --port 8000
```

### 2. Web UI

```bash
cd web && npm install && npm run dev
```

Optional: point the SPA at a remote API (Cloud Run):

```bash
VITE_API_BASE_URL=https://YOUR-CLOUD-RUN-URL npm run dev
```

- Agent: http://127.0.0.1:5173  
- Admin: http://127.0.0.1:5173/#admin  

### 3. Tests

```bash
pytest   # no live credentials required
cd web && npm test && npm run build
```

## Planner LLM (optional — xAI Grok)

By default the LangGraph planner uses a **keyword stub** (no network). To enable a real model for short skill plans only (no heavy CoT / tool loop):

```bash
export XAI_API_KEY=...                         # required for live LLM
export MONNY_LLM_ENABLED=1                     # set 0 to force stub even with a key
export MONNY_LLM_MODEL=grok-4.20-0309-non-reasoning   # default: light non-reasoning
export MONNY_LLM_BASE_URL=https://api.x.ai/v1         # OpenAI-compatible
```

If the key is missing, `MONNY_LLM_ENABLED=0`, or the call fails, Monny falls back to the stub planner (CI/local dry-run stay green). HITL and skills are unchanged. `POST /api/runs` never blocks on xAI — planning upgrades in the background worker.

## Secret refs & live mode

Secrets are **names** in `tenant.yaml` (`secret_ref`), resolved from the environment at runtime. Never commit values.

| Tenant | Shopify | Google Ads | Meta | Search Console |
|--------|---------|------------|------|----------------|
| `demo` | `SHOPIFY_TOKEN_DEMO` | `GOOGLE_ADS_DEMO` | `META_ADS_DEMO` | `GSC_DEMO` |
| `acme` | `SHOPIFY_TOKEN_ACME` | `GOOGLE_ADS_ACME` | `META_ADS_ACME` | `GSC_ACME` |

**Global (live Google Ads only):**

- `GOOGLE_ADS_DEVELOPER_TOKEN` — required when `MONNY_LIVE=1`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` — optional MCC

### Enable live reads (explicit)

```bash
export MONNY_LIVE=1
export MONNY_DRY_RUN=0
export GOOGLE_ADS_DEMO=...          # OAuth access token
export GOOGLE_ADS_DEVELOPER_TOKEN=...
export META_ADS_DEMO=...            # Graph access token
export SHOPIFY_TOKEN_DEMO=...       # Admin API token
```

- Live **reads** use real HTTP client interfaces (`GoogleAdsLiveClient`, `MetaAdsLiveClient`, `ShopifyLiveClient`).
- Live **writes** still require HITL approve; mutate endpoints are scaffolded and will not run unattended production mutations without further wiring.
- With `MONNY_LIVE=0` (default), all paths use fixtures under `fixtures/`.

## Portability

Onboard a shop by adding `tenants/<id>/tenant.yaml` + matching `fixtures/shopify/<shop_domain>.json` (for dry-run). Swap tenant id — no code changes. Compare:

```bash
python -m monny --tenant demo --goal "seo audit"
python -m monny --tenant acme --goal "seo audit"
```

## Subscription / activatable skills

In `tenant.yaml`:

```yaml
subscription:
  plan: growth          # starter | growth | scale
  skills:
    spend: true
    seo: true
    shopify: false
    leads: false
```

- **Demo seed**: growth with spend+seo on; shopify/leads off.
- **Runtime**: planner + skills runner skip disabled skills; API returns `403` when a free-text goal only targets disabled reparti.
- **UI**: Admin toggles (“Attivazione piano / reparti”); office rooms for off skills look locked (Italian hint); shortcuts/free-text refuse disabled goals.
- Leadership (HITL / Direzione) is always available.

## Deploy

| Path | Role |
|------|------|
| **Docker image** (`Dockerfile`) | Portable API → GHCR `ghcr.io/<owner>/monny-api` |
| **Cloud Run** | Reference hyperscaler (`.github/workflows/deploy-cloudrun.yml`, `workflow_dispatch`) |
| **Netlify** | Static `web/` (`netlify.toml`; env `VITE_API_BASE_URL`) |
| **AWS App Runner / Azure Container Apps** | Same image — stub workflows `deploy-aws.yml` / `deploy-azure.yml` (dry-run by default) |

### GitHub Actions

| Workflow | Trigger | Notes |
|----------|---------|-------|
| `ci.yml` | PR + push `main` | pytest + web build |
| `docker-api.yml` | push `main` / tags / manual | build & push GHCR |
| `deploy-cloudrun.yml` | `workflow_dispatch` | secrets: `GCP_SA_KEY`, `GCP_PROJECT` |
| `deploy-netlify.yml` | `workflow_dispatch` | secrets: `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` + input `api_base_url` |
| `deploy-aws.yml` / `deploy-azure.yml` | `workflow_dispatch` | documented stubs; dry-run without cloud accounts |

### Netlify (Git integration)

1. New site from repo → build uses root `netlify.toml` (`base = web`, publish `dist`, SPA redirect).
2. Set env `VITE_API_BASE_URL` to the Cloud Run URL (no trailing slash).
3. Or use `deploy-netlify.yml` with Netlify secrets.

No live cloud credentials are committed; dry-run/mock remains the default.

## HITL apply

1. Agent proposes spend pauses/budget cuts or an SEO change set.
2. Approve via Agent UI or `POST /api/approvals/{id}/decide`.
3. Apply runs stubs by default (`applied_stub`); with live flags + secrets, CMS/Ads live interfaces are selected (writes remain gated / scaffolded).

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/runs` | Start async run (returns timeline immediately) |
| `GET` | `/api/runs/{id}` | Poll run status + skill steps (`pending\|running\|done\|waiting\|error`) |
| `GET` | `/api/runs/{id}/stream` | SSE stream of the same timeline |
| `POST` | `/api/chat` | Sync steer (also creates a run timeline) |
| `GET` | `/api/approvals` | List approvals |
| `POST` | `/api/approvals/{id}/decide` | Approve / reject (+ apply + audit) |
| `GET` | `/health` / `/api/health` | Liveness |
| `GET` | `/api/tenants` | List tenants (+ `subscription` summary) |
| `GET`/`PUT` | `/api/tenants/{id}` | Read / save config (includes `subscription`) |
| `GET` | `/api/tenants/{id}/audit` | Audit events |

## Skills (MVP)

| Skill | Status |
|-------|--------|
| `shopify_read` | Fixture/live shop + sample page (every run) |
| `spend_google` / `spend_meta` | Fixture or live metrics + diagnosis |
| `seo_audit` | Uses `seo_crawler` subagent → SeoChangeSet |
| `seo_apply` | HITL-gated stub / live CMS behind flag |
| `reporting` | Markdown + structured UI payload + artifacts |
| `shopify_promo` | Phase-2 stub proposals (no side effects) |
| `lead_warming` | Phase-3 stub proposals (no side effects) |

### Subagents

| Subagent | Role |
|----------|------|
| `seo_crawler` | Batch fetch/parse priority URLs; returns compact summaries only (fixtures by default) |

Ask explicitly for stubs, e.g. `propose shopify promo discount` or `lead warming sequence`.

### Artifacts API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/tenants/{id}/artifacts` | List JSON artifacts |
| `GET` | `/api/tenants/{id}/artifacts/{name}` | Load `last_report.json`, `last_spend_report.json`, `last_seo_report.json` |
