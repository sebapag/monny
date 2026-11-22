import { describe, expect, it } from 'vitest'
import {
  assertGoalAllowed,
  effectiveOfficeMode,
  featuresFromConfig,
  isCatalogSkillAllowed,
  isDeptEnabled,
  isPlusEntitled,
  normalizePlan,
  skillsFromConfig,
} from './entitlements'
import type { TenantConfig } from './api'

function stubConfig(partial: Partial<TenantConfig['subscription']>): TenantConfig {
  return {
    tenant_id: 'demo',
    display_name: 'Demo',
    shopify: {
      shop_domain: 'x.myshopify.com',
      api_version: '2025-10',
      auth: { secret_ref: 'X' },
      scopes_expected: [],
    },
    ads: {},
    site: { base_url: 'https://x.example', cms_adapter: 'generic_http', locales: ['it'] },
    policy: {
      hitl_default: true,
      spend: {
        max_budget_delta_pct: 15,
        auto_apply: { enabled: false, allow: [] },
        thresholds: { min_roas: 2, max_cpa: 40, lookback_days: 14 },
      },
      seo: { auto_apply: false, max_urls_per_run: 50 },
    },
    subscription: {
      plan: 'plus',
      plus_override: false,
      skills: {
        spend: true,
        seo: true,
        shopify: false,
        leads: false,
        operations: false,
        design: false,
        it: false,
        controlling: false,
      },
      features: { office_view: false },
      office_mode: 'auto',
      ...partial,
    },
  }
}

describe('entitlements', () => {
  it('defaults demo-like growth/plus plan skills', () => {
    const skills = skillsFromConfig(null)
    expect(skills.spend).toBe(true)
    expect(skills.seo).toBe(true)
    expect(skills.shopify).toBe(false)
    expect(skills.leads).toBe(false)
    expect(skills.operations).toBe(false)
    expect(skills.design).toBe(false)
    expect(skills.it).toBe(false)
    expect(skills.controlling).toBe(false)
  })

  it('normalizes legacy plans to free|plus', () => {
    expect(normalizePlan('starter')).toBe('free')
    expect(normalizePlan('growth')).toBe('plus')
    expect(normalizePlan('scale')).toBe('plus')
    expect(normalizePlan('free')).toBe('free')
  })

  it('leadership always enabled; locked depts respect flags', () => {
    const skills = {
      spend: true,
      seo: false,
      shopify: false,
      leads: false,
      operations: true,
      design: false,
      it: true,
      controlling: false,
    }
    expect(isDeptEnabled('direzione', skills)).toBe(true)
    expect(isDeptEnabled('spend', skills)).toBe(true)
    expect(isDeptEnabled('seo', skills)).toBe(false)
    expect(isDeptEnabled('shopify', skills)).toBe(false)
    expect(isDeptEnabled('lead', skills)).toBe(false)
    expect(isDeptEnabled('ops', skills)).toBe(true)
    expect(isDeptEnabled('design', skills)).toBe(false)
    expect(isDeptEnabled('it', skills)).toBe(true)
    expect(isDeptEnabled('controlling', skills)).toBe(false)
  })

  it('blocks free-text for disabled skills', () => {
    const skills = {
      spend: true,
      seo: true,
      shopify: false,
      leads: false,
      operations: false,
      design: false,
      it: false,
      controlling: false,
    }
    expect(assertGoalAllowed('report spend ultimi 7 giorni', skills)).toBeNull()
    expect(assertGoalAllowed('lead warming sequence', skills)).toMatch(/non attivo/)
    expect(assertGoalAllowed('stato ordini fulfillment', skills)).toMatch(/Operations/)
    expect(assertGoalAllowed('accessi e credenziali da completare', skills)).toMatch(/IT/)
  })

  it('gates plus deep skills by plan / override', () => {
    const free = stubConfig({ plan: 'free', plus_override: false })
    expect(isPlusEntitled(free)).toBe(false)
    expect(isCatalogSkillAllowed('spend_google', free)).toBe(true)
    expect(isCatalogSkillAllowed('spend_deep_optimize', free)).toBe(false)
    expect(
      assertGoalAllowed('spend deep optimize packaging report roas', free.subscription!.skills, free),
    ).toMatch(/Plus/)

    const override = stubConfig({ plan: 'free', plus_override: true })
    expect(isCatalogSkillAllowed('spend_deep_optimize', override)).toBe(true)
    expect(
      assertGoalAllowed(
        'spend deep optimize packaging report roas',
        override.subscription!.skills,
        override,
      ),
    ).toBeNull()
  })

  it('office mode is available to everyone; default full 3D', () => {
    expect(featuresFromConfig(null).office_view).toBe(true)
    expect(effectiveOfficeMode(null)).toBe('full')

    // office_view flag no longer gates the preference (market rule).
    const preferred = stubConfig({
      features: { office_view: false },
      office_mode: 'light',
    })
    expect(effectiveOfficeMode(preferred)).toBe('light')
    expect(effectiveOfficeMode(stubConfig({ features: { office_view: true }, office_mode: 'full' }))).toBe(
      'full',
    )
  })
})
