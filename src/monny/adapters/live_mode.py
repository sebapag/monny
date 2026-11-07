"""Helpers for MONNY_LIVE / dry-run gating. Live stays off unless explicitly enabled."""

from __future__ import annotations

from monny.config.loader import resolve_secret
from monny.config.settings import get_settings


def use_live(*, dry_run: bool | None = None, secret_ref: str | None = None) -> bool:
    """True only when MONNY_LIVE=1, dry-run is off, and (optional) secret_ref resolves."""
    settings = get_settings()
    if dry_run is None:
        dry_run = settings.dry_run
    if dry_run or not settings.monny_live:
        return False
    if secret_ref is not None and resolve_secret(secret_ref) is None:
        return False
    return True
