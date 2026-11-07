import { describe, expect, it } from 'vitest'
import { litDeptsFromRun, skillToDept } from './lights'

describe('office room lights', () => {
  it('maps spend skills to the spend room', () => {
    expect(skillToDept('spend_google')).toBe('spend')
    expect(skillToDept('seo_audit')).toBe('seo')
    expect(skillToDept('planner')).toBeNull()
  })

  it('turns Spend on while spend_google is running', () => {
    const lit = litDeptsFromRun([
      {
        id: '1',
        skill: 'spend_google',
        label: 'Spend · Google Ads',
        status: 'running',
        detail: 'Analizzo…',
      },
      {
        id: '2',
        skill: 'spend_meta',
        label: 'Spend · Meta',
        status: 'pending',
        detail: '',
      },
    ])
    expect(lit.spend).toBe('on')
    expect(lit.seo).toBe('off')
    expect(lit.direzione).toBe('off')
  })

  it('lights Direzione on HITL waiting / awaiting_approval', () => {
    const lit = litDeptsFromRun(
      [
        {
          id: '1',
          skill: 'spend_google',
          label: 'Spend',
          status: 'done',
          detail: 'ok',
        },
        {
          id: '2',
          skill: 'hitl',
          label: 'Approvazione umana',
          status: 'waiting',
          detail: 'In attesa',
        },
      ],
      'awaiting_approval',
    )
    expect(lit.direzione).toBe('on')
    expect(lit.spend).toBe('soft')
  })
})
