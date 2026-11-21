"""PBKDF2 password helpers (stdlib only — no IdP lock-in)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


_ITERATIONS = 120_000
_SCHEME = "pbkdf2_sha256"


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        _ITERATIONS,
    )
    return f"{_SCHEME}${_ITERATIONS}${_b64encode(salt)}${_b64encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        scheme, iters_s, salt_b64, digest_b64 = password_hash.split("$", 3)
        if scheme != _SCHEME:
            return False
        iterations = int(iters_s)
        salt = _b64decode(salt_b64)
        expected = _b64decode(digest_b64)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(candidate, expected)
