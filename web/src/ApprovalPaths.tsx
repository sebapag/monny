import { useState } from 'react'
import type { Approval, ApprovalDecision } from './api'

/** Skill-family ids used for delegate_to (aligned with policy.decision_rights). */
export const DELEGATE_TARGETS: { id: string; label: string }[] = [
  { id: 'spend', label: 'Spend pubblicitario' },
  { id: 'seo', label: 'SEO' },
  { id: 'shopify', label: 'Negozio Shopify' },
  { id: 'leads', label: 'Lead' },
  { id: 'operations', label: 'Operations' },
  { id: 'design', label: 'Graphic Designer' },
  { id: 'it', label: 'IT' },
  { id: 'controlling', label: 'Controlling' },
]

export type DecideHandler = (
  id: string,
  decision: ApprovalDecision,
  delegateTo?: string,
) => void

/**
 * Three-path escalation (Italian):
 * resolve within rights · delegate to another dept · escalate to human.
 * Rifiuta remains available as a hard stop.
 */
export function ApprovalPathActions({
  approval,
  onDecide,
  compact = false,
}: {
  approval: Approval
  onDecide: DecideHandler
  compact?: boolean
}) {
  const [delegateTo, setDelegateTo] = useState(
    DELEGATE_TARGETS.find((t) => t.id !== 'spend')?.id ?? 'seo',
  )
  const escalated = approval.status === 'escalated'
  const open = approval.status === 'pending' || escalated

  if (!open) return null

  return (
    <div className={`approval-paths${compact ? ' is-compact' : ''}`}>
      {escalated && (
        <p className="approval-escalated-badge" role="status">
          Scalata a decisione umana — puoi ancora risolvere o delegare
        </p>
      )}
      <div className="approval-paths-primary" role="group" aria-label="Percorsi di decisione">
        <button
          type="button"
          className="btn btn-ok"
          onClick={() => onDecide(approval.id, 'approved')}
          title="Risolvi entro i diritti di Leadership / agente"
        >
          Risolvi
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!delegateTo}
          onClick={() => onDecide(approval.id, 'delegated', delegateTo)}
          title="Passa la proposta a un altro reparto"
        >
          Delega
        </button>
        <select
          className="approval-delegate-select"
          aria-label="Reparto a cui delegare"
          value={delegateTo}
          onChange={(e) => setDelegateTo(e.target.value)}
        >
          {DELEGATE_TARGETS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {!escalated && (
          <button
            type="button"
            className="btn btn-warn"
            onClick={() => onDecide(approval.id, 'escalated')}
            title="Richiede conferma umana (HITL)"
          >
            Scala a umano
          </button>
        )}
      </div>
      <div className="approval-paths-secondary">
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => onDecide(approval.id, 'rejected')}
        >
          Rifiuta
        </button>
      </div>
    </div>
  )
}
