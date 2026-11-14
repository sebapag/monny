import { describe, expect, it } from 'vitest'
import {
  reportIsUserFacing,
  reportPopupSummary,
  reportPopupTitle,
} from './labels'
import type { Report } from './api'

describe('reportIsUserFacing', () => {
  it('is false for empty / missing reports', () => {
    expect(reportIsUserFacing(null)).toBe(false)
    expect(reportIsUserFacing(undefined)).toBe(false)
    expect(reportIsUserFacing({})).toBe(false)
    expect(reportIsUserFacing({ markdown: '   ' })).toBe(false)
  })

  it('is true for ads, seo, or markdown reports', () => {
    expect(reportIsUserFacing({ markdown: '# Ciao' })).toBe(true)
    expect(
      reportIsUserFacing({
        spend_channels: [
          {
            channel: 'google',
            totals: {
              campaigns: 1,
              healthy: 1,
              waste: 0,
              spend: 10,
              waste_spend: 0,
              waste_spend_pct: 0,
            },
            campaigns: [],
          },
        ],
      }),
    ).toBe(true)
    expect(
      reportIsUserFacing({
        seo_change_set: {
          changes: [
            {
              url: '/a',
              before: {},
              after: { title: 'Nuovo' },
            },
          ],
        },
      }),
    ).toBe(true)
  })
})

describe('reportPopupTitle / summary', () => {
  it('labels ads reports in Italian', () => {
    const report: Report = {
      spend_channels: [
        {
          channel: 'meta',
          totals: {
            campaigns: 2,
            healthy: 1,
            waste: 1,
            spend: 40,
            waste_spend: 12,
            waste_spend_pct: 30,
          },
          campaigns: [
            { name: 'Retargeting', channel: 'meta', roas: 3.2, spend: 20, healthy: true },
          ],
        },
      ],
      top_campaigns: [
        { name: 'Retargeting', channel: 'meta', roas: 3.2, spend: 20, healthy: true },
      ],
    }
    expect(reportPopupTitle(report)).toBe('Report ads pronto')
    expect(reportPopupSummary(report)).toContain('Retargeting')
  })

  it('labels SEO reports in Italian', () => {
    const report: Report = {
      seo_change_set: {
        changes: [{ url: '/x', before: {}, after: { title: 'T' } }],
      },
    }
    expect(reportPopupTitle(report)).toBe('Report SEO pronto')
    expect(reportPopupSummary(report)).toMatch(/SEO/i)
  })
})
