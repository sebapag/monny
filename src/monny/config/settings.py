"""Runtime settings for Monny (env-driven)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    monny_dry_run: bool = True
    monny_live: bool = False
    monny_tenants_dir: str = "tenants"
    monny_data_dir: str = "data"
    monny_default_tenant: str = "demo"
    monny_api_host: str = "127.0.0.1"
    monny_api_port: int = 8000
    monny_cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # Portable local auth (JWT/session). Override secret in deploy; users from fixtures JSON.
    monny_auth_secret: str = "atrium-local-dev-secret-change-me"
    monny_auth_users_path: str = ""  # empty → fixtures/auth/users.json
    monny_auth_ttl_seconds: int = 60 * 60 * 12
    monny_auth_cookie_secure: bool = False  # set true behind HTTPS

    # Optional planner LLM (xAI Grok). Empty key → keyword stub planner.
    xai_api_key: str = ""
    monny_llm_model: str = "grok-4.20-0309-non-reasoning"
    monny_llm_base_url: str = "https://api.x.ai/v1"
    # Explicit kill-switch: force stub even if XAI_API_KEY is set (local recovery).
    monny_llm_enabled: bool = True

    @property
    def dry_run(self) -> bool:
        return self.monny_dry_run or not self.monny_live

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.monny_cors_origins.split(",") if o.strip()]

    @property
    def llm_enabled(self) -> bool:
        if not self.monny_llm_enabled:
            return False
        return bool((self.xai_api_key or "").strip())

    @property
    def auth_secret(self) -> str:
        return (self.monny_auth_secret or "").strip() or "atrium-local-dev-secret-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()
