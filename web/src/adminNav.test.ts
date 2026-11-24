import { describe, expect, it } from 'vitest'
import { hashForAdmin, isAdminSectionId, parseAdminPath } from './adminNav'
import { hashFor, parseHash } from './depts'

describe('adminNav', () => {
  it('parses hub and section paths', () => {
    expect(parseAdminPath('admin')).toEqual({ mode: 'admin', section: null })
    expect(parseAdminPath('/admin/spend')).toEqual({ mode: 'admin', section: 'spend' })
    expect(parseAdminPath('admin/ads')).toEqual({ mode: 'admin', section: 'ads' })
    expect(parseAdminPath('admin/connectors')).toEqual({
      mode: 'admin',
      section: 'connectors',
    })
    expect(parseAdminPath('admin/nope')?.section).toBeNull()
    expect(parseAdminPath('agent')).toBeNull()
  })

  it('wires hash helpers', () => {
    expect(hashForAdmin(null)).toBe('#admin')
    expect(hashForAdmin('spend')).toBe('#admin/spend')
    expect(hashForAdmin('connectors')).toBe('#admin/connectors')
    expect(isAdminSectionId('knowledge')).toBe(true)
    expect(isAdminSectionId('connectors')).toBe(true)
    expect(isAdminSectionId('foo')).toBe(false)
  })

  it('parseHash / hashFor round-trip admin sections', () => {
    expect(parseHash('#admin')).toEqual({ mode: 'admin', section: null })
    expect(parseHash('#admin/plan')).toEqual({ mode: 'admin', section: 'plan' })
    expect(parseHash('#admin/connectors')).toEqual({ mode: 'admin', section: 'connectors' })
    expect(hashFor({ mode: 'admin', section: 'users' })).toBe('#admin/users')
    expect(hashFor({ mode: 'admin', section: 'connectors' })).toBe('#admin/connectors')
    expect(hashFor({ mode: 'admin' })).toBe('#admin')
  })
})
