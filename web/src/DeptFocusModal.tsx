import { useEffect } from 'react'
import type { Approval } from './api'
import {
  buildDeptFocusMetrics,
  deptFocusTitle,
  metricSourceLabelIt,
  type AuditEvent,
  type DeptMetricRow,
} from './deptFocus'
import { filterApprovals, getDept, type DeptId } from './depts'
import { plainApproval } from './labels'
import type { RoomLightState } from './lights'
import type { TimelineStep } from './api'

export function DeptFocusModal({
  dept,
  pendingApprovals,
  audit,
  sessionQueries,
  light,
  liveSteps,
  officeOpens,
  onClose,
  onOpenFullPanel,
  onDecide,
}: {
  dept: DeptId
  pendingApprovals: Approval[]
  audit: AuditEvent[]
  sessionQueries: number
  light: RoomLightState
  liveSteps: TimelineStep[]
  officeOpens: number
  onClose: () => void
  onOpenFullPanel: () => void
  onDecide?: (id: string, decision: 'approved' | 'rejected') => void
}) {
  const def = getDept(dept)
  const pending = filterApprovals(pendingApprovals, dept)
  const metrics: DeptMetricRow[] = buildDeptFocusMetrics({
    dept,
    pendingApprovals,
    audit,
    sessionQueries,
    light,
    liveSteps,
    officeOpens,
  })
  const title = deptFocusTitle(dept)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="dept-focus-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="dept-focus-modal"
    >
      <div
        className={`dept-focus-modal tint-${def?.tint ?? 'gray'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dept-focus-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dept-focus-head">
          <div>
            <p className="dept-focus-kicker">Reparto · focus ufficio</p>
            <h2 id="dept-focus-title">{title}</h2>
            {def?.blurb && <p className="dept-focus-blurb">{def.blurb}</p>}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Chiudi e torna alla vista ufficio"
            data-testid="dept-focus-close"
          >
            Chiudi
          </button>
        </div>

        <section className="dept-focus-section" aria-labelledby="dept-focus-decisions">
          <h3 id="dept-focus-decisions">Decisioni in attesa</h3>
          {pending.length === 0 ? (
            <p className="dept-focus-empty">Nessuna decisione in sospeso per questo reparto.</p>
          ) : (
            <ul className="dept-focus-decision-list">
              {pending.map((a) => {
                const plain = plainApproval(a)
                return (
                  <li key={a.id} className="dept-focus-decision">
                    <strong>{plain.title}</strong>
                    <p>{plain.reasonLine}</p>
                    <p className="dept-focus-why">{plain.why}</p>
                    {onDecide && (
                      <div className="dept-focus-decision-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => onDecide(a.id, 'approved')}
                        >
                          Approva
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => onDecide(a.id, 'rejected')}
                        >
                          Rifiuta
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="dept-focus-section" aria-labelledby="dept-focus-metrics">
          <h3 id="dept-focus-metrics">Metriche del reparto</h3>
          <p className="dept-focus-metrics-note">
            Contatori dall’API (audit / approvazioni), dalla sessione e dallo stato luci. Le voci
            «Stimato» sono solo su questo browser.
          </p>
          <dl className="dept-focus-metrics">
            {metrics.map((m) => (
              <div key={m.id} className="dept-focus-metric">
                <dt>
                  {m.label}
                  <span className={`metric-source is-${m.source}`}>
                    {metricSourceLabelIt(m.source)}
                  </span>
                </dt>
                <dd>
                  <strong>{m.value}</strong>
                  {m.hint && <span className="metric-hint">{m.hint}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="dept-focus-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            data-testid="dept-focus-back-office"
          >
            ← Indietro · Vista ufficio
          </button>
          <button type="button" className="btn btn-ghost" onClick={onOpenFullPanel}>
            Apri pannello completo
          </button>
        </div>
      </div>
    </div>
  )
}
