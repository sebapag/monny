# Monny

LangGraph marketing deep agent for **spend** (Google Ads + Meta) and **SEO**.  
Propose-then-approve HITL by default. Shopify / ads accounts are portable config — never hard-coded.

## Layout

```
monny/
  src/monny/          # Python agent + FastAPI
  tenants/demo/       # Sample portable tenant.yaml
  fixtures/spend/     # Mock Ads metrics for dry-run
  web/                # Vite + React UI (Agent + Admin)
  data/               # Runtime (checkpoints, approvals, artifacts)
```

## Product surfaces

1. **Agent UI** (`/`) — chat/console to steer the agent, review replies, approve/reject proposals.
2. **Admin UI** (`/admin`) — edit tenant configuration (Shopify, Google Ads, Meta, site/SEO, policy/HITL). Secrets are **references** (`secret_ref` env names), never raw values in git.

## Quick start (dry-run / mock)

No live credentials required. Dry-run is the default (`MONNY_DRY_RUN=1`).

### 1. Python agent + API

```bash
cd monny
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# CLI loop
python -m monny --tenant demo --goal "report spend ultimi 7 giorni"

# API
uvicorn monny.api.app:app --reload --host 127.0.0.1 --port 8000
```

### 2. Web UI

```bash
cd web
npm install
npm run dev
```

Open http://127.0.0.1:5173 — Agent console.  
Admin: http://127.0.0.1:5173/admin

### 3. Tests

```bash
pytest
```

## Portability

Onboard a new shop by adding `tenants/<id>/tenant.yaml` with Shopify / Ads / site / policy blocks and `secret_ref` names. Put real tokens in the environment (or a secret manager) under those names. The agent code never embeds shop domains or account IDs.

Example secret refs for the demo tenant (see `.env.example`):

- `SHOPIFY_TOKEN_DEMO`
- `GOOGLE_ADS_DEMO`
- `META_ADS_DEMO`
- `GSC_DEMO`

Leave them empty to stay in mock mode.

## Live mode (later)

Set `MONNY_LIVE=1` and `MONNY_DRY_RUN=0`, then populate the secret refs. Live API clients are hooks/stubs in this scaffold slice — no production mutations yet.

## API (dev)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Steer the agent |
| `GET` | `/api/approvals` | List pending approvals |
| `POST` | `/api/approvals/{id}/decide` | Approve / reject |
| `GET` | `/api/tenants` | List tenants |
| `GET` | `/api/tenants/{id}` | Read config + secret status |
| `PUT` | `/api/tenants/{id}` | Update tenant.yaml |

## Skills (MVP)

| Skill | Status |
|-------|--------|
| `spend_google` | Mock read + proposals |
| `spend_meta` | Mock read + proposals |
| `seo_audit` | Stub audit / change set |
| `seo_apply` | Stub (gated) |
| `reporting` | Assembles markdown report |
| `shopify_promo` | Disabled stub |
| `lead_warming` | Disabled stub |
