"""policy.decision_rights → skill_requires_approval."""

from __future__ import annotations

from pathlib import Path

from monny.config.decision_rights import autonomy_for, skill_requires_approval
from monny.config.loader import load_tenant
from monny.config.models import DecisionRights

ROOT = Path(__file__).resolve().parents[1]


def test_demo_defaults_always_ask():
    tenant = load_tenant("demo", ROOT / "tenants")
    assert autonomy_for(tenant, "spend") == "always_ask"
    assert skill_requires_approval(tenant, "spend") is True
    assert skill_requires_approval(tenant, "seo") is True


def test_agent_resolves_skips_hitl():
    tenant = load_tenant("demo", ROOT / "tenants")
    tenant.policy.decision_rights = DecisionRights(spend="agent_resolves")
    assert skill_requires_approval(tenant, "spend") is False
    assert skill_requires_approval(tenant, "seo") is True


def test_within_policy_follows_auto_apply():
    tenant = load_tenant("demo", ROOT / "tenants")
    tenant.policy.decision_rights = DecisionRights(spend="within_policy", seo="within_policy")
    tenant.policy.spend.auto_apply.enabled = False
    tenant.policy.seo.auto_apply = False
    assert skill_requires_approval(tenant, "spend") is True
    assert skill_requires_approval(tenant, "seo") is True
    tenant.policy.spend.auto_apply.enabled = True
    tenant.policy.seo.auto_apply = True
    assert skill_requires_approval(tenant, "spend") is False
    assert skill_requires_approval(tenant, "seo") is False
