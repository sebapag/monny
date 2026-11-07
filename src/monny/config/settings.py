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

    @property
    def dry_run(self) -> bool:
        return self.monny_dry_run or not self.monny_live

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.monny_cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
