"""FastAPI dependencies for session/JWT auth and role gates."""

from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, Header, HTTPException, Request

from monny.auth.tokens import decode_token
from monny.auth.users import AuthenticatedUser, Role, find_user
from monny.config.settings import get_settings

COOKIE_NAME = "atrium_session"


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def _user_from_token(token: str) -> AuthenticatedUser:
    settings = get_settings()
    try:
        claims = decode_token(token, secret=settings.auth_secret)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Sessione non valida o scaduta") from exc
    email = str(claims.get("sub") or "").strip().lower()
    role = str(claims.get("role") or "").strip().lower()
    if not email or role not in ("agent", "admin"):
        raise HTTPException(status_code=401, detail="Sessione non valida")
    stored = find_user(email, path=settings.monny_auth_users_path or None)
    if stored is None:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    # Prefer live fixture role so demoting a user invalidates old admin claims.
    return AuthenticatedUser(
        email=stored.email,
        display_name=stored.display_name,
        role=stored.role,
        tenant_id=stored.tenant_id,
    )


def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    atrium_session: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> AuthenticatedUser:
    token = _extract_bearer(authorization) or atrium_session
    if not token:
        # Also allow cookie read from Starlette cookies if alias missed.
        token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Autenticazione richiesta")
    return _user_from_token(token)


def require_user(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    if not user.can_access_agent:
        raise HTTPException(status_code=403, detail="Accesso Agent non consentito")
    return user


def require_admin(
    user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    if not user.can_access_admin:
        raise HTTPException(
            status_code=403,
            detail="Solo Admin: l'account Agent non può aprire questa area",
        )
    return user


def require_role(*roles: Role):
    allowed = set(roles)

    def _dep(
        user: Annotated[AuthenticatedUser, Depends(get_current_user)],
    ) -> AuthenticatedUser:
        if user.role not in allowed:
            raise HTTPException(status_code=403, detail="Ruolo non autorizzato")
        return user

    return _dep
