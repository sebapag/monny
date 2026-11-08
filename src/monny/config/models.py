"""Pydantic models for portable tenant configuration."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SecretRef(BaseModel):
    secret_ref: str


class ShopifyConfig(BaseModel):
    shop_domain: str
    api_version: str = "2025-10"
    auth: SecretRef
    scopes_expected: list[str] = Field(default_factory=list)


class GoogleAdsConfig(BaseModel):
    customer_id: str
    login_customer_id: str | None = None
    secret_ref: str


class MetaAdsConfig(BaseModel):
    ad_account_id: str
    secret_ref: str


class AdsConfig(BaseModel):
    google: GoogleAdsConfig | None = None
    meta: MetaAdsConfig | None = None


class SiteConfig(BaseModel):
    base_url: str
    sitemap_url: str | None = None
    cms_adapter: Literal["shopify_online_store", "generic_http", "git_content"] = (
        "shopify_online_store"
    )
    locales: list[str] = Field(default_factory=lambda: ["en"])
    priority_urls: list[str] = Field(default_factory=list)


class SpendAutoApply(BaseModel):
    enabled: bool = False
    allow: list[str] = Field(default_factory=list)


class SpendThresholds(BaseModel):
    min_roas: float = 2.0
    max_cpa: float = 40.0
    lookback_days: int = 14


class SpendPolicy(BaseModel):
    max_budget_delta_pct: float = 15.0
    auto_apply: SpendAutoApply = Field(default_factory=SpendAutoApply)
    thresholds: SpendThresholds = Field(default_factory=SpendThresholds)


class SeoPolicy(BaseModel):
    auto_apply: bool = False
    max_urls_per_run: int = 50


class PolicyConfig(BaseModel):
    hitl_default: bool = True
    spend: SpendPolicy = Field(default_factory=SpendPolicy)
    seo: SeoPolicy = Field(default_factory=SeoPolicy)


class SearchConsoleConfig(BaseModel):
    site_url: str
    secret_ref: str


class IntegrationsConfig(BaseModel):
    search_console: SearchConsoleConfig | None = None


class SubscriptionSkills(BaseModel):
    """Activatable product skills / reparti. Leadership (HITL) is always on."""

    spend: bool = True
    seo: bool = True
    shopify: bool = False
    leads: bool = False


class SubscriptionConfig(BaseModel):
    plan: Literal["starter", "growth", "scale"] = "growth"
    skills: SubscriptionSkills = Field(default_factory=SubscriptionSkills)


class TenantConfig(BaseModel):
    tenant_id: str
    display_name: str
    shopify: ShopifyConfig
    ads: AdsConfig = Field(default_factory=AdsConfig)
    site: SiteConfig
    policy: PolicyConfig = Field(default_factory=PolicyConfig)
    integrations: IntegrationsConfig = Field(default_factory=IntegrationsConfig)
    subscription: SubscriptionConfig = Field(default_factory=SubscriptionConfig)
