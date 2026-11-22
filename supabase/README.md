# Supabase Auth for Atrium

Supabase holds **Auth users** and **role/tenant profiles** with RLS.  
The **LangGraph / FastAPI agent** continues to run as a portable container (Cloud Run, Compose, etc.). Do not replace agent hosting with Supabase Edge Functions.

## 1. Create a project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only**, never in the SPA or Netlify `VITE_*`)
3. Open **Project Settings → API → JWT Settings** and copy **JWT Secret** → `SUPABASE_JWT_SECRET`

## 2. Apply the schema

Run the SQL in [`migrations/20261121_profiles_rls.sql`](migrations/20261121_profiles_rls.sql) in the Supabase **SQL Editor** (or `supabase db push` if you use the CLI).

This creates `public.profiles` (`agent` | `admin`), RLS policies, and a trigger that inserts a profile on Auth signup (default role `agent`).

## 3. Configure Auth

In **Authentication → Providers → Email**:

- Enable Email provider.
- For local demos you may disable “Confirm email”; for production leave confirmation on (signup returns an empty token until confirmed).

Optional: create the first Admin in **Authentication → Users** (or via Admin UI after one service-role bootstrap), then set `profiles.role = 'admin'` in the Table Editor or with:

```sql
update public.profiles
set role = 'admin'
where email = 'you@example.com';
```

## 4. Wire the API container

On the FastAPI / Cloud Run service (not the static Netlify site):

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...
MONNY_AUTH_BACKEND=auto   # or supabase
```

Leave these unset for local/CI: the API falls back to `fixtures/auth/users.json`.

`GET /api/health` reports `auth.backend` as `supabase` or `fixtures`.

## 5. API surface

| Route | Who | Notes |
|-------|-----|--------|
| `POST /api/auth/login` | public | Supabase password grant or fixture JWT |
| `POST /api/auth/signup` | public | Supabase only → role `agent` |
| `POST /api/auth/logout` | session | Clears cookie; best-effort Supabase logout |
| `GET /api/auth/me` | user | Live profile role |
| `GET /api/auth/users` | admin | List profiles (fixtures or Supabase) |
| `POST /api/auth/users` | admin | Create user (service role) |
| `PATCH /api/auth/users/{id}` | admin | Change role / display name |

Admin UI → **Utenti e ruoli** uses these endpoints.

## Secrets checklist

| Secret | Where | Purpose |
|--------|--------|---------|
| `SUPABASE_URL` | API container / `.env` | Project URL |
| `SUPABASE_ANON_KEY` | API container | Login / signup / read own profile |
| `SUPABASE_SERVICE_ROLE_KEY` | API container only | Create users, list/update roles (bypasses RLS) |
| `SUPABASE_JWT_SECRET` | API container | Verify access tokens |
| `MONNY_AUTH_SECRET` | API (fixtures mode) | HMAC for local demo JWTs |
