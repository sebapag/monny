"""Supabase Auth + PostgREST helpers (httpx only — no SDK lock-in).

LangGraph / FastAPI stay on the container. Supabase holds Auth users + profiles/RLS.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from monny.auth.users import AuthenticatedUser, Role, _normalize_role


class SupabaseError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    anon_key: str
    service_role_key: str = ""
    jwt_secret: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.url.strip() and self.anon_key.strip())

    @property
    def admin_configured(self) -> bool:
        return self.configured and bool(self.service_role_key.strip())

    @property
    def jwt_verify_secret(self) -> str:
        return (self.jwt_secret or "").strip()


@dataclass(frozen=True)
class SupabaseSession:
    access_token: str
    refresh_token: str | None
    expires_in: int
    user: AuthenticatedUser
    user_id: str


def _headers(api_key: str, *, bearer: str | None = None) -> dict[str, str]:
    h = {
        "apikey": api_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if bearer:
        h["Authorization"] = f"Bearer {bearer}"
    return h


def _auth_url(cfg: SupabaseConfig, path: str) -> str:
    return f"{cfg.url.rstrip('/')}/auth/v1{path}"


def _rest_url(cfg: SupabaseConfig, path: str) -> str:
    return f"{cfg.url.rstrip('/')}/rest/v1{path}"


def _profile_from_row(row: dict[str, Any]) -> AuthenticatedUser:
    return AuthenticatedUser(
        email=str(row["email"]).strip().lower(),
        display_name=str(row.get("display_name") or row["email"]),
        role=_normalize_role(str(row["role"])),
        tenant_id=str(row.get("tenant_id") or "demo"),
        user_id=str(row.get("id") or "") or None,
    )


def fetch_profile(
    cfg: SupabaseConfig,
    *,
    user_id: str,
    access_token: str | None = None,
    use_service_role: bool = False,
) -> AuthenticatedUser | None:
    if use_service_role:
        if not cfg.service_role_key:
            raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY mancante")
        key = cfg.service_role_key
        bearer = cfg.service_role_key
    else:
        key = cfg.anon_key
        bearer = access_token or cfg.anon_key
    params = {"id": f"eq.{user_id}", "select": "id,email,display_name,role,tenant_id"}
    with httpx.Client(timeout=20.0) as client:
        res = client.get(
            _rest_url(cfg, "/profiles"),
            headers=_headers(key, bearer=bearer),
            params=params,
        )
    if res.status_code >= 400:
        raise SupabaseError(
            f"Lettura profilo fallita: {res.status_code} {res.text[:200]}",
            status_code=res.status_code,
        )
    rows = res.json()
    if not isinstance(rows, list) or not rows:
        return None
    return _profile_from_row(rows[0])


def sign_in_with_password(cfg: SupabaseConfig, email: str, password: str) -> SupabaseSession:
    payload = {"email": email.strip().lower(), "password": password}
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            _auth_url(cfg, "/token?grant_type=password"),
            headers=_headers(cfg.anon_key),
            json=payload,
        )
    if res.status_code >= 400:
        raise SupabaseError("Email o password non validi", status_code=401)
    data = res.json()
    access = str(data.get("access_token") or "")
    if not access:
        raise SupabaseError("Risposta Auth senza access_token", status_code=502)
    auth_user = data.get("user") or {}
    user_id = str(auth_user.get("id") or "")
    if not user_id:
        raise SupabaseError("Risposta Auth senza user id", status_code=502)
    profile = fetch_profile(cfg, user_id=user_id, access_token=access)
    if profile is None:
        # Race: trigger may lag; synthesize agent profile from Auth user.
        meta = auth_user.get("user_metadata") or {}
        email_norm = str(auth_user.get("email") or email).strip().lower()
        profile = AuthenticatedUser(
            email=email_norm,
            display_name=str(meta.get("display_name") or email_norm),
            role="agent",
            tenant_id=str(meta.get("tenant_id") or "demo"),
            user_id=user_id,
        )
    return SupabaseSession(
        access_token=access,
        refresh_token=str(data["refresh_token"]) if data.get("refresh_token") else None,
        expires_in=int(data.get("expires_in") or 3600),
        user=profile,
        user_id=user_id,
    )


def sign_up(
    cfg: SupabaseConfig,
    *,
    email: str,
    password: str,
    display_name: str = "",
    role: Role = "agent",
    tenant_id: str = "demo",
    invited_by_admin: bool = False,
) -> SupabaseSession:
    """Public signup (agent) or admin-invited signup metadata."""
    meta: dict[str, Any] = {
        "display_name": display_name or email.split("@")[0],
        "role": role if invited_by_admin else "agent",
        "tenant_id": tenant_id or "demo",
    }
    if invited_by_admin:
        meta["invited_by_admin"] = "true"
        meta["role"] = role
    payload = {
        "email": email.strip().lower(),
        "password": password,
        "data": meta,
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            _auth_url(cfg, "/signup"),
            headers=_headers(cfg.anon_key),
            json=payload,
        )
    if res.status_code >= 400:
        detail = res.text[:240]
        raise SupabaseError(f"Registrazione non riuscita: {detail}", status_code=res.status_code)
    data = res.json()
    # Signup may return session immediately (email confirm off) or only user.
    access = str(data.get("access_token") or "")
    auth_user = data.get("user") or data
    user_id = str(auth_user.get("id") or "")
    if access and user_id:
        profile = fetch_profile(cfg, user_id=user_id, access_token=access)
        if profile is None:
            profile = AuthenticatedUser(
                email=email.strip().lower(),
                display_name=meta["display_name"],
                role=_normalize_role(str(meta["role"])),
                tenant_id=str(meta["tenant_id"]),
                user_id=user_id,
            )
        return SupabaseSession(
            access_token=access,
            refresh_token=str(data["refresh_token"]) if data.get("refresh_token") else None,
            expires_in=int(data.get("expires_in") or 3600),
            user=profile,
            user_id=user_id,
        )
    # Email confirmation required — sign-in will work after confirm; return empty token.
    if not user_id:
        raise SupabaseError("Registrazione incompleta (nessun user id)", status_code=502)
    profile = AuthenticatedUser(
        email=email.strip().lower(),
        display_name=meta["display_name"],
        role=_normalize_role(str(meta["role"])),
        tenant_id=str(meta["tenant_id"]),
        user_id=user_id,
    )
    return SupabaseSession(
        access_token="",
        refresh_token=None,
        expires_in=0,
        user=profile,
        user_id=user_id,
    )


def admin_create_user(
    cfg: SupabaseConfig,
    *,
    email: str,
    password: str,
    display_name: str,
    role: Role,
    tenant_id: str,
) -> AuthenticatedUser:
    if not cfg.admin_configured:
        raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY richiesta per creare utenti")
    payload = {
        "email": email.strip().lower(),
        "password": password,
        "email_confirm": True,
        "user_metadata": {
            "display_name": display_name or email.split("@")[0],
            "role": role,
            "tenant_id": tenant_id,
            "invited_by_admin": "true",
        },
    }
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            _auth_url(cfg, "/admin/users"),
            headers=_headers(cfg.service_role_key, bearer=cfg.service_role_key),
            json=payload,
        )
    if res.status_code >= 400:
        raise SupabaseError(
            f"Creazione utente fallita: {res.text[:240]}",
            status_code=res.status_code,
        )
    data = res.json()
    user_id = str(data.get("id") or "")
    if not user_id:
        raise SupabaseError("Admin create senza id", status_code=502)
    # Ensure role/tenant even if trigger already ran with defaults.
    upsert_profile(
        cfg,
        user_id=user_id,
        email=email.strip().lower(),
        display_name=display_name or email.split("@")[0],
        role=role,
        tenant_id=tenant_id,
    )
    profile = fetch_profile(cfg, user_id=user_id, use_service_role=True)
    if profile is None:
        raise SupabaseError("Profilo non creato dopo admin create", status_code=502)
    return profile


def upsert_profile(
    cfg: SupabaseConfig,
    *,
    user_id: str,
    email: str,
    display_name: str,
    role: Role,
    tenant_id: str,
) -> None:
    if not cfg.admin_configured:
        raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY richiesta")
    row = {
        "id": user_id,
        "email": email.strip().lower(),
        "display_name": display_name,
        "role": role,
        "tenant_id": tenant_id,
    }
    headers = _headers(cfg.service_role_key, bearer=cfg.service_role_key)
    headers["Prefer"] = "resolution=merge-duplicates,return=minimal"
    with httpx.Client(timeout=20.0) as client:
        res = client.post(
            _rest_url(cfg, "/profiles"),
            headers=headers,
            json=row,
        )
    if res.status_code >= 400:
        raise SupabaseError(
            f"Upsert profilo fallito: {res.text[:240]}",
            status_code=res.status_code,
        )


def list_profiles(cfg: SupabaseConfig, *, tenant_id: str | None = None) -> list[AuthenticatedUser]:
    if not cfg.admin_configured:
        raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY richiesta")
    params: dict[str, str] = {
        "select": "id,email,display_name,role,tenant_id",
        "order": "email.asc",
    }
    if tenant_id:
        params["tenant_id"] = f"eq.{tenant_id}"
    with httpx.Client(timeout=20.0) as client:
        res = client.get(
            _rest_url(cfg, "/profiles"),
            headers=_headers(cfg.service_role_key, bearer=cfg.service_role_key),
            params=params,
        )
    if res.status_code >= 400:
        raise SupabaseError(
            f"Lista profili fallita: {res.text[:240]}",
            status_code=res.status_code,
        )
    rows = res.json()
    if not isinstance(rows, list):
        return []
    return [_profile_from_row(r) for r in rows]


def update_profile_role(
    cfg: SupabaseConfig,
    *,
    user_id: str,
    role: Role,
    display_name: str | None = None,
    tenant_id: str | None = None,
) -> AuthenticatedUser:
    if not cfg.admin_configured:
        raise SupabaseError("SUPABASE_SERVICE_ROLE_KEY richiesta")
    patch: dict[str, Any] = {"role": role}
    if display_name is not None:
        patch["display_name"] = display_name
    if tenant_id is not None:
        patch["tenant_id"] = tenant_id
    headers = _headers(cfg.service_role_key, bearer=cfg.service_role_key)
    headers["Prefer"] = "return=representation"
    with httpx.Client(timeout=20.0) as client:
        res = client.patch(
            _rest_url(cfg, "/profiles"),
            headers=headers,
            params={"id": f"eq.{user_id}"},
            json=patch,
        )
    if res.status_code >= 400:
        raise SupabaseError(
            f"Aggiornamento ruolo fallito: {res.text[:240]}",
            status_code=res.status_code,
        )
    rows = res.json()
    if not isinstance(rows, list) or not rows:
        raise SupabaseError("Utente non trovato", status_code=404)
    return _profile_from_row(rows[0])


def sign_out(cfg: SupabaseConfig, access_token: str) -> None:
    if not access_token:
        return
    with httpx.Client(timeout=10.0) as client:
        client.post(
            _auth_url(cfg, "/logout"),
            headers=_headers(cfg.anon_key, bearer=access_token),
        )
