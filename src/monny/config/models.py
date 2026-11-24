"""Pydantic models for portable tenant configuration."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class SecretRef(BaseModel):
    secret_ref: str


class ShopifyConfig(BaseModel):
    """Portable Shopify tenant settings — never hard-wire a single shop in code."""

    shop_domain: str
    api_version: str = "2025-10"
    auth: SecretRef
    scopes_expected: list[str] = Field(default_factory=list)
    # Admin «Connettori commerce»: merchant marked this store as connected.
    # Credentials stay in env via secret_ref; domain stays tenant YAML.
    connected: bool = False


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


Autonomy = Literal["always_ask", "within_policy", "agent_resolves"]


class DecisionRights(BaseModel):
    """
    Explicit decision rights per skill family (BCG-inspired sketch).
    - always_ask: human/Leadership confirms before apply (default)
    - within_policy: agent may apply when auto_apply / policy limits allow
    - agent_resolves: agent may apply without HITL for that family
    """

    spend: Autonomy = "always_ask"
    seo: Autonomy = "always_ask"
    shopify: Autonomy = "always_ask"
    leads: Autonomy = "always_ask"
    operations: Autonomy = "always_ask"
    design: Autonomy = "always_ask"
    it: Autonomy = "always_ask"
    controlling: Autonomy = "always_ask"


class PolicyConfig(BaseModel):
    hitl_default: bool = True
    spend: SpendPolicy = Field(default_factory=SpendPolicy)
    seo: SeoPolicy = Field(default_factory=SeoPolicy)
    decision_rights: DecisionRights = Field(default_factory=DecisionRights)


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
    # Phase-2 department wings — off by default / plan-gated like shopify & leads.
    operations: bool = False
    design: bool = False
    it: bool = False
    controlling: bool = False


class SubscriptionFeatures(BaseModel):
    """Frontend / UX flags (not graph skills)."""

    # Market rule: 3D office for everyone (kept for YAML/API compatibility).
    office_view: bool = True


# Product plans: free (signup default) | plus (paid). Legacy aliases normalized.
ProductPlan = Literal["free", "plus"]
_LEGACY_PLAN_MAP: dict[str, ProductPlan] = {
    "free": "free",
    "plus": "plus",
    "starter": "free",
    "growth": "plus",
    "scale": "plus",
}


class SubscriptionConfig(BaseModel):
    """
    Product subscription.

    Defaults:
    - plan free (signup); Admin can set plus (Stripe stub).
    - plus_override: Admin unlocks plus-tier skills without changing plan label.
    """

    plan: ProductPlan = "free"
    skills: SubscriptionSkills = Field(default_factory=SubscriptionSkills)
    features: SubscriptionFeatures = Field(default_factory=SubscriptionFeatures)
    # Presentation preference — full 3D default for all plans.
    office_mode: Literal["auto", "full", "light"] = "full"
    # Admin override: treat tenant as plus-entitled for skill tier gates.
    plus_override: bool = False

    @field_validator("plan", mode="before")
    @classmethod
    def _normalize_plan(cls, value: Any) -> str:
        if value is None or value == "":
            return "free"
        key = str(value).strip().lower()
        return _LEGACY_PLAN_MAP.get(key, key if key in ("free", "plus") else "free")

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy(cls, data: Any) -> Any:
        if isinstance(data, dict) and "plan" in data:
            data = {**data, "plan": cls._normalize_plan(data.get("plan"))}
        return data


class BillingConfig(BaseModel):
    """
    Always-visible monthly spend for paying users (Admin).
    Ads spend is billed by Google/Meta; Atrium subscription is separate.
    """

    currency: Literal["EUR"] = "EUR"
    # Day of month when the Atrium plan renews / charges.
    renews_on_day: int = Field(default=1, ge=1, le=28)
    # List price for the current plan (stub until Stripe).
    atrium_price_eur: float = 49.0
    # Soft monthly ads ceiling the merchant set (not a hard kill-switch).
    ads_monthly_budget_eur: float = 2500.0
    # Snapshot of ads spend in the current calendar month (demo / last sync).
    ads_spent_this_month_eur: float = 0.0


class TenantConfig(BaseModel):
    tenant_id: str
    display_name: str
    shopify: ShopifyConfig
    ads: AdsConfig = Field(default_factory=AdsConfig)
    site: SiteConfig
    policy: PolicyConfig = Field(default_factory=PolicyConfig)
    integrations: IntegrationsConfig = Field(default_factory=IntegrationsConfig)
    subscription: SubscriptionConfig = Field(default_factory=SubscriptionConfig)
    billing: BillingConfig = Field(default_factory=BillingConfig)
