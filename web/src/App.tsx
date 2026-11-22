import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentRun,
  type Approval,
  type DecisionAutonomy,
  type DecisionRights,
  type KnowledgeSource,
  type Report,
  type SeoChange,
  type SpendCampaign,
  type SpendDiagnosis,
  type TenantConfig,
  type TenantDetail,
  type TenantListItem,
  type TimelineStep,
  createAuthUser,
  decideApproval,
  fetchHealth,
  fetchMe,
  getRun,
  getTenant,
  getTenantArtifact,
  listApprovals,
  listAuthUsers,
  listKnowledge,
  listTenantArtifacts,
  listTenantAudit,
  listTenants,
  login,
  logout,
  type AuditEvent,
  putTenant,
  signup,
  startRun,
  toggleKnowledgeSource,
  updateAuthUser,
} from './api'
import {
  type AuthRole,
  type AuthUser,
  canAccessAdmin,
  clearSession,
  loadStoredToken,
  loadStoredUser,
  persistSession,
} from './auth'
import { isSupabaseRuntime } from './runtime'
import { LoginScreen } from './LoginScreen'
import { ApprovalPathActions, type DecideHandler } from './ApprovalPaths'
import {
  type DeptId,
  type RouteState,
  countByDept,
  filterApprovals,
  filterSteps,
  getDept,
  hashFor,
  parseHash,
} from './depts'
import {
  friendlyAgentReply,
  friendlyDecideNote,
  friendlySkillDetail,
  plainApproval,
  reportIsUserFacing,
  reportPopupSummary,
  reportPopupTitle,
  skillLabel,
} from './labels'
import type { BillingConfig, OfficeMode } from './api'
import {
  assertGoalAllowed,
  effectiveOfficeMode,
  isDeptEnabled,
  lockedHintIt,
  mergeSkills,
  skillsFromConfig,
} from './entitlements'
import {
  billingFromConfig,
  chargeExplainers,
  formatEuro,
  monthPeriodLabelIt,
  spendProgressPct,
} from './adminBilling'
import {
  LIGHT_LINGER_MS,
  litDeptsFromAgentRun,
  runNeedsLightTick,
  type RoomLightState,
} from './lights'
import { OfficeTwin } from './OfficeTwin'
import './index.css'

/** How long to keep the completed run around so linger + fade can play out. */
const POST_RUN_LIGHT_HOLD_MS = LIGHT_LINGER_MS + 900

type Msg = {
  role: 'user' | 'agent'
  text: string
  report?: Report | null
  timeline?: TimelineStep[]
  runStatus?: string
}

const TENANT_KEY = 'monny.tenantId'

function skillFamily(skill: string): string {
  if (skill.startsWith('spend_')) return 'spend'
  if (skill.startsWith('seo_')) return 'seo'
  if (skill.startsWith('shopify_')) return 'shopify'
  if (skill === 'lead_warming') return 'lead'
  if (skill.startsWith('ops_')) return 'ops'
  if (skill.startsWith('design_')) return 'design'
  if (skill.startsWith('it_')) return 'it'
  if (skill.startsWith('ctrl_')) return 'controlling'
  if (skill === 'reporting') return 'report'
  if (skill === 'hitl') return 'hitl'
  if (skill === 'planner') return 'planner'
  return 'stub'
}

