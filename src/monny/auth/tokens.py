"""Compact HMAC-signed session tokens (JWT-shaped, stdlib only)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def issue_token(
    claims: dict[str, Any],
    *,
    secret: str,
    ttl_seconds: int = 60 * 60 * 12,
) -> str:
    now = int(time.time())
    payload = {
        **claims,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    head = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    body = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{head}.{body}".encode("ascii")
    sig = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{head}.{body}.{_b64url_encode(sig)}"


def decode_token(token: str, *, secret: str) -> dict[str, Any]:
    try:
        head_b64, body_b64, sig_b64 = token.split(".", 2)
    except ValueError as exc:
        raise ValueError("Malformed token") from exc
    signing_input = f"{head_b64}.{body_b64}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64url_decode(sig_b64)):
        raise ValueError("Invalid token signature")
    try:
        payload = json.loads(_b64url_decode(body_b64))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Invalid token payload") from exc
    if not isinstance(payload, dict):
        raise ValueError("Invalid token payload")
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise ValueError("Token expired")
    return payload
