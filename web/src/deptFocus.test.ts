import { describe, expect, it } from 'vitest'
import { buildDeptFocusMetrics } from './deptFocus'
import type { Approval, AuditEvent } from './api'

describe('buildDeptFocusMetrics', () => {
  it('counts pending, audit skill hits, and labels sources', () => {
    const pending: Approval[] = [
      {
        id: 'a1',
        tenant_id: 'demo',
        thread_id: 't',
        action_type: 'pause_campaign',
        summary: 'Pause',
        payload: { channel: 'google' },
        status: 'pending',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]
    const audit: AuditEvent[] = [
      {
        ts: '2026-01-02T00:00:00Z',
        tenant_id: 'demo',
        event: 'skills_ran',
        payload: { plan: ['spend_google', 'reporting'] },
      },
      {
        ts: '2026-01-03T00:00:00Z',
        tenant_id: 'demo',
        event: 'approval_approved',
        payload: { action_type: 'reduce_budget' },
      },
    ]
    const rows = buildDeptFocusMetrics({
      dept: 'spend',
      pendingApprovals: pending,
      audit,
      sessionQueries: 2,
      light: 'soft',
      liveSteps: [],
      officeOpens: 3,
    })
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.pending.value).toBe(1)
    expect(byId['session-queries'].value).toBe(2)
    // spend_google + reporting both map to Media/spend
    expect(byId['audit-skills'].value).toBe(2)
    expect(byId['audit-runs'].value).toBe(1)
    expect(byId['audit-decided'].value).toBe(1)
    expect(byId.lights.value).toBe('In spegnimento')
    expect(byId['office-opens'].source).toBe('stimato')
  })
})