function SkillRail({
  run,
  steps,
  compact = false,
}: {
  run: AgentRun | null
  steps: TimelineStep[]
  compact?: boolean
}) {
  if (!run || steps.length === 0) return null
  const active = steps.find((s) => s.status === 'running' || s.status === 'waiting')
  return (
    <div className={`skill-rail ${compact ? 'compact' : ''} status-${run.status}`}>
      {!compact && (
        <div className="skill-rail-head">
          <span className="skill-pulse" aria-hidden />
          <div>
            <strong>{active?.label ?? skillLabel(active?.skill || steps[0]?.skill || '')}</strong>
            <p>{run.status_line}</p>
          </div>
        </div>
      )}
      <ol className="skill-steps">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`skill-step family-${skillFamily(step.skill)} status-${step.status}`}
          >
            <span className="skill-dot" aria-hidden />
            <div>
              <strong>{step.label || skillLabel(step.skill)}</strong>
              <span>{friendlySkillDetail(step.skill, step.detail)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ApprovalCard({
  approval,
  primary,
  onDecide,
}: {
  approval: Approval
  primary?: boolean
  onDecide: DecideHandler
}) {
  const plain = plainApproval(approval)
  return (
    <div
      className={`approval ${primary ? 'approval-primary' : 'approval-secondary'}`}
      id={primary ? 'first-approval' : undefined}
      data-status={approval.status}
    >
      {primary && <div className="approval-next">Prossimo passo</div>}
      <div>
        <strong className="approval-title">{plain.title}</strong>
        <p className="approval-reason">{plain.reasonLine}</p>
        {primary && (
          <div className="approval-explain">
            <div>
              <span className="muted">Perché</span>
              <p>{plain.why}</p>
            </div>
            <div>
              <span className="muted">Cosa succede se Risolvi</span>
              <p>{plain.ifApprove}</p>
            </div>
          </div>
        )}
        {plain.details.length > 0 && (
          <details className="approval-details">
            <summary>Dettagli</summary>
            <ul>
              {plain.details.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <ApprovalPathActions approval={approval} onDecide={onDecide} />
    </div>
  )
}

function ApprovalsList({
  items,
  lastDecide,
  onDecide,
  emptyHint,
}: {
  items: Approval[]
  lastDecide: string | null
  onDecide: DecideHandler
  emptyHint: string
}) {
  const primary = items[0]
  const rest = items.slice(1)
  return (
    <section className="panel" id="approvals">
      <h2>Decisioni</h2>
      <p className="status-line">
        Tre percorsi: risolvi · delega a un reparto · scala a umano
      </p>
      {lastDecide && <p className="status-line">{lastDecide}</p>}
      {items.length === 0 && <p className="status-line">{emptyHint}</p>}
      {primary && (
        <ApprovalCard
          approval={primary}
          primary
          onDecide={onDecide}
        />
      )}
      {rest.length > 0 && (
        <div className="approval-rest">
          <p className="status-line">
            Altre {rest.length} {rest.length === 1 ? 'proposta' : 'proposte'}
          </p>
          {rest.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={onDecide} />
          ))}
        </div>
      )}
    </section>
  )
}

function channelLabel(channel: string | undefined): string {
  if (channel === 'google') return 'Google Ads'
  if (channel === 'meta') return 'Meta Ads'
  return channel || 'Canale'
}

function rankedCampaigns(
  channels: SpendDiagnosis[],
  top?: SpendCampaign[] | null,
): SpendCampaign[] {
  if (top && top.length) return top
  const rows = channels.flatMap((ch) =>
    (ch.campaigns ?? []).map((c) => ({ ...c, channel: c.channel || ch.channel })),
  )
  return [...rows].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
}

function SpendPanel({
  channels,
  topCampaigns,
  markdown,
}: {
  channels: SpendDiagnosis[]
  topCampaigns?: SpendCampaign[] | null
  markdown?: string | null
}) {
  if (!channels.length && !markdown) return null
  const ranked = rankedCampaigns(channels, topCampaigns)
  const best = ranked.filter((c) => c.healthy !== false).slice(0, 5)
  const showcase = best.length ? best : ranked.slice(0, 5)
  return (
    <div className="report-block">
      <h3>Report ads</h3>
      {showcase.length > 0 && (
        <>
          <p className="status-line" style={{ marginBottom: '0.5rem' }}>
            Campagne che hanno funzionato meglio (per ROAS)
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campagna</th>
                <th>Canale</th>
                <th>ROAS</th>
                <th>CPA</th>
                <th>Spesa</th>
              </tr>
            </thead>
            <tbody>
              {showcase.map((c) => (
                <tr key={`${c.channel}-${c.id || c.name}`}>
                  <td>{c.name || '—'}</td>
                  <td>{channelLabel(c.channel)}</td>
                  <td>{c.roas ?? '—'}</td>
                  <td>{c.cpa ?? '—'}</td>
                  <td>€{c.spend ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {channels.map((ch) => (
        <div key={ch.channel} className="channel-block">
          <div className="channel-head">
            <strong>{channelLabel(ch.channel)}</strong>
            <span>
              Spesa €{ch.totals.spend} · poco efficace €{ch.totals.waste_spend} (
              {ch.totals.waste_spend_pct}%)
            </span>
          </div>
        </div>
      ))}
      {markdown && (
        <details className="report-md">
          <summary>Report completo</summary>
          <pre className="report-md-body">{markdown}</pre>
        </details>
      )}
    </div>
  )
}

function InlineAdsReport({ report }: { report: Report }) {
  const channels = report.spend_channels ?? []
  if (!channels.length && !report.markdown) return null
  const ranked = rankedCampaigns(channels, report.top_campaigns)
  const best = ranked.filter((c) => c.healthy !== false).slice(0, 3)
  const showcase = best.length ? best : ranked.slice(0, 3)
  if (!showcase.length && !report.markdown) return null
  return (
    <div className="inline-report">
      <div className="inline-report-title">Report · ads migliori</div>
      {showcase.length > 0 && (
        <ul className="inline-report-list">
          {showcase.map((c, i) => (
            <li key={`${c.channel}-${c.id || c.name || i}`}>
              <strong>{c.name}</strong> · {channelLabel(c.channel)} · ROAS {c.roas} · €
              {c.spend}
            </li>
          ))}
        </ul>
      )}
      {report.markdown && (
        <details className="report-md">
          <summary>Apri report completo</summary>
          <pre className="report-md-body">{report.markdown}</pre>
        </details>
      )}
    </div>
  )
}

/** Dedicated popup when a run finishes with a user-facing report. */
function ReportPopup({
  report,
  onClose,
  onOpenSpend,
}: {
  report: Report
  onClose: () => void
  onOpenSpend?: () => void
}) {
  const channels = report.spend_channels ?? []
  const seoChanges = (report.seo_change_set?.changes ?? []) as SeoChange[]
  const isAds = channels.length > 0 || (report.top_campaigns?.length ?? 0) > 0
  const ranked = rankedCampaigns(channels, report.top_campaigns)
  const best = ranked.filter((c) => c.healthy !== false).slice(0, 5)
  const showcase = best.length ? best : ranked.slice(0, 5)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="report-popup-backdrop"
      role="presentation"
      onClick={onClose}
      data-testid="report-popup"
    >
      <div
        className="report-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-popup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="report-popup-head">
          <h2 id="report-popup-title">{reportPopupTitle(report)}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Chiudi">
            Chiudi
          </button>
        </div>
        <p className="report-popup-summary">{reportPopupSummary(report)}</p>

        {isAds && showcase.length > 0 && (
          <div className="report-block" style={{ marginTop: 0 }}>
            <h3>Campagne in evidenza</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Campagna</th>
                  <th>Canale</th>
                  <th>ROAS</th>
                  <th>Spesa</th>
                </tr>
              </thead>
              <tbody>
                {showcase.map((c) => (
                  <tr key={`${c.channel}-${c.id || c.name}`}>
                    <td>{c.name || '—'}</td>
                    <td>{channelLabel(c.channel)}</td>
                    <td>{c.roas ?? '—'}</td>
                    <td>€{c.spend ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isAds && seoChanges.length > 0 && <SeoPanel changes={seoChanges} />}

        {report.markdown && (
          <details className="report-md" open={!isAds && seoChanges.length === 0}>
            <summary>Report completo</summary>
            <pre className="report-md-body">{report.markdown}</pre>
          </details>
        )}

        <div className="report-popup-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Ho letto
          </button>
          {isAds && onOpenSpend && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onOpenSpend()
                onClose()
              }}
            >
              Apri Spend
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SeoPanel({ changes }: { changes: SeoChange[] }) {
  if (!changes.length) return null
  return (
    <div className="report-block">
      <h3>Suggerimenti SEO</h3>
      {changes.map((change) => (
        <div key={change.url} className="seo-change">
          <div className="seo-url">{change.url}</div>
          <div className="seo-diff">
            <div>
              <span className="muted">titolo</span>
              <div className="before">{change.before.title || '(vuoto)'}</div>
              <div className="after">{change.after.title}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FieldHelp({ children }: { children: string }) {
  return <p className="field-help">{children}</p>
}

function UsersAdminPanel({
  tenantId,
  busy,
  supabaseAuth,
}: {
  tenantId: string
  busy: boolean
  supabaseAuth: boolean
}) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<AuthRole>('agent')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const rows = await listAuthUsers(tenantId)
      setUsers(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onCreate = async () => {
    setNote(null)
    setErr(null)
    try {
      await createAuthUser({
        email,
        password,
        display_name: displayName || email.split('@')[0],
        role,
        tenant_id: tenantId,
      })
      setEmail('')
      setPassword('')
      setDisplayName('')
      setRole('agent')
      setNote('Utente creato.')
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const onRole = async (user: AuthUser, next: AuthRole) => {
    if (!user.user_id) {
      setErr('Cambio ruolo disponibile solo con profili Supabase (user_id).')
      return
    }
    setErr(null)
    try {
      await updateAuthUser(user.user_id, { role: next })
      setNote(`Ruolo aggiornato: ${user.email} → ${next}`)
      await refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="users-admin">
      {loading && <p className="status-line">Caricamento utenti…</p>}
      <ul className="users-list">
        {users.map((u) => (
          <li key={u.user_id || u.email} className="users-row">
            <div>
              <strong>{u.display_name}</strong>
              <span className="meta">
                {u.email} · {u.role === 'admin' ? 'Admin' : 'Agent'} · {u.tenant_id}
              </span>
            </div>
            {supabaseAuth && u.user_id && (
              <div className="users-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || u.role === 'agent'}
                  onClick={() => void onRole(u, 'agent')}
                >
                  Imposta Agent
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy || u.role === 'admin'}
                  onClick={() => void onRole(u, 'admin')}
                >
                  Imposta Admin
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {supabaseAuth ? (
        <div className="users-create">
          <h3>Nuovo utente</h3>
          <div className="users-create-grid">
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                minLength={8}
              />
            </label>
            <label>
              Nome
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </label>
            <label>
              Ruolo
              <select value={role} onChange={(e) => setRole(e.target.value as AuthRole)}>
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !email || password.length < 8}
            onClick={() => void onCreate()}
          >
            Crea utente
          </button>
        </div>
      ) : (
        <p className="muted">
          Per creare utenti e cambiare ruoli imposta SUPABASE_URL e le relative chiavi
          sull’API (vedi .env.example).
        </p>
      )}
      {note && <p className="status-line">{note}</p>}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

function KnowledgeAdminPanel({
  tenantId,
  busy,
}: {
  tenantId: string
  busy: boolean
}) {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [path, setPath] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listKnowledge(tenantId)
      setSources(data.sources)
      setPath(data.path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSources([])
    } finally {
      setLoading(false)
    }
  }, [tenantId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onToggle = async (source: KnowledgeSource, enabled: boolean) => {
    setToggling(source.id)
    setNote(null)
    setError(null)
    try {
      const res = await toggleKnowledgeSource(tenantId, source.id, enabled)
      setSources((prev) => prev.map((s) => (s.id === source.id ? res.source : s)))
      setNote(
        enabled
          ? `«${source.title}» attiva — le skill potranno usarla.`
          : `«${source.title}» disattivata.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setToggling(null)
    }
  }

  return (
    <div className="form-grid" data-testid="knowledge-admin">
      <FieldHelp>
        Documenti aziendali che Atrium consulta prima di spend e SEO. Per ora sono file
        markdown nel tenant; puoi attivare o spegnere ogni fonte.
      </FieldHelp>
      {loading ? (
        <p className="status-line">Carico le fonti…</p>
      ) : sources.length === 0 ? (
        <p className="status-line">
          Nessuna fonte ancora. Aggiungi file in{' '}
          <code>tenants/{tenantId}/knowledge/</code>.
        </p>
      ) : (
        <div className="skill-toggles">
          {sources.map((source) => (
            <label key={source.id} className="check-row skill-toggle">
              <input
                type="checkbox"
                checked={source.enabled}
                disabled={busy || toggling === source.id}
                onChange={(e) => void onToggle(source, e.target.checked)}
              />
              <span>
                <strong>{source.title}</strong>
                <span className="muted">
                  {' '}
                  — {source.tags.length ? source.tags.join(', ') : source.type}
                  {source.path ? ` · ${source.path}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      {path && (
        <p className="status-line" style={{ marginTop: '0.35rem' }}>
          Cartella: {path.split('/').slice(-3).join('/')}
        </p>
      )}
      {note && <p className="status-line">{note}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function setBilling(cfg: TenantConfig, patch: Partial<BillingConfig>): BillingConfig {
  return { ...billingFromConfig(cfg), ...patch }
}

function AdminForm({
  detail,
  onSave,
  busy,
}: {
  detail: TenantDetail
  onSave: (config: TenantConfig) => Promise<void>
  busy: boolean
}) {
  const [cfg, setCfg] = useState<TenantConfig>(detail.config)
  useEffect(() => setCfg(detail.config), [detail])

  const set = <K extends keyof TenantConfig>(key: K, value: TenantConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }))

  const secretStatus = (ref: string) =>
    detail.secrets.find((s) => s.secret_ref === ref)?.configured

  const billing = billingFromConfig(cfg)
  const spent = billing.ads_spent_this_month_eur
  const budget = billing.ads_monthly_budget_eur
  const pct = spendProgressPct(spent, budget)
  const charges = chargeExplainers(billing, cfg.subscription?.plan)
  const period = monthPeriodLabelIt()

  const saveBar = (
    <div className="admin-save-bar">
      <button className="btn btn-primary" disabled={busy} onClick={() => void onSave(cfg)}>
        {busy ? 'Salvataggio…' : 'Salva configurazione'}
      </button>
      <span className="status-line">
        File: {detail.path.split('/').slice(-2).join('/')}
      </span>
    </div>
  )

  return (
    <div className="admin-stack" data-testid="admin-stack">
      {/* 1 — Monthly spend always first and obvious */}
      <section className="admin-block admin-spend" data-testid="admin-monthly-spend">
        <header className="admin-block-head">
          <p className="admin-kicker">Atrium</p>
          <h3>Spesa del mese</h3>
          <p>Quanto hai speso, il limite che ti sei dato e quando arrivano gli addebiti.</p>
        </header>
        <div className="spend-hero">
          <div className="spend-hero-main">
            <span className="spend-hero-label">Speso in ads · {period}</span>
            <strong className="spend-hero-value" data-testid="admin-ads-spent">
              {formatEuro(spent)}
            </strong>
            <span className="spend-hero-sub">
              su un limite di {formatEuro(budget)} ({pct}% del budget)
            </span>
            <div
              className="spend-progress"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Budget ads usato al ${pct} percento`}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="spend-hero-side">
            <div className="spend-chip">
              <span>Abbonamento Atrium</span>
              <strong data-testid="admin-atrium-price">
                {billing.atrium_price_eur > 0
                  ? `${formatEuro(billing.atrium_price_eur)} / mese`
                  : 'Nessun addebito'}
              </strong>
            </div>
            <div className="spend-chip">
              <span>Rinnovo piano</span>
              <strong>giorno {billing.renews_on_day}</strong>
            </div>
          </div>
        </div>
        <ul className="spend-charges">
          <li data-testid="admin-charge-atrium">{charges.atrium}</li>
          <li data-testid="admin-charge-ads">{charges.ads}</li>
        </ul>
        <div className="field-row admin-spend-edit">
          <div className="field">
            <label htmlFor="ads-budget">Limite ads mensile (€)</label>
            <input
              id="ads-budget"
              data-testid="ads-monthly-budget"
              type="number"
              min={0}
              step="50"
              value={budget}
              onChange={(e) =>
                set('billing', setBilling(cfg, { ads_monthly_budget_eur: Number(e.target.value) }))
              }
            />
            <FieldHelp>Soglia che vuoi rispettare questo mese. Non blocca Google/Meta da sola.</FieldHelp>
          </div>
          <div className="field">
            <label htmlFor="ads-spent">Speso ads questo mese (€)</label>
            <input
              id="ads-spent"
              data-testid="ads-spent-month"
              type="number"
              min={0}
              step="10"
              value={spent}
              onChange={(e) =>
                set(
                  'billing',
                  setBilling(cfg, { ads_spent_this_month_eur: Number(e.target.value) }),
                )
              }
            />
            <FieldHelp>Ultimo sync o valore manuale finché i canali non aggiornano in automatico.</FieldHelp>
          </div>
          <div className="field">
            <label htmlFor="renew-day">Giorno addebito Atrium</label>
            <input
              id="renew-day"
              data-testid="atrium-renew-day"
              type="number"
              min={1}
              max={28}
              value={billing.renews_on_day}
              onChange={(e) =>
                set(
                  'billing',
                  setBilling(cfg, {
                    renews_on_day: Math.min(28, Math.max(1, Number(e.target.value) || 1)),
                  }),
                )
              }
            />
          </div>
          <div className="field">
            <label htmlFor="atrium-price">Prezzo piano Atrium (€ / mese)</label>
            <input
              id="atrium-price"
              data-testid="atrium-price-eur"
              type="number"
              min={0}
              step="1"
              value={billing.atrium_price_eur}
              onChange={(e) =>
                set('billing', setBilling(cfg, { atrium_price_eur: Number(e.target.value) }))
              }
            />
          </div>
        </div>
      </section>

      {/* 2 — Shop URLs / store settings */}
      <section className="admin-block" data-testid="admin-shop-urls">
        <header className="admin-block-head">
          <h3>Negozio e URL</h3>
          <p>Dominio Shopify, sito pubblico e pagine da controllare per prime.</p>
        </header>
        <div className="form-grid">
          <div className="field">
            <label>Nome del negozio</label>
            <input
              value={cfg.display_name}
              onChange={(e) => set('display_name', e.target.value)}
            />
            <FieldHelp>Come compare Atrium nell’header e nei report.</FieldHelp>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Dominio Shopify</label>
              <input
                value={cfg.shopify.shop_domain}
                onChange={(e) =>
                  set('shopify', { ...cfg.shopify, shop_domain: e.target.value })
                }
              />
              <FieldHelp>Es. mio-negozio.myshopify.com</FieldHelp>
            </div>
            <div className="field">
              <label>Versione API Shopify</label>
              <input
                value={cfg.shopify.api_version}
                onChange={(e) =>
                  set('shopify', { ...cfg.shopify, api_version: e.target.value })
                }
              />
            </div>
          </div>
          <div className="secret-status-row">
            <span>Accesso Shopify</span>
            <span
              className={`pill ${secretStatus(cfg.shopify.auth.secret_ref) ? 'ok' : 'miss'}`}
            >
              {secretStatus(cfg.shopify.auth.secret_ref) ? 'Configurato' : 'Mancante'}
            </span>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Indirizzo del sito</label>
              <input
                value={cfg.site.base_url}
                onChange={(e) => set('site', { ...cfg.site, base_url: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Sitemap (opzionale)</label>
              <input
                value={cfg.site.sitemap_url ?? ''}
                onChange={(e) => set('site', { ...cfg.site, sitemap_url: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Pagine da controllare per prime (una per riga)</label>
            <textarea
              rows={4}
              value={(cfg.site.priority_urls ?? []).join('\n')}
              onChange={(e) =>
                set('site', {
                  ...cfg.site,
                  priority_urls: e.target.value
                    .split('\n')
                    .map((l) => l.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
        </div>
      </section>

      {/* 3 — Meta + Google Ads accounts */}
      <section className="admin-block" data-testid="admin-ads-accounts">
        <header className="admin-block-head">
          <h3>Account Meta e Ads</h3>
          <p>Collega gli ID account. Le credenziali restano nei secret del tenant.</p>
        </header>
        <div className="form-grid">
          <div className="field">
            <label>ID account Meta Ads</label>
            <input
              data-testid="meta-ad-account-id"
              value={cfg.ads.meta?.ad_account_id ?? ''}
              onChange={(e) =>
                set('ads', {
                  ...cfg.ads,
                  meta: {
                    ad_account_id: e.target.value,
                    secret_ref: cfg.ads.meta?.secret_ref ?? 'META_ADS_DEMO',
                  },
                })
              }
            />
            <FieldHelp>Es. act_123456789</FieldHelp>
          </div>
          <div className="secret-status-row">
            <span>Credenziali Meta</span>
            <span
              className={`pill ${secretStatus(cfg.ads.meta?.secret_ref || '') ? 'ok' : 'miss'}`}
            >
              {secretStatus(cfg.ads.meta?.secret_ref || '') ? 'Configurato' : 'Mancante'}
            </span>
          </div>
          <div className="field">
            <label>ID cliente Google Ads</label>
            <input
              data-testid="google-ads-customer-id"
              value={cfg.ads.google?.customer_id ?? ''}
              onChange={(e) =>
                set('ads', {
                  ...cfg.ads,
                  google: {
                    customer_id: e.target.value,
                    login_customer_id: cfg.ads.google?.login_customer_id ?? null,
                    secret_ref: cfg.ads.google?.secret_ref ?? 'GOOGLE_ADS_DEMO',
                  },
                })
              }
            />
            <FieldHelp>Formato 000-000-0000</FieldHelp>
          </div>
          <div className="secret-status-row">
            <span>Credenziali Google Ads</span>
            <span
              className={`pill ${secretStatus(cfg.ads.google?.secret_ref || '') ? 'ok' : 'miss'}`}
            >
              {secretStatus(cfg.ads.google?.secret_ref || '') ? 'Configurato' : 'Mancante'}
            </span>
          </div>
        </div>
      </section>

      {/* 4 — Plan / departments */}
      <section className="admin-block" data-testid="admin-plan-skills">
        <header className="admin-block-head">
          <h3>Piano e reparti</h3>
          <p>
            Scegli i reparti nel piano. Leadership resta sempre disponibile. I reparti spenti
            non partono nell’agent.
          </p>
        </header>
        <div className="form-grid">
          <div className="field">
            <label>Piano</label>
            <select
              value={cfg.subscription?.plan ?? 'growth'}
              onChange={(e) =>
                set('subscription', {
                  plan: e.target.value as 'starter' | 'growth' | 'scale',
                  skills: mergeSkills(cfg.subscription?.skills),
                  features: {
                    office_view: true,
                    ...(cfg.subscription?.features ?? {}),
                  },
                  office_mode: cfg.subscription?.office_mode ?? 'full',
                })
              }
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="scale">Scale</option>
            </select>
          </div>
          <div className="skill-toggles">
            {(
              [
                ['spend', 'Spend pubblicitario', 'Google Ads e Meta'],
                ['seo', 'SEO', 'Title, meta e H1'],
                ['shopify', 'Negozio Shopify', 'Promo e anteprime negozio'],
                ['leads', 'Lead', 'Sequenze di lead warming'],
                ['operations', 'Operations', 'Ordini, giacenze, spedizioni'],
                ['design', 'Graphic Designer', 'Asset, creatività ads, brand kit'],
                ['it', 'IT', 'Integrazioni, accessi, monitoring'],
                ['controlling', 'Controlling', 'Budget, KPI, costi anomali'],
              ] as const
            ).map(([key, title, hint]) => {
              const skills = mergeSkills(cfg.subscription?.skills)
              return (
                <label key={key} className="check-row skill-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(skills[key])}
                    onChange={(e) =>
                      set('subscription', {
                        plan: cfg.subscription?.plan ?? 'growth',
                        skills: { ...skills, [key]: e.target.checked },
                        features: {
                          office_view: true,
                          ...(cfg.subscription?.features ?? {}),
                        },
                        office_mode: cfg.subscription?.office_mode ?? 'full',
                      })
                    }
                  />
                  <span>
                    <strong>{title}</strong>
                    <span className="muted"> — {hint}</span>
                  </span>
                </label>
              )
            })}
            <p className="status-line" style={{ marginTop: '0.35rem' }}>
              Leadership / decisioni: sempre attivo. Free vs paid = skill e limiti, non la
              grafica 3D.
            </p>
          </div>
        </div>
      </section>

      {/* 5 — Office view */}
      <section className="admin-block" data-testid="admin-office-view">
        <header className="admin-block-head">
          <h3>Vista ufficio</h3>
          <p>
            L’ufficio 3D è incluso per tutti. Scegli completa (3D), leggera (2D) o automatica.
          </p>
        </header>
        {(() => {
          const officeMode = (cfg.subscription?.office_mode ?? 'full') as OfficeMode
          return (
            <div className="field">
              <label htmlFor="office-mode-select">Presentazione ufficio</label>
              <select
                id="office-mode-select"
                data-testid="office-mode-select"
                value={officeMode}
                onChange={(e) =>
                  set('subscription', {
                    plan: cfg.subscription?.plan ?? 'growth',
                    skills: mergeSkills(cfg.subscription?.skills),
                    features: {
                      ...(cfg.subscription?.features ?? {}),
                      office_view: true,
                    },
                    office_mode: e.target.value as OfficeMode,
                  })
                }
              >
                <option value="auto">Automatica</option>
                <option value="full">Completa (3D)</option>
                <option value="light">Leggera</option>
              </select>
            </div>
          )
        })()}
      </section>

      {/* 6 — Safety + decision rights + spend thresholds */}
      <section className="admin-block" data-testid="admin-rules">
        <header className="admin-block-head">
          <h3>Regole e diritti</h3>
          <p>Conferme HITL, autonomia per reparto e soglie ads (ROAS / CPA).</p>
        </header>
        <div className="form-grid">
          <label className="check-row">
            <input
              type="checkbox"
              checked={cfg.policy.hitl_default}
              onChange={(e) =>
                set('policy', { ...cfg.policy, hitl_default: e.target.checked })
              }
            />
            Chiedi sempre conferma prima di applicare cambiamenti
          </label>

          <p className="admin-subhead">Diritti decisionali per reparto</p>
          <FieldHelp>
            «Sempre chiedi» rispetta anche il flag sopra; «Entro policy» applica solo se
            auto_apply è attivo; «L’agente risolve» salta l’HITL per quella famiglia.
          </FieldHelp>
          <div className="decision-rights-grid">
            {(
              [
                ['spend', 'Spend pubblicitario'],
                ['seo', 'SEO'],
                ['shopify', 'Negozio Shopify'],
                ['leads', 'Lead'],
                ['operations', 'Operations'],
                ['design', 'Graphic Designer'],
                ['it', 'IT'],
                ['controlling', 'Controlling'],
              ] as const
            ).map(([key, title]) => {
              const rights: DecisionRights = {
                spend: 'always_ask',
                seo: 'always_ask',
                shopify: 'always_ask',
                leads: 'always_ask',
                operations: 'always_ask',
                design: 'always_ask',
                it: 'always_ask',
                controlling: 'always_ask',
                ...(cfg.policy.decision_rights ?? {}),
              }
              const value = rights[key]
              return (
                <div className="field" key={key}>
                  <label htmlFor={`decision-right-${key}`}>{title}</label>
                  <select
                    id={`decision-right-${key}`}
                    data-testid={`decision-right-${key}`}
                    value={value}
                    onChange={(e) =>
                      set('policy', {
                        ...cfg.policy,
                        decision_rights: {
                          ...rights,
                          [key]: e.target.value as DecisionAutonomy,
                        },
                      })
                    }
                  >
                    <option value="always_ask">Sempre chiedi</option>
                    <option value="within_policy">Entro policy</option>
                    <option value="agent_resolves">L’agente risolve</option>
                  </select>
                </div>
              )
            })}
          </div>

          <p className="admin-subhead">Soglie ads</p>
          <div className="field-row">
            <div className="field">
              <label>ROAS minimo accettabile</label>
              <input
                type="number"
                step="0.1"
                value={cfg.policy.spend.thresholds.min_roas}
                onChange={(e) =>
                  set('policy', {
                    ...cfg.policy,
                    spend: {
                      ...cfg.policy.spend,
                      thresholds: {
                        ...cfg.policy.spend.thresholds,
                        min_roas: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </div>
            <div className="field">
              <label>CPA massimo accettabile</label>
              <input
                type="number"
                step="0.1"
                value={cfg.policy.spend.thresholds.max_cpa}
                onChange={(e) =>
                  set('policy', {
                    ...cfg.policy,
                    spend: {
                      ...cfg.policy.spend,
                      thresholds: {
                        ...cfg.policy.spend.thresholds,
                        max_cpa: Number(e.target.value),
                      },
                    },
                  })
                }
              />
            </div>
            <div className="field">
              <label>Taglio budget max %</label>
              <input
                type="number"
                value={cfg.policy.spend.max_budget_delta_pct}
                onChange={(e) =>
                  set('policy', {
                    ...cfg.policy,
                    spend: {
                      ...cfg.policy.spend,
                      max_budget_delta_pct: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
      </section>

      {saveBar}
    </div>
  )
}

function mergeOfficeLights(
  runLights: Record<DeptId, RoomLightState>,
  pendingTotal: number,
): Record<DeptId, RoomLightState> {
  const next = { ...runLights }
  // Pending decisions keep Direzione visibly lit (not just soft).
  if (pendingTotal > 0) next.direzione = 'on'
  return next
}

/** Sticky Italian callout — hard to miss when HITL approvals are waiting. */
function DecisionsAlert({
  count,
  onOpen,
}: {
  count: number
  onOpen: () => void
}) {
  if (count <= 0) return null
  const headline =
    count === 1
      ? 'C’è 1 decisione da prendere'
      : `Ci sono ${count} decisioni da prendere`
  return (
    <aside
      className="decisions-alert decisions-alert-attention"
      role="status"
      aria-live="polite"
      data-testid="decisions-alert"
    >
      <div className="decisions-alert-lead">
        <span className="decisions-alert-icon" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3a6 6 0 0 0-6 6v2.2c0 .7-.2 1.4-.6 2L4 16h16l-1.4-2.8c-.4-.6-.6-1.3-.6-2V9a6 6 0 0 0-6-6Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M9.5 18a2.5 2.5 0 0 0 5 0"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="decisions-alert-count" aria-hidden>
          {count}
        </span>
        <div className="decisions-alert-copy">
          <strong>{headline}</strong>
          <span>
            Guarda la stanza Direzione (luce e badge) oppure apri l’elenco.
          </span>
        </div>
      </div>
      <button type="button" className="btn btn-primary" onClick={onOpen}>
        Vai alle decisioni
      </button>
    </aside>
  )
}

function intendedRoleFromRoute(route: RouteState): AuthRole {
  return route.mode === 'admin' ? 'admin' : 'agent'
}

function App() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(window.location.hash))
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => loadStoredUser())
  const [authReady, setAuthReady] = useState(() => !loadStoredToken())
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [supabaseAuth, setSupabaseAuth] = useState(() => isSupabaseRuntime())
  const [tenants, setTenants] = useState<TenantListItem[]>([])
  const [tenantId, setTenantId] = useState(
    () => localStorage.getItem(TENANT_KEY) || 'demo',
  )
  const [threadByDept, setThreadByDept] = useState<Partial<Record<DeptId, string>>>({})
  const [messagesByDept, setMessagesByDept] = useState<Partial<Record<DeptId, Msg[]>>>({})
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [lastDecide, setLastDecide] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [latestReport, setLatestReport] = useState<Report | null>(null)
  /** Report shown in the dedicated popup after a run (not on artifact load). */
  const [reportPopup, setReportPopup] = useState<Report | null>(null)
  const [artifactNames, setArtifactNames] = useState<string[]>([])
  const [liveRun, setLiveRun] = useState<AgentRun | null>(null)
  const [liveDept, setLiveDept] = useState<DeptId | null>(null)
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  /** Clock tick so room lights drop from linger → soft/off after execution + 1s. */
  const [nowMs, setNowMs] = useState(() => Date.now())

  const navigate = useCallback((next: RouteState) => {
    setRoute(next)
    const h = hashFor(next)
    if (window.location.hash !== h) {
      window.location.hash = h
    }
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) {
      window.location.hash = '#agent'
    }
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (isSupabaseRuntime()) {
      setSupabaseAuth(true)
      return
    }
    fetchHealth()
      .then((h) => setSupabaseAuth(h.auth?.backend === 'supabase'))
      .catch(() => setSupabaseAuth(false))
  }, [])

  useEffect(() => {
    const token = loadStoredToken()
    if (!token) {
      setAuthUser(null)
      setAuthReady(true)
      return
    }
    let cancelled = false
    fetchMe()
      .then((user) => {
        if (cancelled) return
        setAuthUser(user)
        persistSession(token, user)
      })
      .catch(() => {
        if (cancelled) return
        clearSession()
        setAuthUser(null)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const intendedRole = intendedRoleFromRoute(route)
  const needsLogin =
    authReady &&
    (!authUser || (route.mode === 'admin' && !canAccessAdmin(authUser.role)))

  const applyAuthResult = async (
    result: Awaited<ReturnType<typeof login>>,
    forAdmin: boolean,
  ) => {
    if (forAdmin && !canAccessAdmin(result.user.role)) {
      clearSession()
      setAuthUser(null)
      setLoginError('Questo account non può aprire Admin. Usa un account Admin.')
      return
    }
    if (!result.token) {
      setLoginError(
        'Account creato. Conferma l’email se richiesto, poi accedi.',
      )
      return
    }
    persistSession(result.token, result.user)
    setAuthUser(result.user)
    if (result.user.tenant_id) setTenantId(result.user.tenant_id)
  }

  const handleLogin = async (email: string, password: string) => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const result = await login(email, password)
      await applyAuthResult(result, intendedRole === 'admin')
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  const handleSignup = async (email: string, password: string, displayName: string) => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const result = await signup(email, password, displayName)
      await applyAuthResult(result, false)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoginBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      /* ignore network errors on logout */
    }
    clearSession()
    setAuthUser(null)
    setTenants([])
    setTenantDetail(null)
    setApprovals([])
    setError(null)
    setLoginError(null)
  }

  const refreshTenants = useCallback(async () => {
    const items = await listTenants()
    setTenants(items)
    if (items.length && !items.find((t) => t.tenant_id === tenantId)) {
      setTenantId(items[0].tenant_id)
    }
  }, [tenantId])

  useEffect(() => {
    if (!authUser || needsLogin) return
    refreshTenants().catch((err: Error) => setError(err.message))
  }, [refreshTenants, authUser, needsLogin])

  useEffect(() => {
    localStorage.setItem(TENANT_KEY, tenantId)
  }, [tenantId])

  const refreshApprovals = useCallback(async (id = tenantId) => {
    const items = await listApprovals(id)
    setApprovals(items)
    return items
  }, [tenantId])

  const loadArtifacts = useCallback(async (id: string) => {
    try {
      const listed = await listTenantArtifacts(id)
      setArtifactNames(listed.artifacts.map((a) => a.name))
      const last = await getTenantArtifact(id, 'last_report.json').catch(() => null)
      if (last?.payload) setLatestReport(last.payload as Report)
      else setLatestReport(null)
    } catch {
      setArtifactNames([])
      setLatestReport(null)
    }
  }, [])

  const loadAudit = useCallback(async (id: string) => {
    try {
      const rows = await listTenantAudit(id, 100)
      setAuditEvents(rows)
    } catch {
      setAuditEvents([])
    }
  }, [])

  useEffect(() => {
    if (!authUser || needsLogin) return
    refreshApprovals(tenantId).catch((err: Error) => setError(err.message))
    void loadArtifacts(tenantId)
    void loadAudit(tenantId)
    getTenant(tenantId)
      .then(setTenantDetail)
      .catch((err: Error) => setError(err.message))
  }, [tenantId, refreshApprovals, loadArtifacts, loadAudit, authUser, needsLogin])

  useEffect(() => {
    if (!authUser || needsLogin) return
    if (route.mode !== 'admin') return
    if (!canAccessAdmin(authUser.role)) return
    getTenant(tenantId)
      .then((detail) => {
        setTenantDetail(detail)
        setSaveNote(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [route.mode, tenantId, authUser, needsLogin])

  useEffect(() => {
    if (!runNeedsLightTick(liveRun, nowMs)) return
    const id = window.setInterval(() => setNowMs(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [liveRun, nowMs])

  const tenantMeta = useMemo(
    () => tenants.find((t) => t.tenant_id === tenantId),
    [tenants, tenantId],
  )
  const tenantLabel = tenantMeta?.display_name ?? tenantId
  const deptCounts = useMemo(() => countByDept(approvals), [approvals])
  const activeDept = route.mode === 'dept' ? getDept(route.dept) : null
  const deptId = activeDept?.id ?? null
  const deptMessages = deptId ? messagesByDept[deptId] || [] : []
  const deptApprovals = deptId ? filterApprovals(approvals, deptId) : []
  const filteredLiveSteps =
    liveRun && liveDept ? filterSteps(liveRun.steps, liveDept) : []

  const switchTenant = (id: string) => {
    if (id === tenantId) return
    setTenantId(id)
    setThreadByDept({})
    setMessagesByDept({})
    setLastDecide(null)
    setLiveRun(null)
    setLiveDept(null)
    setDraft('')
  }

  const entitlementSkills = skillsFromConfig(tenantDetail?.config)
  const officeMode = effectiveOfficeMode(tenantDetail?.config)

  const sendInDept = async (dept: DeptId, override?: string) => {
    const text = (override ?? draft).trim()
    if (!text || busy) return
    if (!isDeptEnabled(dept, entitlementSkills)) {
      setError(lockedHintIt(dept))
      return
    }
    const blocked = assertGoalAllowed(text, entitlementSkills)
    if (blocked) {
      setError(blocked)
      return
    }
    setBusy(true)
    setError(null)
    setMessagesByDept((prev) => ({
      ...prev,
      [dept]: [...(prev[dept] || []), { role: 'user', text }],
    }))
    setDraft('')
    try {
      const started = await startRun({
        tenant_id: tenantId,
        message: text,
        thread_id: threadByDept[dept],
      })
      setThreadByDept((prev) => ({ ...prev, [dept]: started.thread_id }))
      setLiveRun(started)
      setLiveDept(dept)

      const terminal = new Set(['completed', 'awaiting_approval', 'error'])
      let current = started
      while (!terminal.has(current.status)) {
        await new Promise((r) => setTimeout(r, 280))
        current = await getRun(started.id)
        setNowMs(Date.now())
        setLiveRun({ ...current })
      }

      setLatestReport(current.report ?? null)
      if (reportIsUserFacing(current.report)) {
        setReportPopup(current.report ?? null)
      }
      const scopedSteps = filterSteps(current.steps, dept)
      setMessagesByDept((prev) => ({
        ...prev,
        [dept]: [
          ...(prev[dept] || []),
          {
            role: 'agent',
            text: friendlyAgentReply(current.reply, current.report, current.status),
            report: current.report,
            timeline: scopedSteps,
            runStatus: current.status,
          },
        ],
      }))
      await refreshApprovals(tenantId)
      await loadArtifacts(tenantId)
      await loadAudit(tenantId)
      await refreshTenants()
      if (current.status !== 'awaiting_approval') {
        setTimeout(() => {
          setLiveRun(null)
          setLiveDept(null)
        }, POST_RUN_LIGHT_HOLD_MS)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLiveRun(null)
      setLiveDept(null)
    } finally {
      setBusy(false)
    }
  }

  const onDecide: DecideHandler = async (id, decision, delegateTo) => {
    setError(null)
    try {
      const result = await decideApproval(id, decision, undefined, delegateTo)
      setLastDecide(
        friendlyDecideNote(
          result.action_type,
          decision,
          String(result.apply_result?.status ?? ''),
          result.delegate_to,
        ),
      )
      setLiveRun(null)
      setLiveDept(null)
      await refreshApprovals(tenantId)
      await loadAudit(tenantId)
      await refreshTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const saveConfig = async (config: TenantConfig) => {
    setError(null)
    setSaveNote(null)
    setBusy(true)
    try {
      const res = await putTenant(tenantId, config)
      setSaveNote(`Configurazione salvata (${res.path.split('/').slice(-2).join('/')}).`)
      setTenantDetail(await getTenant(tenantId))
      await refreshTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const spendFromArtifact = (latestReport?.spend_channels ?? []) as SpendDiagnosis[]
  const seoFromArtifact = (latestReport?.seo_change_set?.changes ?? []) as SeoChange[]
  const officeLights = mergeOfficeLights(
    litDeptsFromAgentRun(liveRun, nowMs),
    approvals.length,
  )
  // Disabled skills never show false lights
  for (const id of ['spend', 'seo', 'shopify', 'lead'] as DeptId[]) {
    if (!isDeptEnabled(id, entitlementSkills)) officeLights[id] = 'off'
  }

  /** Start a run while staying on the office twin so room lights update live. */
  const runFromOffice = async (goal: string) => {
    if (!goal.trim() || busy) return
    const blocked = assertGoalAllowed(goal, entitlementSkills)
    if (blocked) {
      setError(blocked)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const started = await startRun({
        tenant_id: tenantId,
        message: goal,
      })
      setLiveRun(started)
      setLiveDept(null)
      setNowMs(Date.now())
      const terminal = new Set(['completed', 'awaiting_approval', 'error'])
      let current = started
      while (!terminal.has(current.status)) {
        await new Promise((r) => setTimeout(r, 280))
        current = await getRun(started.id)
        setNowMs(Date.now())
        setLiveRun({ ...current })
      }
      setLatestReport(current.report ?? null)
      // Show dedicated popup first — do not force-navigate to Spend to read the report.
      if (reportIsUserFacing(current.report)) {
        setReportPopup(current.report ?? null)
      }
      await refreshApprovals(tenantId)
      await loadArtifacts(tenantId)
      await refreshTenants()
      // Still seed Spend chat so «Apri Spend» has context later.
      const hasSpendReport = (current.report?.spend_channels?.length ?? 0) > 0
      if (hasSpendReport) {
        const spendDept = 'spend' as DeptId
        setMessagesByDept((prev) => ({
          ...prev,
          [spendDept]: [
            ...(prev[spendDept] || []),
            { role: 'user', text: goal },
            {
              role: 'agent',
              text: friendlyAgentReply(current.reply, current.report, current.status),
              report: current.report,
              timeline: filterSteps(current.steps, spendDept),
              runStatus: current.status,
            },
          ],
        }))
      }
      // Hold run so linger (execution + 1s ON) + existing ease-off can finish
      setTimeout(() => {
        if (current.status !== 'awaiting_approval') {
          setLiveRun(null)
        }
      }, POST_RUN_LIGHT_HOLD_MS)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLiveRun(null)
    } finally {
      setBusy(false)
    }
  }

  const openDecisions = () => {
    navigate({ mode: 'dept', dept: 'direzione' })
    window.setTimeout(() => {
      document.getElementById('first-approval')?.scrollIntoView({ behavior: 'smooth' })
    }, 80)
  }

  if (!authReady) {
    return (
      <div className="login-shell login-loading">
        <p className="login-blurb">Caricamento sessione…</p>
      </div>
    )
  }

  if (authUser && route.mode === 'admin' && !canAccessAdmin(authUser.role)) {
    return (
      <div className="login-shell" data-intended="admin">
        <div className="login-atmosphere" aria-hidden />
        <main className="login-panel">
          <header className="login-brand">
            <span className="brand-strip" aria-hidden />
            <div className="brand-lockup">
              <span className="brand-mark">Atrium</span>
              <span className="brand-tag">Workspace marketing</span>
            </div>
          </header>
          <h1 className="login-title">Accesso Admin negato</h1>
          <p className="login-blurb">
            L’account Agent non può aprire Admin. Usa un account Admin oppure torna
            all’ufficio Agent.
          </p>
          <div className="login-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate({ mode: 'piano' })}
            >
              Torna ad Agent
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              Esci e accedi come Admin
            </button>
          </div>
        </main>
      </div>
    )
  }

  if (needsLogin) {
    return (
      <LoginScreen
        key={intendedRole}
        intended={intendedRole}
        busy={loginBusy}
        error={loginError}
        allowSignup
        onSubmit={handleLogin}
        onSignup={handleSignup}
      />
    )
  }

  const showAdminNav = canAccessAdmin(authUser?.role)

  return (
    <div className="app-shell">
      <div className="app-chrome">
        <header className="topbar">
          <div className="brand">
            <span className="brand-strip" aria-hidden />
            <div className="brand-lockup">
              <span className="brand-mark">Atrium</span>
              <span className="brand-tag">Workspace marketing</span>
            </div>
          </div>
          <div className="tenant-switch">
            <label htmlFor="global-tenant">Negozio</label>
            <select
              id="global-tenant"
              value={tenantId}
              onChange={(e) => switchTenant(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.tenant_id} value={t.tenant_id}>
                  {t.display_name}
                  {t.pending_approvals ? ` · ${t.pending_approvals} da decidere` : ''}
                </option>
              ))}
            </select>
            {tenantMeta && (
              <span className={`pill ${(tenantMeta.secrets_configured ?? 0) > 0 ? 'ok' : 'miss'}`}>
                {(tenantMeta.secrets_configured ?? 0) > 0 ? 'Accessi ok' : 'Accessi da completare'}
              </span>
            )}
          </div>
          <div className="topbar-end">
            <nav className="nav">
              <a
                href="#agent"
                className={route.mode !== 'admin' ? 'active' : ''}
                onClick={(e) => {
                  e.preventDefault()
                  navigate({ mode: 'piano' })
                }}
              >
                Agent
              </a>
              {showAdminNav && (
                <a
                  href="#admin"
                  className={route.mode === 'admin' ? 'active' : ''}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate({ mode: 'admin' })
                  }}
                >
                  Admin
                </a>
              )}
            </nav>
            <div className="session-chip">
              <span className="session-user" title={authUser?.email}>
                {authUser?.display_name ?? authUser?.email}
                <em>{authUser?.role === 'admin' ? 'Admin' : 'Agent'}</em>
              </span>
              <button type="button" className="btn btn-ghost btn-logout" onClick={handleLogout}>
                Esci
              </button>
            </div>
          </div>
        </header>

        {route.mode !== 'admin' && approvals.length > 0 && (
          <DecisionsAlert count={approvals.length} onOpen={openDecisions} />
        )}
      </div>

      <main className="page">
        {route.mode === 'admin' ? (
          <>
            <section className="page-intro admin-intro">
              <div>
                <p className="admin-brand-lockup">
                  <span className="admin-brand-name">Atrium</span>
                  <span className="admin-brand-sub">Workspace marketing</span>
                </p>
                <h1>Admin</h1>
                <p>
                  Tre cose chiare per <strong>{tenantLabel}</strong>: spesa del mese, URL del
                  negozio, account Meta e Ads.
                </p>
              </div>
            </section>
            <section className="panel admin-tenants-panel">
              <h2>Negozio attivo</h2>
              <div className="tenant-chips">
                {tenants.map((t) => (
                  <button
                    key={t.tenant_id}
                    type="button"
                    className={`tenant-chip ${t.tenant_id === tenantId ? 'active' : ''}`}
                    onClick={() => switchTenant(t.tenant_id)}
                  >
                    <strong>{t.display_name}</strong>
                    <span className="meta">
                      {(t.secrets_configured ?? 0) > 0 ? 'Accessi ok' : 'Accessi da completare'}
                      {t.pending_approvals ? ` · ${t.pending_approvals} da decidere` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel admin-config-panel">
              {tenantDetail && (
                <AdminForm detail={tenantDetail} onSave={saveConfig} busy={busy} />
              )}
              {saveNote && <p className="status-line">{saveNote}</p>}
              {error && <p className="error">{error}</p>}
            </section>
            <section className="panel">
              <h2>Conoscenza aziendale</h2>
              <KnowledgeAdminPanel tenantId={tenantId} busy={busy} />
            </section>
            <section className="panel">
              <h2>Utenti e ruoli</h2>
              <p className="muted">
                Agent non apre Admin. Admin può usare entrambe le superfici.
                {supabaseAuth
                  ? ' Backend: Supabase Auth + Postgres.'
                  : ' Modalità demo locale (fixture); attiva Supabase per gestire utenti.'}
              </p>
              <UsersAdminPanel tenantId={tenantId} busy={busy} supabaseAuth={supabaseAuth} />
            </section>
          </>
        ) : route.mode === 'piano' ? (
          <>
            <OfficeTwin
              lights={officeLights}
              pending={deptCounts}
              enabled={entitlementSkills}
              officeMode={officeMode}
              officeViewEntitled={true}
              statusLine={liveRun?.status_line}
              busy={busy}
              tenantId={tenantId}
              approvals={approvals}
              audit={auditEvents}
              sessionQueries={Object.fromEntries(
                Object.entries(messagesByDept).map(([k, msgs]) => [
                  k,
                  (msgs || []).filter((m) => m.role === 'user').length,
                ]),
              )}
              liveSteps={liveRun?.steps ?? []}
              onSelect={(id) => {
                if (!isDeptEnabled(id, entitlementSkills)) {
                  setError(lockedHintIt(id))
                  return
                }
                setError(null)
                navigate({ mode: 'dept', dept: id })
              }}
              onQuickAction={(goal) => void runFromOffice(goal)}
              onDecideApproval={(id, d) => void onDecide(id, d)}
            />
            {error && <p className="error">{error}</p>}
          </>
        ) : activeDept ? (
          <>
            <div
              className={`dept-shell tint-${activeDept.tint}${
                !isDeptEnabled(activeDept.id, entitlementSkills) ? ' dept-locked' : ''
              }`}
            >
              <div className="dept-header">
                <button
                  type="button"
                  className="btn btn-ghost back-btn"
                  data-testid="dept-back-overview"
                  onClick={() => navigate({ mode: 'piano' })}
                >
                  ← Indietro · Vista ufficio
                </button>
                <div>
                  <h1>{activeDept.name}</h1>
                  <p>{activeDept.blurb}</p>
                </div>
              </div>

              {!isDeptEnabled(activeDept.id, entitlementSkills) ? (
                <section className="panel locked-panel">
                  <h2>Reparto non attivo</h2>
                  <p className="status-line">{lockedHintIt(activeDept.id)}</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => navigate({ mode: 'admin' })}
                  >
                    Vai ad Attivazione piano
                  </button>
                </section>
              ) : null}

              {isDeptEnabled(activeDept.id, entitlementSkills) &&
                liveRun &&
                liveDept === activeDept.id &&
                filteredLiveSteps.length > 0 && (
                <div className="skill-stage" data-testid="skill-rail-live">
                  <SkillRail run={liveRun} steps={filteredLiveSteps} />
                </div>
              )}

              {isDeptEnabled(activeDept.id, entitlementSkills) &&
              activeDept.id === 'direzione' ? (
                <div className="dept-body single">
                  {approvals.length > 0 && (
                    <div className="approval-banner">
                      <strong>
                        Hai {approvals.length}{' '}
                        {approvals.length === 1 ? 'decisione' : 'decisioni'} da prendere
                      </strong>
                      <button
                        type="button"
                        className="banner-link"
                        onClick={() =>
                          document
                            .getElementById('first-approval')
                            ?.scrollIntoView({ behavior: 'smooth' })
                        }
                      >
                        Vai alla prima
                      </button>
                    </div>
                  )}
                  <ApprovalsList
                    items={approvals}
                    lastDecide={lastDecide}
                    onDecide={(id, d) => void onDecide(id, d)}
                    emptyHint="Nessuna decisione in sospeso. Quando un reparto propone qualcosa, arriva qui."
                  />
                </div>
              ) : isDeptEnabled(activeDept.id, entitlementSkills) ? (
                <div className="dept-body layout-split">
                  <section className="panel console-panel">
                    <h2>Attività del reparto</h2>
                    {activeDept.actions.length > 0 && (
                      <div className="quick-actions">
                        {activeDept.actions.map((a) => (
                          <button
                            key={a.goal}
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setDraft(a.goal)
                              void sendInDept(activeDept.id, a.goal)
                            }}
                          >
                            {a.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {deptMessages.length === 0 && !liveRun ? (
                      <div className="coach">
                        <h3>Questo reparto</h3>
                        <p className="status-line" style={{ marginBottom: '0.75rem' }}>
                          {activeDept.blurb} Avvia un’azione qui sotto: vedrai solo le skill di
                          questo reparto.
                        </p>
                        {activeDept.actions[0] && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void sendInDept(activeDept.id, activeDept.actions[0].goal)}
                          >
                            {activeDept.actions[0].label}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="chat-log">
                        {deptMessages.map((m, i) => (
                          <div key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
                            {m.text}
                            {m.role === 'agent' && m.report?.spend_channels?.length ? (
                              <InlineAdsReport report={m.report} />
                            ) : null}
                            {m.timeline && m.timeline.length > 0 && (
                              <div className="thread-timeline">
                                <SkillRail
                                  compact
                                  run={{
                                    id: `hist-${i}`,
                                    tenant_id: tenantId,
                                    thread_id: threadByDept[activeDept.id] || '',
                                    goal: '',
                                    status: m.runStatus || 'completed',
                                    status_line: '',
                                    steps: m.timeline,
                                    approval_ids: [],
                                    created_at: '',
                                    updated_at: '',
                                  }}
                                  steps={m.timeline}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="composer">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            void sendInDept(activeDept.id)
                          }
                        }}
                        placeholder={activeDept.placeholder}
                      />
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => void sendInDept(activeDept.id)}
                      >
                        {busy ? 'In corso…' : 'Invia'}
                      </button>
                    </div>
                    {error && <p className="error">{error}</p>}
                  </section>

                  <ApprovalsList
                    items={deptApprovals}
                    lastDecide={lastDecide}
                    onDecide={(id, d) => void onDecide(id, d)}
                    emptyHint="Nessuna proposta di questo reparto in attesa."
                  />
                </div>
              ) : null}

              {isDeptEnabled(activeDept.id, entitlementSkills) &&
                activeDept.id === 'spend' &&
                spendFromArtifact.length > 0 && (
                <section className="panel report-panel">
                  <h2>Ultimi risultati ads</h2>
                  <SpendPanel
                    channels={spendFromArtifact}
                    topCampaigns={latestReport?.top_campaigns}
                    markdown={latestReport?.markdown}
                  />
                </section>
              )}
              {isDeptEnabled(activeDept.id, entitlementSkills) &&
                activeDept.id === 'seo' &&
                seoFromArtifact.length > 0 && (
                <section className="panel report-panel">
                  <h2>Ultimi risultati SEO</h2>
                  <SeoPanel changes={seoFromArtifact} />
                </section>
              )}
              {isDeptEnabled(activeDept.id, entitlementSkills) &&
                activeDept.id === 'shopify' &&
                artifactNames.length > 0 && (
                <p className="status-line" style={{ marginTop: '1rem' }}>
                  Artifact: {artifactNames.join(', ')}
                </p>
              )}
            </div>
          </>
        ) : null}
      </main>
      {reportPopup && (
        <ReportPopup
          report={reportPopup}
          onClose={() => setReportPopup(null)}
          onOpenSpend={
            (reportPopup.spend_channels?.length ?? 0) > 0 ||
            (reportPopup.top_campaigns?.length ?? 0) > 0
              ? () => navigate({ mode: 'dept', dept: 'spend' })
              : undefined
          }
        />
      )}
    </div>
  )
}

export default App
