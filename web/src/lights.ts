import type { AgentRun, TimelineStep } from './api'
import { DEPARTMENTS, type DeptId } from './depts'

export type RoomLightState = 'off' | 'soft' | 'on'

/**
 * Keep room lights (and lit ometti) fully ON this long after a skill finishes.
 * Working rooms stay lit for the whole execution window, then this linger, then fade.
 */
export const LIGHT_LINGER_MS = 1000

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

function emptyLights(): Record<DeptId, RoomLightState> {
  return {
    direzione: 'off',
    spend: 'off',
    seo: 'off',
    shopify: 'off',
    lead: 'off',
    ops: 'off',
    design: 'off',
    it: 'off',
    controlling: 'off',
  }
}

/**
 * Which rooms should light up from a live run timeline.
 * - running / waiting → on for that skill’s room (and ometti) for the whole execution
 * - done/error within LIGHT_LINGER_MS → still on (1s linger before fade)
 * - done older than linger → soft (recent activity)
 * - active_skill (if set) → that room on (belt-and-suspenders with step status)
 * - awaiting_approval status → direzione on (Leadership HITL cue; extra to working-room lights)
 */
export function litDeptsFromRun(
  steps: TimelineStep[],
  runStatus?: string | null,
  nowMs: number = Date.now(),
  activeSkill?: string | null,
): Record<DeptId, RoomLightState> {
  const state = emptyLights()

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

  // Prefer the store’s active_skill so a room stays lit even if a poll gaps a step edge.
  if (activeSkill) {
    const dept = skillToDept(activeSkill)
    if (dept) raise(dept, 'on')
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
  if (!run) return emptyLights()
  return litDeptsFromRun(run.steps, run.status, nowMs, run.active_skill)
}

/**
 * True while the UI should keep a clock tick so linger → soft/off (and mid-run
 * finishes) re-render on time. Ticks for the whole execution window; HITL
 * waiting is steady-state (Leadership stays on without a clock).
 */
export function runNeedsLightTick(run: AgentRun | null, nowMs: number = Date.now()): boolean {
  if (!run) return false
  if (run.status === 'running' || run.status === 'queued') return true
  if (run.steps.some((step) => step.status === 'running')) return true
  return run.steps.some((step) => stepIsLingering(step, nowMs))
}
