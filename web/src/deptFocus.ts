import type { Approval, AuditEvent, TimelineStep } from './api'
import {
  DEPARTMENTS,
  approvalDept,
  filterApprovals,
  filterSteps,
  type DeptId,
} from './depts'
import { skillToDept, type RoomLightState } from './lights'

export type { AuditEvent }

export type MetricSource = 'live' | 'session' | 'audit' | 'stimato'

export type DeptMetricRow = {
  id: string
  label: string
  value: number | string
  hint?: string
  source: MetricSource
}

const SOURCE_LABEL_IT: Record<MetricSource, string> = {
  live: 'Live',
  session: 'Sessione',
  audit: 'Audit',
  stimato: 'Stimato',
}

export function metricSourceLabelIt(source: MetricSource): string {
  return SOURCE_LABEL_IT[source]
}

function skillActivationsFromAudit(audit: AuditEvent[], dept: DeptId): number {
  let n = 0
  for (const row of audit) {
    if (row.event !== 'skills_ran') continue
    const plan = row.payload?.plan
    if (!Array.isArray(plan)) continue
    for (const skill of plan) {
      if (typeof skill === 'string' && skillToDept(skill) === dept) n += 1
    }
  }
  return n
}

function decidedFromAudit(audit: AuditEvent[], dept: DeptId): number {
  let n = 0
  for (const row of audit) {
    if (row.event !== 'approval_approved' && row.event !== 'approval_rejected') continue
    // Audit payload has action_type; map via a synthetic Approval-like object.
    const action = String(row.payload?.action_type || '')
    const fake = {
      action_type: action,
      payload: row.payload || {},
    } as Approval
    const d = approvalDept(fake)
    if (dept === 'direzione' || d === dept) n += 1
  }
  return n
}

function runsFromAudit(audit: AuditEvent[], dept: DeptId): number {
  // skills_ran rows that touched this dept count as a run involvement.
  let n = 0
  for (const row of audit) {
    if (row.event !== 'skills_ran') continue
    const plan = row.payload?.plan
    if (!Array.isArray(plan)) continue
    const hit = plan.some(
      (skill) => typeof skill === 'string' && skillToDept(skill) === dept,
    )
    if (hit) n += 1
  }
  return n
}

/** Session-only office open counter (localStorage). Labeled as stimato/session. */
export function bumpOfficeFocusCount(tenantId: string, dept: DeptId): number {
  const key = `atrium.officeFocus.${tenantId}.${dept}`
  try {
    const next = (Number(localStorage.getItem(key) || '0') || 0) + 1
    localStorage.setItem(key, String(next))
    return next
  } catch {
    return 1
  }
}

export function readOfficeFocusCount(tenantId: string, dept: DeptId): number {
  try {
    return Number(localStorage.getItem(`atrium.officeFocus.${tenantId}.${dept}`) || '0') || 0
  } catch {
    return 0
  }
}

export function buildDeptFocusMetrics(opts: {
  dept: DeptId
  pendingApprovals: Approval[]
  audit: AuditEvent[]
  sessionQueries: number
  light: RoomLightState
  liveSteps: TimelineStep[]
  officeOpens: number
}): DeptMetricRow[] {
  const { dept, pendingApprovals, audit, sessionQueries, light, liveSteps, officeOpens } =
    opts
  const pending = filterApprovals(pendingApprovals, dept).length
  const skillHits = skillActivationsFromAudit(audit, dept)
  const runs = runsFromAudit(audit, dept)
  const decided = decidedFromAudit(audit, dept)
  const liveDeptSteps = filterSteps(liveSteps, dept)
  const liveDone = liveDeptSteps.filter((s) => s.status === 'done').length
  const liveRunning = liveDeptSteps.filter(
    (s) => s.status === 'running' || s.status === 'waiting',
  ).length

  const lightLabel =
    light === 'on' ? 'Accese' : light === 'soft' ? 'In spegnimento' : 'Spente'

  const rows: DeptMetricRow[] = [
    {
      id: 'pending',
      label: 'Decisioni in attesa',
      value: pending,
      hint: 'Dalle approvazioni aperte',
      source: 'live',
    },
    {
      id: 'session-queries',
      label: 'Richieste in questa sessione',
      value: sessionQueries,
      hint: 'Messaggi inviati da questo browser',
      source: 'session',
    },
    {
      id: 'audit-runs',
      label: 'Esecuzioni che hanno toccato il reparto',
      value: runs,
      hint: audit.length
        ? 'Da audit.jsonl (skills_ran)'
        : 'Nessuno storico audit sul server',
      source: 'audit',
    },
    {
      id: 'audit-skills',
      label: 'Attivazioni skill (audit)',
      value: skillHits,
      hint: 'Conteggi skill nel piano registrato',
      source: 'audit',
    },
    {
      id: 'audit-decided',
      label: 'Decisioni già chiuse (audit)',
      value: decided,
      hint: 'Approvate o rifiutate nel log',
      source: 'audit',
    },
    {
      id: 'live-steps',
      label: 'Passi nel run corrente',
      value: liveRunning > 0 ? `${liveRunning} in corso · ${liveDone} fatti` : liveDone,
      hint: liveDeptSteps.length ? 'Timeline live' : 'Nessun run attivo su questo reparto',
      source: 'live',
    },
    {
      id: 'lights',
      label: 'Luci stanza',
      value: lightLabel,
      hint: 'Stato attuale ufficio 3D',
      source: 'live',
    },
    {
      id: 'office-opens',
      label: 'Aperture dall’ufficio',
      value: officeOpens,
      hint: 'Solo questo browser (stimato · localStorage)',
      source: 'stimato',
    },
  ]

  return rows
}

export function deptFocusTitle(dept: DeptId): string {
  const def = DEPARTMENTS.find((d) => d.id === dept)
  return def?.name ?? dept
}
