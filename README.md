# Monny

LangGraph marketing deep agent for **spend** (Google Ads + Meta) and **SEO**.  
Propose-then-approve HITL by default. Shopify / ads accounts are portable config — never hard-coded.

## Layout

```
monny/
  src/monny/          # Python agent + FastAPI
  tenants/demo/       # Sample portable tenant.yaml
  fixtures/spend/     # Mock Ads metrics for dry-run
  fixtures/seo/       # HTML fixtures for .example hosts
  web/                # Vite + React UI (Agent + Admin)
  data/               # Runtime (checkpoints, approvals, artifacts, audit)
  tests/
```

## Product surfaces

1. **Agent UI** (`/#agent`) — chat/console, structured spend tables, SEO change-set diffs, approve/reject.
2. **Admin UI** (`/#admin`) — form editor for Shopify, Google Ads, Meta, site/SEO, policy/HITL, and secret_ref status (never raw secrets).

## Quick start (dry-run / mock)

No live credentials required. Dry-run is the default (`MONNY_DRY_RUN=1`).

### 1. Python agent + API

```bash
cd monny
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# CLI — spend report
python -m monny --tenant demo --goal "report spend ultimi 7 giorni"

# CLI — SEO audit
python -m monny --tenant demo --goal "seo audit of priority pages"

# API
uvicorn monny.api.app:app --reload --host 127.0.0.1 --port 8000
# or: ./scripts/dev.sh
```

### 2. Web UI

```bash
cd web
npm install
npm run dev
```

- Agent: http://127.0.0.1:5173  
- Admin: http://127.0.0.1:5173/#admin  

Vite proxies `/api` → `:8000`.

### 3. Tests

```bash
pytest
```

## Try the HITL loop

1. Start API + UI.
2. In Agent UI, click **Spend report** (or **SEO audit**) → Send.
3. Review structured report (campaign table / SEO diffs).
4. Approve or reject pending proposals in the right panel.
5. Approved actions run apply stubs only (`applied_stub`) and append to `data/<tenant>/audit.jsonl`.

## Portability

Onboard a new shop by adding `tenants/<id>/tenant.yaml` with Shopify / Ads / site / policy blocks and `secret_ref` names. Put real tokens in the environment under those names. The agent never embeds shop domains or account IDs in code.

Demo secret refs (see `.env.example`): `SHOPIFY_TOKEN_DEMO`, `GOOGLE_ADS_DEMO`, `META_ADS_DEMO`, `GSC_DEMO`.

Optional `site.priority_urls` drives the SEO audit target list; `.example` hosts load HTML from `fixtures/seo/`.

## Live mode (later)

Set `MONNY_LIVE=1` and `MONNY_DRY_RUN=0`, then populate secret refs. Live Ads/Shopify clients remain hooks — this slice never mutates production APIs.

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Steer the agent (returns structured `report`) |
| `GET` | `/api/approvals` | List approvals (`?tenant_id=&status=pending`) |
| `POST` | `/api/approvals/{id}/decide` | Approve / reject (+ apply stub + audit) |
| `GET` | `/api/tenants` | List tenants |
| `GET` | `/api/tenants/{id}` | Config + secret status |
| `PUT` | `/api/tenants/{id}` | Save `tenant.yaml` |
| `GET` | `/api/tenants/{id}/audit` | Recent audit events |

## Skills (MVP)

| Skill | Status |
|-------|--------|
| `spend_google` / `spend_meta` | Fixture metrics + CPA/ROAS diagnosis + proposals |
| `seo_audit` | Fetch/fixture HTML → title/meta/H1 issues → SeoChangeSet |
| `seo_apply` | Stub on approve |
| `reporting` | Markdown + structured payload for UI |
| `shopify_promo` / `lead_warming` | Disabled stubs |
