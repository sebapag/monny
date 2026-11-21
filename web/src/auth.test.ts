import { beforeEach, describe, expect, it } from 'vitest'
import {
  canAccessAdmin,
  canAccessAgent,
  clearSession,
  loadStoredToken,
  loadStoredUser,
  persistSession,
} from './auth'

describe('auth role gates', () => {
  beforeEach(() => {
    clearSession()
  })

  it('agent cannot open Admin; admin can use both', () => {
    expect(canAccessAgent('agent')).toBe(true)
    expect(canAccessAdmin('agent')).toBe(false)
    expect(canAccessAgent('admin')).toBe(true)
    expect(canAccessAdmin('admin')).toBe(true)
  })

  it('persists and clears session', () => {
    persistSession('tok', {
      email: 'agent@demo',
      display_name: 'Agent Demo',
      role: 'agent',
      tenant_id: 'demo',
    })
    expect(loadStoredToken()).toBe('tok')
    expect(loadStoredUser()?.role).toBe('agent')
    clearSession()
    expect(loadStoredToken()).toBeNull()
    expect(loadStoredUser()).toBeNull()
  })
})
