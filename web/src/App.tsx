import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentRun,
  type Approval,
  type Report,
  type SeoChange,
  type SpendDiagnosis,
  type TenantConfig,
  type TenantDetail,
  type TenantListItem,
  type TimelineStep,
  decideApproval,
  getRun,
  getTenant,
  getTenantArtifact,
  listApprovals,
  listTenantArtifacts,
  listTenants,
  putTenant,
  startRun,
} from './api'
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
  skillLabel,
} from './labels'
import { litDeptsFromAgentRun, type RoomLightState } from './lights'
import { OfficeTwin } from './OfficeTwin'
import './index.css'

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
  onDecide: (id: string, decision: 'approved' | 'rejected') => void
}) {
  const plain = plainApproval(approval)
  return (
    <div
      className={`approval ${primary ? 'approval-primary' : 'approval-secondary'}`}
      id={primary ? 'first-approval' : undefined}
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
              <span className="muted">Cosa succede se Approvi</span>
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
      <div className="approval-actions">
        <button className="btn btn-ok" onClick={() => onDecide(approval.id, 'approved')}>
          Approva
        </button>
        <button className="btn btn-danger" onClick={() => onDecide(approval.id, 'rejected')}>
          Rifiuta
        </button>
      </div>
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
  onDecide: (id: string, decision: 'approved' | 'rejected') => void
  emptyHint: string
}) {
  const primary = items[0]
  const rest = items.slice(1)
  return (
    <section className="panel" id="approvals">
      <h2>Approvazioni</h2>
      {lastDecide && <p className="status-line">{lastDecide}</p>}
      {items.length === 0 && <p className="status-line">{emptyHint}</p>}
      {primary && (
        <ApprovalCard
          approval={primary}
          primary
          onDecide={(id, d) => onDecide(id, d)}
        />
      )}
      {rest.length > 0 && (
        <div className="approval-rest">
          <p className="status-line">
            Altre {rest.length} {rest.length === 1 ? 'proposta' : 'proposte'}
          </p>
          {rest.map((a) => (
            <ApprovalCard key={a.id} approval={a} onDecide={(id, d) => onDecide(id, d)} />
          ))}
        </div>
      )}
    </section>
  )
}

function SpendPanel({ channels }: { channels: SpendDiagnosis[] }) {
  if (!channels.length) return null
  return (
    <div className="report-block">
      <h3>Riepilogo ads</h3>
      {channels.map((ch) => (
        <div key={ch.channel} className="channel-block">
          <div className="channel-head">
            <strong>
              {ch.channel === 'google'
                ? 'Google Ads'
                : ch.channel === 'meta'
                  ? 'Meta Ads'
                  : ch.channel}
            </strong>
            <span>
              Spesa €{ch.totals.spend} · poco efficace €{ch.totals.waste_spend} (
              {ch.totals.waste_spend_pct}%)
            </span>
          </div>
        </div>
      ))}
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

  return (
    <div className="form-grid">
      <div className="field">
        <label>Nome del negozio</label>
        <input
          value={cfg.display_name}
          onChange={(e) => set('display_name', e.target.value)}
        />
        <FieldHelp>Come compare Monny nell’header e nei report.</FieldHelp>
      </div>

      <div className="section-title">Negozio Shopify</div>
      <div className="field-row">
        <div className="field">
          <label>Dominio negozio</label>
          <input
            value={cfg.shopify.shop_domain}
            onChange={(e) =>
              set('shopify', { ...cfg.shopify, shop_domain: e.target.value })
            }
          />
          <FieldHelp>Es. mio-negozio.myshopify.com</FieldHelp>
        </div>
        <div className="field">
          <label>Versione API</label>
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
        <span className={`pill ${secretStatus(cfg.shopify.auth.secret_ref) ? 'ok' : 'miss'}`}>
          {secretStatus(cfg.shopify.auth.secret_ref) ? 'Configurato' : 'Mancante'}
        </span>
      </div>

      <div className="section-title">Account Google Ads</div>
      <div className="field">
        <label>ID cliente Google Ads</label>
        <input
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
      </div>
      <div className="secret-status-row">
        <span>Credenziali Google Ads</span>
        <span
          className={`pill ${secretStatus(cfg.ads.google?.secret_ref || '') ? 'ok' : 'miss'}`}
        >
          {secretStatus(cfg.ads.google?.secret_ref || '') ? 'Configurato' : 'Mancante'}
        </span>
      </div>

      <div className="section-title">Account Meta Ads</div>
      <div className="field">
        <label>ID account pubblicitario</label>
        <input
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
      </div>
      <div className="secret-status-row">
        <span>Credenziali Meta</span>
        <span
          className={`pill ${secretStatus(cfg.ads.meta?.secret_ref || '') ? 'ok' : 'miss'}`}
        >
          {secretStatus(cfg.ads.meta?.secret_ref || '') ? 'Configurato' : 'Mancante'}
        </span>
      </div>

      <div className="section-title">Sito e SEO</div>
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

      <div className="section-title">Regole di sicurezza</div>
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

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void onSave(cfg)}>
          {busy ? 'Salvataggio…' : 'Salva configurazione'}
        </button>
        <span className="status-line">
          Salvato in {detail.path.split('/').slice(-2).join('/')}
        </span>
      </div>
    </div>
  )
}

function mergeOfficeLights(
  runLights: Record<DeptId, RoomLightState>,
  pendingTotal: number,
): Record<DeptId, RoomLightState> {
  const next = { ...runLights }
  if (pendingTotal > 0 && next.direzione === 'off') next.direzione = 'soft'
  return next
}

