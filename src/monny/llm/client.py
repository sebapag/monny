"""OpenAI-compatible chat client for xAI (Grok) via httpx — no tool loop."""

from __future__ import annotations

from typing import Any

import httpx

from monny.config.settings import Settings, get_settings

# Keep planner calls cheap and short (no mega agent loop).
DEFAULT_TEMPERATURE = 0.1
DEFAULT_MAX_TOKENS = 256
DEFAULT_TIMEOUT_S = 20.0


def llm_configured(settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    return bool((s.xai_api_key or "").strip())


def chat_completion(
    *,
    messages: list[dict[str, str]],
    settings: Settings | None = None,
    temperature: float = DEFAULT_TEMPERATURE,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    client: httpx.Client | None = None,
) -> str:
    """
    POST /chat/completions against MONNY_LLM_BASE_URL (default xAI).

    Raises httpx.HTTPError or ValueError on empty/malformed responses.
    Caller must ensure XAI_API_KEY is set (see llm_configured).
    """
    s = settings or get_settings()
    api_key = (s.xai_api_key or "").strip()
    if not api_key:
        raise ValueError("XAI_API_KEY is not set")

    base = (s.monny_llm_base_url or "https://api.x.ai/v1").rstrip("/")
    url = f"{base}/chat/completions"
    payload: dict[str, Any] = {
        "model": s.monny_llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        # Discourage extended reasoning / tool loops on providers that honor these.
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    own_client = client is None
    http = client or httpx.Client(timeout=timeout_s)
    try:
        resp = http.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    finally:
        if own_client:
            http.close()

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ValueError(f"Unexpected LLM response shape: {data!r}") from exc
    if not isinstance(content, str) or not content.strip():
        raise ValueError("LLM returned empty content")
    return content.strip()
