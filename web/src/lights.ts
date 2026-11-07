import type { AgentRun, TimelineStep } from './api'
import { DEPARTMENTS, type DeptId } from './depts'

export type RoomLightState = 'off' | 'soft' | 'on'

/** Map a skill id to its office room (null = planner / unknown). */
export function skillToDept(skill: string): DeptId | null {
  for (const d of DEPARTMENTS) {
    if (d.skills.includes(skill)) return d.id
  }
  return null
}

/**
 * Which rooms should light up from a live run timeline.
 * - running → on
 * - waiting (HITL) → direzione on
 * - done in this run → soft (recent activity)
 * - awaiting_approval status → direzione on
 */
export function litDeptsFromRun(
  steps: TimelineStep[],
  runStatus?: string | null,
): Record<DeptId, RoomLightState> {
  const state: Record<DeptId, RoomLightState> = {
    direzione: 'off',
    spend: 'off',
    seo: 'off',
    shopify: 'off',
    lead: 'off',
  }

  for (const step of steps) {
    const dept = skillToDept(step.skill)
    if (!dept) continue
    if (step.status === 'running') {
      state[dept] = 'on'
    } else if (step.status === 'waiting') {
      state[dept] = 'on'
      if (dept !== 'direzione') state.direzione = 'on'
    } else if (step.status === 'done' && state[dept] === 'off') {
      state[dept] = 'soft'
    }
  }

  if (runStatus === 'awaiting_approval') {
    state.direzione = 'on'
  }

  return state
}

export function litDeptsFromAgentRun(
  run: AgentRun | null,
): Record<DeptId, RoomLightState> {
  if (!run) {
    return {
      direzione: 'off',
      spend: 'off',
      seo: 'off',
      shopify: 'off',
      lead: 'off',
    }
  }
  return litDeptsFromRun(run.steps, run.status)
}
