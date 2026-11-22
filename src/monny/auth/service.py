"""Unified auth: Supabase when configured, else local fixture JWT."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from monny.auth import supabase_client as sb
from monny.auth.tokens import decode_token, issue_token
from monny.auth.users import AuthenticatedUser, Role, authenticate as fixture_authenticate, find_user
from monny.config.settings import Settings

AuthBackend = Literal["supabase", "fixtures"]


@dataclass(frozen=True)
class LoginOutcome:
    token: str
    user: AuthenticatedUser
    expires_in: int
    backend: AuthBackend
    refresh_token: str | None = None


def supabase_config(settings: Settings) -> sb.SupabaseConfig:
    return sb.SupabaseConfig(
        url=(settings.supabase_url or "").strip(),
        anon_key=(settings.supabase_anon_key or "").strip(),
        service_role_key=(settings.supabase_service_role_key or "").strip(),
        jwt_secret=(settings.supabase_jwt_secret or "").strip(),
    )


def auth_backend(settings: Settings) -> AuthBackend:
    forced = (settings.monny_auth_backend or "auto").strip().lower()
    cfg = supabase_config(settings)
    if forced == "fixtures":
        return "fixtures"
    if forced == "supabase":
        return "supabase" if cfg.configured else "fixtures"
    # auto (default): Supabase when URL + anon key are present.
    return "supabase" if cfg.configured else "fixtures"


def login(settings: Settings, email: str, password: str) -> LoginOutcome:
    backend = auth_backend(settings)
    if backend == "supabase":
        cfg = supabase_config(settings)
        session = sb.sign_in_with_password(cfg, email, password)
        return LoginOutcome(
            token=session.access_token,
            user=session.user,
            expires_in=session.expires_in,
            backend="supabase",
            refresh_token=session.refresh_token,
        )

    user = fixture_authenticate(
        email,
        password,
        path=settings.monny_auth_users_path or None,
    )
    if user is None:
        raise sb.SupabaseError("Email o password non validi", status_code=401)
    token = issue_token(
        {
            "sub": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id,
            "name": user.display_name,
            "backend": "fixtures",
        },
        secret=settings.auth_secret,
        ttl_seconds=settings.monny_auth_ttl_seconds,
    )
    return LoginOutcome(
        token=token,
        user=user,
        expires_in=settings.monny_auth_ttl_seconds,
        backend="fixtures",
    )


def signup(
    settings: Settings,
    *,
    email: str,
    password: str,
    display_name: str = "",
) -> LoginOutcome:
    """Public signup → agent role. Supabase only (fixtures are read-only)."""
    if auth_backend(settings) != "supabase":
        raise sb.SupabaseError(
            "Registrazione disponibile solo con Supabase. "
            "In locale demo usa agent@demo / admin@demo.",
            status_code=503,
        )
    cfg = supabase_config(settings)
    session = sb.sign_up(
        cfg,
        email=email,
        password=password,
        display_name=display_name,
        role="agent",
        tenant_id=settings.monny_default_tenant,
        invited_by_admin=False,
    )
    if not session.access_token:
        # Confirm-email flow: account created, no session yet.
        return LoginOutcome(
            token="",
            user=session.user,
            expires_in=0,
            backend="supabase",
        )
    return LoginOutcome(
        token=session.access_token,
        user=session.user,
        expires_in=session.expires_in,
        backend="supabase",
        refresh_token=session.refresh_token,
    )


def resolve_user_from_token(settings: Settings, token: str) -> AuthenticatedUser:
    """Accept Supabase access tokens or local atrium HMAC JWTs."""
    backend = auth_backend(settings)
    cfg = supabase_config(settings)

    if backend == "supabase":
        secret = cfg.jwt_verify_secret or settings.auth_secret
        try:
            claims = decode_token(token, secret=secret)
        except ValueError as exc:
            # Fall through: allow fixture tokens during mixed local testing.
            if settings.monny_auth_allow_fixture_fallback:
                return _resolve_fixture_token(settings, token)
            raise ValueError("Sessione non valida o scaduta") from exc
        return _user_from_supabase_claims(cfg, claims, access_token=token)

    return _resolve_fixture_token(settings, token)


def _resolve_fixture_token(settings: Settings, token: str) -> AuthenticatedUser:
    try:
        claims = decode_token(token, secret=settings.auth_secret)
    except ValueError as exc:
        raise ValueError("Sessione non valida o scaduta") from exc
    email = str(claims.get("sub") or "").strip().lower()
    role = str(claims.get("role") or "").strip().lower()
    if not email or role not in ("agent", "admin"):
        raise ValueError("Sessione non valida")
    stored = find_user(email, path=settings.monny_auth_users_path or None)
    if stored is None:
        raise ValueError("Utente non trovato")
    return AuthenticatedUser(
        email=stored.email,
        display_name=stored.display_name,
        role=stored.role,
        tenant_id=stored.tenant_id,
    )


def _user_from_supabase_claims(
    cfg: sb.SupabaseConfig,
    claims: dict,
    *,
    access_token: str,
) -> AuthenticatedUser:
    user_id = str(claims.get("sub") or "").strip()
    if not user_id:
        raise ValueError("Sessione non valida")
    # Prefer live profile (role changes take effect immediately).
    try:
        profile = sb.fetch_profile(cfg, user_id=user_id, access_token=access_token)
    except sb.SupabaseError as exc:
        raise ValueError("Profilo non disponibile") from exc
    if profile is not None:
        return profile
    email = str(claims.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Utente non trovato")
    return AuthenticatedUser(
        email=email,
        display_name=email,
        role="agent",
        tenant_id="demo",
        user_id=user_id,
    )


def list_users(settings: Settings, *, tenant_id: str | None = None) -> list[AuthenticatedUser]:
    if auth_backend(settings) == "supabase":
        return sb.list_profiles(supabase_config(settings), tenant_id=tenant_id)
    users = []
    from monny.auth.users import load_users

    for stored in load_users(settings.monny_auth_users_path or None):
        if tenant_id and stored.tenant_id != tenant_id:
            continue
        users.append(stored.as_auth())
    return users


def create_user(
    settings: Settings,
    *,
    email: str,
    password: str,
    display_name: str,
    role: Role,
    tenant_id: str,
) -> AuthenticatedUser:
    if auth_backend(settings) != "supabase":
        raise sb.SupabaseError(
            "Creazione utenti disponibile solo con Supabase (fixture locali sono fisse).",
            status_code=503,
        )
    return sb.admin_create_user(
        supabase_config(settings),
        email=email,
        password=password,
        display_name=display_name,
        role=role,
        tenant_id=tenant_id,
    )


def set_user_role(
    settings: Settings,
    *,
    user_id: str,
    role: Role,
    display_name: str | None = None,
    tenant_id: str | None = None,
) -> AuthenticatedUser:
    if auth_backend(settings) != "supabase":
        raise sb.SupabaseError(
            "Cambio ruolo disponibile solo con Supabase.",
            status_code=503,
        )
    return sb.update_profile_role(
        supabase_config(settings),
        user_id=user_id,
        role=role,
        display_name=display_name,
        tenant_id=tenant_id,
    )


def logout_token(settings: Settings, token: str | None) -> None:
    if not token:
        return
    if auth_backend(settings) == "supabase":
        try:
            sb.sign_out(supabase_config(settings), token)
        except Exception:
            # Best-effort; cookie clear still happens in the route.
            pass
