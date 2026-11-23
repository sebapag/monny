import { describe, expect, it } from 'vitest'
import {
  chargeExplainers,
  defaultBilling,
  formatEuro,
  monthPeriodLabelIt,
  nextRenewalLabelIt,
  planLabelIt,
  spendProgressPct,
} from './adminBilling'

describe('adminBilling', () => {
  it('formats euro in Italian', () => {
    const big = formatEuro(2015.5)
    expect(big).toMatch(/2015[,.]50/)
    expect(big).toMatch(/€/)
    expect(formatEuro(79)).toMatch(/79/)
  })

  it('labels the current month in Italian', () => {
    const label = monthPeriodLabelIt(new Date('2026-11-22T12:00:00Z'))
    expect(label).toContain('2026')
    expect(label.toLowerCase()).toContain('nov')
  })

  it('computes next renewal after today', () => {
    const now = new Date(2026, 10, 22) // 22 Nov 2026 local
    expect(nextRenewalLabelIt(1, now)).toBe('1 dicembre 2026')
    expect(nextRenewalLabelIt(25, now)).toBe('25 novembre 2026')
  })

  it('caps spend progress at 100%', () => {
    expect(spendProgressPct(500, 1000)).toBe(50)
    expect(spendProgressPct(1500, 1000)).toBe(100)
    expect(spendProgressPct(10, 0)).toBe(0)
  })

  it('explains who charges what in plain Italian', () => {
    const billing = defaultBilling({
      renews_on_day: 1,
      atrium_price_eur: 79,
      ads_spent_this_month_eur: 100,
      ads_monthly_budget_eur: 2500,
    })
    const copy = chargeExplainers(billing, 'growth', new Date(2026, 10, 22))
    expect(copy.atrium).toMatch(/Abbonamento Atrium Growth/)
    expect(copy.atrium).toMatch(/79/)
    expect(copy.ads).toMatch(/Google e Meta/)
    expect(planLabelIt('growth')).toBe('Growth')
  })
})
