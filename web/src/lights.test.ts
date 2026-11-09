import { describe, expect, it } from 'vitest'
import {
  LIGHT_LINGER_MS,
  litDeptsFromRun,
  runNeedsLightTick,
  skillToDept,
  stepIsLingering,
} from './lights'
import type { AgentRun, TimelineStep } from './api'

function step(partial: Partial<TimelineStep> & Pick<TimelineStep, 'id' | 'skill' | 'status'>): TimelineStep {
  return {
    label: partial.label ?? partial.skill,
    detail: partial.detail ?? '',
    finished_at: partial.finished_at ?? null,
    started_at: partial.started_at ?? null,
    ...partial,
  }
}

describe('office room lights', () => {
  it('maps spend skills to the spend room', () => {
    expect(skillToDept('spend_google')).toBe('spend')
    expect(skillToDept('seo_audit')).toBe('seo')
    expect(skillToDept('knowledge')).toBe('spend')
    expect(skillToDept('ops_orders')).toBe('ops')
    expect(skillToDept('design_ads')).toBe('design')
    expect(skillToDept('it_access')).toBe('it')
    expect(skillToDept('ctrl_budget')).toBe('controlling')
    expect(skillToDept('planner')).toBeNull()
  })

  it('turns Spend on while spend_google is running', () => {
    const lit = litDeptsFromRun([
      step({
        id: '1',
        skill: 'spend_google',
        label: 'Spend · Google Ads',
        status: 'running',
        detail: 'Analizzo…',
      }),
      step({
        id: '2',
        skill: 'spend_meta',
        label: 'Spend · Meta',
        status: 'pending',
        detail: '',
      }),
    ])
    expect(lit.spend).toBe('on')
    expect(lit.seo).toBe('off')
    expect(lit.direzione).toBe('off')
  })

  it('lights SEO while seo_audit is running without lighting only Leadership', () => {
    const lit = litDeptsFromRun(
      [
        step({
          id: '1',
          skill: 'seo_crawler',
          status: 'done',
          finished_at: new Date(Date.now() - 5000).toISOString(),
        }),
        step({
          id: '2',
          skill: 'seo_audit',
          status: 'running',
        }),
        step({
          id: '3',
          skill: 'hitl',
          status: 'pending',
        }),
      ],
      'running',
      Date.now(),
      'seo_audit',
    )
    expect(lit.seo).toBe('on')
    expect(lit.direzione).toBe('off')
  })

  it('lights the active_skill room even if the step poll briefly lags', () => {
    const lit = litDeptsFromRun(
      [
        step({
          id: '1',
          skill: 'spend_meta',
          status: 'pending',
        }),
      ],
      'running',
      Date.now(),
      'spend_meta',
    )
    expect(lit.spend).toBe('on')
  })

  it('lights Direzione on HITL waiting / awaiting_approval', () => {
    const lit = litDeptsFromRun(
      [
        step({
          id: '1',
          skill: 'spend_google',
          label: 'Spend',
          status: 'done',
          detail: 'ok',
          finished_at: new Date(Date.now() - 10_000).toISOString(),
        }),
        step({
          id: '2',
          skill: 'hitl',
          label: 'Approvazione umana',
          status: 'waiting',
          detail: 'In attesa',
        }),
      ],
      'awaiting_approval',
    )
    expect(lit.direzione).toBe('on')
    expect(lit.spend).toBe('soft')
  })

  it('keeps room ON for ~1s after skill completes (linger)', () => {
    const now = Date.now()
    const lit = litDeptsFromRun(
      [
        step({
          id: '1',
          skill: 'spend_google',
          status: 'done',
          finished_at: new Date(now - 500).toISOString(),
        }),
      ],
      'running',
      now,
    )
    expect(lit.spend).toBe('on')
    expect(LIGHT_LINGER_MS).toBe(1000)
    expect(
      stepIsLingering(
        step({
          id: '1',
          skill: 'spend_google',
          status: 'done',
          finished_at: new Date(now - 500).toISOString(),
        }),
        now,
      ),
    ).toBe(true)
  })

  it('eases to soft after the linger window', () => {
    const now = Date.now()
    const lit = litDeptsFromRun(
      [
        step({
          id: '1',
          skill: 'seo_audit',
          status: 'done',
          finished_at: new Date(now - LIGHT_LINGER_MS - 50).toISOString(),
        }),
      ],
      'completed',
      now,
    )
    expect(lit.seo).toBe('soft')
  })

  it('signals when the UI should keep ticking during run and linger', () => {
    const now = Date.now()
    const running: AgentRun = {
      id: 'r0',
      tenant_id: 'demo',
      thread_id: 't1',
      goal: 'x',
      status: 'running',
      status_line: '',
      active_skill: 'spend_google',
      steps: [
        step({
          id: '1',
          skill: 'spend_google',
          status: 'running',
        }),
      ],
      approval_ids: [],
      created_at: '',
      updated_at: '',
    }
    expect(runNeedsLightTick(running, now)).toBe(true)

    const lingering: AgentRun = {
      id: 'r1',
      tenant_id: 'demo',
      thread_id: 't1',
      goal: 'x',
      status: 'running',
      status_line: '',
      steps: [
        step({
          id: '1',
          skill: 'spend_meta',
          status: 'done',
          finished_at: new Date(now - 200).toISOString(),
        }),
      ],
      approval_ids: [],
      created_at: '',
      updated_at: '',
    }
    expect(runNeedsLightTick(lingering, now)).toBe(true)

    const cooled: AgentRun = {
      ...lingering,
      status: 'completed',
      active_skill: null,
      steps: [
        step({
          id: '1',
          skill: 'spend_meta',
          status: 'done',
          finished_at: new Date(now - LIGHT_LINGER_MS - 50).toISOString(),
        }),
      ],
    }
    expect(runNeedsLightTick(cooled, now)).toBe(false)

    const awaiting: AgentRun = {
      id: 'r2',
      tenant_id: 'demo',
      thread_id: 't1',
      goal: 'x',
      status: 'awaiting_approval',
      status_line: '',
      active_skill: 'hitl',
      steps: [
        step({
          id: '1',
          skill: 'spend_google',
          status: 'done',
          finished_at: new Date(now - 10_000).toISOString(),
        }),
        step({
          id: '2',
          skill: 'hitl',
          status: 'waiting',
        }),
      ],
      approval_ids: ['a1'],
      created_at: '',
      updated_at: '',
    }
    expect(runNeedsLightTick(awaiting, now)).toBe(false)
  })
})
