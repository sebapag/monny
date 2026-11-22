import { beforeEach, describe, expect, it } from 'vitest'
import { fixturesApi } from './fixturesBackend'

describe('fixtures backend (CI without Supabase)', () => {
  beforeEach(async () => {
    await fixturesApi.logout()
  })

  it('logs in demo agent and starts a run with HITL', async () => {
    const login = await fixturesApi.login('agent@demo', 'agent-demo')
    expect(login.user.role).toBe('agent')
    expect(login.backend).toBe('fixtures')

    const run = await fixturesApi.startRun({
      tenant_id: 'demo',
      message: 'report spend ultimi 7 giorni',
    })
    expect(run.approval_ids.length).toBeGreaterThan(0)
    expect(run.status).toBe('awaiting_approval')

    const approvals = await fixturesApi.listApprovals('demo')
    expect(approvals.some((a) => a.id === run.approval_ids[0])).toBe(true)
  })

  it('blocks agent from admin knowledge list', async () => {
    await fixturesApi.login('agent@demo', 'agent-demo')
    await expect(fixturesApi.listKnowledge('demo')).rejects.toThrow(/Admin/)
  })

  it('allows admin tenant put and keeps office_view on', async () => {
    await fixturesApi.login('admin@demo', 'admin-demo')
    const detail = await fixturesApi.getTenant('demo')
    const cfg = detail.config
    cfg.display_name = 'Demo Updated'
    if (cfg.subscription?.features) cfg.subscription.features.office_view = false
    await fixturesApi.putTenant('demo', cfg)
    const again = await fixturesApi.getTenant('demo')
    expect(again.config.subscription?.features?.office_view).toBe(true)
  })
})
