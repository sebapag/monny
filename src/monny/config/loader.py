"""Load tenant YAML and resolve secret refs from the environment (never from git)."""

from __future__ import annotations

import os
from pathlib import Path

import yaml

from monny.config.models import TenantConfig


def tenants_root(override: str | Path | None = None) -> Path:
    raw = override or os.getenv("MONNY_TENANTS_DIR", "tenants")
    return Path(raw).resolve()


def list_tenant_ids(root: Path | None = None) -> list[str]:
    base = root or tenants_root()
    if not base.exists():
        return []
    ids: list[str] = []
    for path in sorted(base.iterdir()):
        if path.is_dir() and (path / "tenant.yaml").exists():
            ids.append(path.name)
    return ids


def tenant_path(tenant_id: str, root: Path | None = None) -> Path:
    return (root or tenants_root()) / tenant_id / "tenant.yaml"


def load_tenant(tenant_id: str, root: Path | None = None) -> TenantConfig:
    path = tenant_path(tenant_id, root)
    if not path.exists():
        raise FileNotFoundError(f"Tenant config not found: {path}")
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return TenantConfig.model_validate(data)


def save_tenant(config: TenantConfig, root: Path | None = None) -> Path:
    path = tenant_path(config.tenant_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = config.model_dump(mode="json")
    with path.open("w", encoding="utf-8") as fh:
        yaml.safe_dump(payload, fh, sort_keys=False, allow_unicode=True)
    return path


def resolve_secret(secret_ref: str) -> str | None:
    """Resolve a secret ref name from the environment. Returns None if unset."""
    value = os.getenv(secret_ref)
    if value is None or value.strip() == "":
        return None
    return value


def secret_status(secret_ref: str) -> dict[str, str | bool]:
    """Admin-safe status: whether a ref is set, never the raw value."""
    present = resolve_secret(secret_ref) is not None
    return {"secret_ref": secret_ref, "configured": present}
