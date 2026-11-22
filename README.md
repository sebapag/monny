# Atrium

Product brand **Atrium** (workspace marketing). Repo / Python package remain `monny`.

**Stack:** Netlify (SPA) + Supabase (Auth, Postgres/RLS, Edge) + **LangGraph worker** on Cloud Run (scale-to-zero) or local Ubuntu.

Skills/reparti are subscription entitlements. Free vs paid = skills/limits — **full 3D office for everyone**.

## Layout

```
monny/
  web/                      # Vite SPA → Netlify
  supabase/                 # SQL + Edge atrium-api (thin API / fallback stub)
  src/monny/worker/         # LangGraph FastAPI worker (Cloud Run + Ubuntu)
  src/monny/graph/          # LangGraph graph + planner
  tenants/ fixtures/        # Portable demo config
  Dockerfile                # Worker image (same for Cloud Run & compose)
  docker-compose.yml        # Local worker parity
```

## Local Ubuntu (≤3 commands after clone + env)

```bash
cp .env.example .env          # optional: XAI_API_KEY, SUPABASE_*
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
uvicorn monny.worker.app:app --reload --host 127.0.0.1 --port 8000
```

Or Docker (same image as Cloud Run):

```bash
cp .env.example .env
docker compose up --build
```

SPA fixtures (no worker needed for CI/UI):

```bash
cd web && npm install && npm run dev
# login agent@demo / agent-demo
```

SPA against local worker:

```bash
cd web && VITE_WORKER_URL=http://127.0.0.1:8000 npm run dev
```

## Cloud Run deploy

```bash
gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT/REPO/atrium-worker
gcloud run deploy atrium-worker \
  --image REGION-docker.pkg.dev/PROJECT/REPO/atrium-worker \
  --region REGION \
  --allow-unauthenticated \   # or require auth + IAM invoker for Edge/SPA
  --set-env-vars "MONNY_DRY_RUN=1,MONNY_CORS_ORIGINS=https://YOUR.netlify.app" \
  --set-secrets "XAI_API_KEY=XAI_API_KEY:latest,SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_JWT_SECRET=SUPABASE_JWT_SECRET:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"
```

Then set:

- Netlify: `VITE_WORKER_URL=https://atrium-worker-….run.app` (+ `VITE_SUPABASE_*`)
- Edge secret: `WORKER_URL` (same) so Edge can proxy if SPA goes through functions

If `WORKER_URL` / `VITE_WORKER_URL` are unset → Edge keyword stub (CI/demo without GCP).

## Auth & roles

| Role | Surfaces |
|------|----------|
| `agent` | Agent only |
| `admin` | Admin + Agent |

Supabase Auth in production; fixture users for local/CI (`agent@demo` / `admin@demo`).

## Tests

```bash
cd web && npm test && npm run build
python3 -m pytest
```

## Docs

- Worker plan: project `docs/agent-worker-cloudrun.md`
- Stack: `supabase/README.md`, project `docs/stack-netlify-supabase.md`
