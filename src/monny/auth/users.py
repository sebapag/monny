"""Load portable demo/local users from fixtures (or override path)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal

from monny.auth.passwords import verify_password

Role = Literal["agent", "admin"]


def default_users_path() -> Path:
    """Resolve fixture path for local repo, Docker (/app), or CWD."""
    candidates = [
        Path("fixtures/auth/users.json"),
        Path("/app/fixtures/auth/users.json"),
        Path(__file__).resolve().parents[3] / "fixtures" / "auth" / "users.json",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return candidates[0]


@dataclass(frozen=True)
class AuthenticatedUser:
    email: str
    display_name: str
    role: Role
    tenant_id: str
    user_id: str | None = None

    def to_public(self) -> dict[str, str]:
        out = {
            "email": self.email,
            "display_name": self.display_name,
            "role": self.role,
            "tenant_id": self.tenant_id,
        }
        if self.user_id:
            out["user_id"] = self.user_id
        return out

    @property
    def can_access_admin(self) -> bool:
        return self.role == "admin"

    @property
    def can_access_agent(self) -> bool:
        # Admin may also use Agent; agent may not open Admin.
        return self.role in ("agent", "admin")


@dataclass(frozen=True)
class StoredUser:
    email: str
    display_name: str
    role: Role
    tenant_id: str
    password_hash: str

    def as_auth(self) -> AuthenticatedUser:
        return AuthenticatedUser(
            email=self.email,
            display_name=self.display_name,
            role=self.role,
            tenant_id=self.tenant_id,
        )


def normalize_role(raw: str) -> Role:
    role = (raw or "").strip().lower()
    if role not in ("agent", "admin"):
        raise ValueError(f"Unsupported role: {raw}")
    return role  # type: ignore[return-value]


# Back-compat alias used by supabase_client / older imports.
_normalize_role = normalize_role


@lru_cache
def load_users(path: str | None = None) -> tuple[StoredUser, ...]:
    users_path = Path(path) if path else default_users_path()
    data = json.loads(users_path.read_text(encoding="utf-8"))
    rows = data.get("users") or []
    out: list[StoredUser] = []
    for row in rows:
        out.append(
            StoredUser(
                email=str(row["email"]).strip().lower(),
                display_name=str(row.get("display_name") or row["email"]),
                role=normalize_role(str(row["role"])),
                tenant_id=str(row.get("tenant_id") or "demo"),
                password_hash=str(row["password_hash"]),
            )
        )
    return tuple(out)


def clear_users_cache() -> None:
    load_users.cache_clear()


def find_user(email: str, *, path: str | None = None) -> StoredUser | None:
    needle = email.strip().lower()
    for user in load_users(path):
        if user.email == needle:
            return user
    return None


def authenticate(
    email: str,
    password: str,
    *,
    path: str | None = None,
) -> AuthenticatedUser | None:
    user = find_user(email, path=path)
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user.as_auth()
