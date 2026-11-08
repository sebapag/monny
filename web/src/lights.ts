import type { AgentRun, TimelineStep } from './api'
import { DEPARTMENTS, type DeptId } from './depts'

export type RoomLightState = 'off' | 'soft' | 'on'

/** Keep room lights (and lit ometti) fully ON this long after a skill finishes. */
export const LIGHT_LINGER_MS = 2000

/** Map a skill id to its office room (null = planner / unknown). */
export function skillToDept(skill: string): DeptId | null {
  for (const d of DEPARTMENTS) {
    if (d.skills.includes(skill)) return d.id
  }
  return null
}

function finishedAtMs(step: TimelineStep): number | null {
  if (!step.finished_at) return null
  const t = Date.parse(step.finished_at)
  return Number.isNaN(t) ? null : t
}

/** True while a finished skill is still in the post-complete linger window. */
export function stepIsLingering(step: TimelineStep, nowMs: number = Date.now()): boolean {
  if (step.status !== 'done' && step.status !== 'error') return false
  const finished = finishedAtMs(step)
  if (finished == null) return false
  return nowMs - finished < LIGHT_LINGER_MS
}

/**
 * Which rooms should light up from a live run timeline.
 * - running / waiting → on
 * - done/error within LIGHT_LINGER_MS → still on (linger before fade)
 * - done older than linger → soft (recent activity)
 * - awaiting_approval status → direzione on
 */
export function litDeptsFromRun(
  steps: TimelineStep[],
  runStatus?: string | null,
  nowMs: number = Date.now(),
): Record<DeptId, RoomLightState> {
  const state: Record<DeptId, RoomLightState> = {
    direzione: 'off',
    spend: 'off',
    seo: 'off',
    shopify: 'off',
    lead: 'off',
  }

  const rank = (s: RoomLightState) => (s === 'on' ? 2 : s === 'soft' ? 1 : 0)
  const raise = (dept: DeptId, next: RoomLightState) => {
    if (rank(next) > rank(state[dept])) state[dept] = next
  }

  for (const step of steps) {
    const dept = skillToDept(step.skill)
    if (!dept) continue
    if (step.status === 'running') {
      raise(dept, 'on')
    } else if (step.status === 'waiting') {
      raise(dept, 'on')
      if (dept !== 'direzione') raise('direzione', 'on')
    } else if (stepIsLingering(step, nowMs)) {
      raise(dept, 'on')
    } else if (step.status === 'done') {
      raise(dept, 'soft')
    }
  }

  if (runStatus === 'awaiting_approval') {
    raise('direzione', 'on')
  }

  return state
}

export function litDeptsFromAgentRun(
  run: AgentRun | null,
  nowMs: number = Date.now(),
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
  return litDeptsFromRun(run.steps, run.status, nowMs)
}

/** True if any finished step is still inside the linger window (UI should tick). */
export function runNeedsLightTick(run: AgentRun | null, nowMs: number = Date.now()): boolean {
  if (!run) return false
  return run.steps.some((step) => stepIsLingering(step, nowMs))
}
