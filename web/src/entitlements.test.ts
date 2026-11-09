import { describe, expect, it } from 'vitest'
import {
  assertGoalAllowed,
  effectiveOfficeMode,
  featuresFromConfig,
  isDeptEnabled,
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
      plan: 'growth',
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
  it('defaults demo-like growth plan', () => {
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

  it('office_view gates mode choice; default is auto', () => {
    expect(featuresFromConfig(null).office_view).toBe(false)
    expect(effectiveOfficeMode(null)).toBe('auto')

    const locked = stubConfig({
      features: { office_view: false },
      office_mode: 'full',
    })
    expect(effectiveOfficeMode(locked)).toBe('auto')

    const entitled = stubConfig({
      features: { office_view: true },
      office_mode: 'light',
    })
    expect(effectiveOfficeMode(entitled)).toBe('light')
    expect(effectiveOfficeMode(stubConfig({ features: { office_view: true }, office_mode: 'full' }))).toBe(
      'full',
    )
  })
})