function App() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(window.location.hash))
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
  const [artifactNames, setArtifactNames] = useState<string[]>([])
  const [liveRun, setLiveRun] = useState<AgentRun | null>(null)
  const [liveDept, setLiveDept] = useState<DeptId | null>(null)

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

  const refreshTenants = useCallback(async () => {
    const items = await listTenants()
    setTenants(items)
    if (items.length && !items.find((t) => t.tenant_id === tenantId)) {
      setTenantId(items[0].tenant_id)
    }
  }, [tenantId])

  useEffect(() => {
    refreshTenants().catch((err: Error) => setError(err.message))
  }, [refreshTenants])

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

  useEffect(() => {
    refreshApprovals(tenantId).catch((err: Error) => setError(err.message))
    void loadArtifacts(tenantId)
    getTenant(tenantId)
      .then(setTenantDetail)
      .catch((err: Error) => setError(err.message))
  }, [tenantId, refreshApprovals, loadArtifacts])

  useEffect(() => {
    if (route.mode !== 'admin') return
    getTenant(tenantId)
      .then((detail) => {
        setTenantDetail(detail)
        setSaveNote(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [route.mode, tenantId])

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

  const sendInDept = async (dept: DeptId, override?: string) => {
    const text = (override ?? draft).trim()
    if (!text || busy) return
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
        setLiveRun({ ...current })
      }

      setLatestReport(current.report ?? null)
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
      await refreshTenants()
      if (current.status !== 'awaiting_approval') {
        setTimeout(() => {
          setLiveRun(null)
          setLiveDept(null)
        }, 800)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLiveRun(null)
      setLiveDept(null)
    } finally {
      setBusy(false)
    }
  }

  const onDecide = async (id: string, decision: 'approved' | 'rejected') => {
    setError(null)
    try {
      const result = await decideApproval(id, decision)
      setLastDecide(
        friendlyDecideNote(
          result.action_type,
          decision,
          String(result.apply_result?.status ?? ''),
        ),
      )
      setLiveRun(null)
      setLiveDept(null)
      await refreshApprovals(tenantId)
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
    litDeptsFromAgentRun(liveRun),
    approvals.length,
  )

  /** Start a run while staying on the office twin so room lights update live. */
  const runFromOffice = async (goal: string) => {
    if (!goal.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const started = await startRun({
        tenant_id: tenantId,
        message: goal,
      })
      setLiveRun(started)
      setLiveDept(null)
      const terminal = new Set(['completed', 'awaiting_approval', 'error'])
      let current = started
      while (!terminal.has(current.status)) {
        await new Promise((r) => setTimeout(r, 280))
        current = await getRun(started.id)
        setLiveRun({ ...current })
      }
      setLatestReport(current.report ?? null)
      await refreshApprovals(tenantId)
      await loadArtifacts(tenantId)
      await refreshTenants()
      // Keep lit soft briefly after completion / HITL
      setTimeout(() => {
        if (current.status !== 'awaiting_approval') {
          setLiveRun(null)
        }
      }, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLiveRun(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-strip" aria-hidden />
          <span className="brand-mark">Monny</span>
          <span className="brand-tag">workspace</span>
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
        </nav>
      </header>

      <main className="page">
        {route.mode === 'admin' ? (
          <>
            <section className="page-intro">
              <div>
                <h1>Admin</h1>
                <p>
                  Impostazioni di <strong>{tenantLabel}</strong>. Solo ciò che serve per
                  collegare negozio e ads.
                </p>
              </div>
            </section>
            <section className="panel">
              <h2>I tuoi negozi</h2>
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
            <section className="panel">
              <h2>Configurazione · {tenantLabel}</h2>
              {tenantDetail && (
                <AdminForm detail={tenantDetail} onSave={saveConfig} busy={busy} />
              )}
              {saveNote && <p className="status-line">{saveNote}</p>}
              {error && <p className="error">{error}</p>}
            </section>
          </>
        ) : route.mode === 'piano' ? (
          <>
            <OfficeTwin
              lights={officeLights}
              pending={deptCounts}
              statusLine={liveRun?.status_line}
              busy={busy}
              onSelect={(id) => navigate({ mode: 'dept', dept: id })}
              onQuickAction={(goal) => void runFromOffice(goal)}
            />
            {error && <p className="error">{error}</p>}
          </>
        ) : activeDept ? (
          <>
            <div className={`dept-shell tint-${activeDept.tint}`}>
              <div className="dept-header">
                <button
                  type="button"
                  className="btn btn-ghost back-btn"
                  onClick={() => navigate({ mode: 'piano' })}
                >
                  ← Piano reparti
                </button>
                <div>
                  <h1>{activeDept.name}</h1>
                  <p>{activeDept.blurb}</p>
                </div>
              </div>

              {liveRun && liveDept === activeDept.id && filteredLiveSteps.length > 0 && (
                <div className="skill-stage" data-testid="skill-rail-live">
                  <SkillRail run={liveRun} steps={filteredLiveSteps} />
                </div>
              )}

              {activeDept.id === 'direzione' ? (
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
              ) : (
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
              )}

              {activeDept.id === 'spend' && spendFromArtifact.length > 0 && (
                <section className="panel report-panel">
                  <h2>Ultimi risultati ads</h2>
                  <SpendPanel channels={spendFromArtifact} />
                </section>
              )}
              {activeDept.id === 'seo' && seoFromArtifact.length > 0 && (
                <section className="panel report-panel">
                  <h2>Ultimi risultati SEO</h2>
                  <SeoPanel changes={seoFromArtifact} />
                </section>
              )}
              {activeDept.id === 'shopify' && artifactNames.length > 0 && (
                <p className="status-line" style={{ marginTop: '1rem' }}>
                  Artifact: {artifactNames.join(', ')}
                </p>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default App
