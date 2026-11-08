import { describe, expect, it } from 'vitest'
import {
  assertGoalAllowed,
  isDeptEnabled,
  skillsFromConfig,
} from './entitlements'

describe('entitlements', () => {
  it('defaults demo-like growth plan', () => {
    const skills = skillsFromConfig(null)
    expect(skills.spend).toBe(true)
    expect(skills.seo).toBe(true)
    expect(skills.shopify).toBe(false)
    expect(skills.leads).toBe(false)
  })

  it('leadership always enabled; locked depts respect flags', () => {
    const skills = {
      spend: true,
      seo: false,
      shopify: false,
      leads: false,
    }
    expect(isDeptEnabled('direzione', skills)).toBe(true)
    expect(isDeptEnabled('spend', skills)).toBe(true)
    expect(isDeptEnabled('seo', skills)).toBe(false)
    expect(isDeptEnabled('shopify', skills)).toBe(false)
    expect(isDeptEnabled('lead', skills)).toBe(false)
  })

  it('blocks free-text for disabled skills', () => {
    const skills = {
      spend: true,
      seo: true,
      shopify: false,
      leads: false,
    }
    expect(assertGoalAllowed('report spend ultimi 7 giorni', skills)).toBeNull()
    expect(assertGoalAllowed('lead warming sequence', skills)).toMatch(/non attivo/)
  })
})
