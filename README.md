# Monny

LangGraph marketing deep agent for **spend** (Google Ads + Meta) and **SEO**.  
Propose-then-approve HITL by default. Shopify / ads accounts are portable config — never hard-coded.

## Layout

```
monny/
  src/monny/          # Python agent + FastAPI
  tenants/demo/       # Sample portable tenant.yaml
  tenants/acme/       # Second tenant (swap YAML only)
  fixtures/spend/     # Mock Ads metrics for dry-run
  fixtures/seo/       # HTML fixtures for .example hosts
  fixtures/shopify/   # Shop + page metadata by shop_domain
  web/                # Vite + React UI (Agent + Admin)
  data/               # Runtime (checkpoints, approvals, artifacts, audit)
  tests/
```

## Product surfaces

1. **Agent UI** (`/#agent`) — chat/console, multi-tenant switcher (`demo` / `acme`), structured spend/SEO from saved artifacts, pending-approval banner after jobs, approve/reject.
2. **Admin UI** (`/#admin`) — tenant chips + form editor for the selected `tenant.yaml` (Shopify, Ads, site, policy) with per-tenant secret_ref status (never raw secrets).

## Quick start (dry-run / mock)

No live credentials required. Dry-run is the default (`MONNY_DRY_RUN=1`, `MONNY_LIVE=0`).

### 1. Python agent + API

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

- Agent: http://127.0.0.1:5173  
- Admin: http://127.0.0.1:5173/#admin  

### 3. Tests

```bash
pytest   # no live credentials required
```

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

## HITL apply

1. Agent proposes spend pauses/budget cuts or an SEO change set.
2. Approve via Agent UI or `POST /api/approvals/{id}/decide`.
3. Apply runs stubs by default (`applied_stub`); with live flags + secrets, CMS/Ads live interfaces are selected (writes remain gated / scaffolded).

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Steer the agent |
| `GET` | `/api/approvals` | List approvals |
| `POST` | `/api/approvals/{id}/decide` | Approve / reject (+ apply + audit) |
| `GET` | `/api/tenants` | List tenants |
| `GET`/`PUT` | `/api/tenants/{id}` | Read / save config |
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
