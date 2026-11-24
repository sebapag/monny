"""Portable per-tenant secret storage (tokens never in tenant.yaml / git).

Resolution order for a secret_ref:
1. Process environment
2. ``{MONNY_DATA_DIR}/{tenant_id}/secrets.json`` when tenant_id is known

OAuth access tokens land here after Shopify install.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from monny.config.settings import get_settings


def _secrets_path(tenant_id: str, data_dir: Path | None = None) -> Path:
    root = Path(data_dir or get_settings().monny_data_dir)
    return root / tenant_id / "secrets.json"


def load_secrets(tenant_id: str, data_dir: Path | None = None) -> dict[str, str]:
    path = _secrets_path(tenant_id, data_dir)
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, str) and value.strip():
            out[key] = value
    return out


def save_secrets(tenant_id: str, secrets: dict[str, str], data_dir: Path | None = None) -> Path:
    path = _secrets_path(tenant_id, data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    cleaned = {k: v for k, v in secrets.items() if isinstance(v, str) and v.strip()}
    path.write_text(json.dumps(cleaned, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return path


def set_secret(
    tenant_id: str,
    secret_ref: str,
    value: str,
    data_dir: Path | None = None,
) -> None:
    secrets = load_secrets(tenant_id, data_dir)
    secrets[secret_ref] = value
    save_secrets(tenant_id, secrets, data_dir)


def delete_secret(tenant_id: str, secret_ref: str, data_dir: Path | None = None) -> bool:
    secrets = load_secrets(tenant_id, data_dir)
    if secret_ref not in secrets:
        return False
    del secrets[secret_ref]
    save_secrets(tenant_id, secrets, data_dir)
    return True


def resolve_secret(secret_ref: str, *, tenant_id: str | None = None) -> str | None:
    """Resolve secret from env, then optional tenant store. Never returns empty string."""
    if not secret_ref:
        return None
    env_val = os.getenv(secret_ref)
    if env_val is not None and env_val.strip():
        return env_val
    if tenant_id:
        stored = load_secrets(tenant_id).get(secret_ref)
        if stored and stored.strip():
            return stored
    return None


def secret_status(secret_ref: str, *, tenant_id: str | None = None) -> dict[str, Any]:
    present = resolve_secret(secret_ref, tenant_id=tenant_id) is not None
    return {
        "secret_ref": secret_ref,
        "configured": present,
        "source": (
            "env"
            if (os.getenv(secret_ref) or "").strip()
            else ("store" if present else "missing")
        ),
    }
