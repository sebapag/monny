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
import './index.css'

type View = 'agent' | 'admin'
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
  compact = false,
}: {
  run: AgentRun | null
  compact?: boolean
}) {
  if (!run) return null
  const active = run.steps.find((s) => s.status === 'running' || s.status === 'waiting')
  return (
    <div className={`skill-rail ${compact ? 'compact' : ''} status-${run.status}`}>
      {!compact && (
        <div className="skill-rail-head">
          <span className="skill-pulse" aria-hidden />
          <div>
            <strong>{active?.label ?? 'Monny'}</strong>
            <p>{run.status_line}</p>
          </div>
        </div>
      )}
      <ol className="skill-steps">
        {run.steps.map((step) => (
          <li
            key={step.id}
            className={`skill-step family-${skillFamily(step.skill)} status-${step.status}`}
          >
            <span className="skill-dot" aria-hidden />
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SpendPanel({ channels }: { channels: SpendDiagnosis[] }) {
  if (!channels.length) return null
  return (
    <div className="report-block">
      <h3>Spend diagnosis</h3>
      {channels.map((ch) => (
        <div key={ch.channel} className="channel-block">
          <div className="channel-head">
            <strong>{ch.channel}</strong>
            <span>
              €{ch.totals.spend} spend · €{ch.totals.waste_spend} waste (
              {ch.totals.waste_spend_pct}%)
            </span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>ROAS</th>
                <th>CPA</th>
                <th>Spend</th>
                <th>Conv.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ch.campaigns.map((c) => (
                <tr key={`${ch.channel}-${c.id}`} className={c.flags?.length ? 'row-warn' : ''}>
                  <td>{c.name}</td>
                  <td>{c.roas}</td>
                  <td>{c.cpa}</td>
                  <td>€{c.spend}</td>
                  <td>{c.conversions}</td>
                  <td>{c.flags?.length ? c.flags.join(', ') : 'ok'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function SeoPanel({ changes }: { changes: SeoChange[] }) {
  if (!changes.length) return null
  return (
    <div className="report-block">
      <h3>SEO change set</h3>
      {changes.map((change) => (
        <div key={change.url} className="seo-change">
          <div className="seo-url">{change.url}</div>
          <div className="seo-diff">
            <div>
              <span className="muted">title</span>
              <div className="before">{change.before.title || '(vuoto)'}</div>
              <div className="after">{change.after.title}</div>
            </div>
            <div>
              <span className="muted">meta</span>
              <div className="before">{change.before.meta_description || '(vuoto)'}</div>
              <div className="after">{change.after.meta_description}</div>
            </div>
            <div>
              <span className="muted">H1</span>
              <div className="before">{change.before.h1 || '(vuoto)'}</div>
              <div className="after">{change.after.h1}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
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

  return (
    <div className="form-grid">
      <div className="field">
        <label>Nome visualizzato</label>
        <input
          value={cfg.display_name}
          onChange={(e) => set('display_name', e.target.value)}
        />
      </div>

      <div className="section-title">Shopify</div>
      <div className="field-row">
        <div className="field">
          <label>Dominio shop</label>
          <input
            value={cfg.shopify.shop_domain}
            onChange={(e) =>
              set('shopify', { ...cfg.shopify, shop_domain: e.target.value })
            }
          />
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
        <div className="field">
          <label>Token secret_ref</label>
          <input
            value={cfg.shopify.auth.secret_ref}
            onChange={(e) =>
              set('shopify', {
                ...cfg.shopify,
                auth: { secret_ref: e.target.value },
              })
            }
          />
        </div>
      </div>

      <div className="section-title">Google Ads</div>
      <div className="field-row">
        <div className="field">
          <label>Customer ID</label>
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
        <div className="field">
          <label>secret_ref</label>
          <input
            value={cfg.ads.google?.secret_ref ?? ''}
            onChange={(e) =>
              set('ads', {
                ...cfg.ads,
                google: {
                  customer_id: cfg.ads.google?.customer_id ?? '',
                  login_customer_id: cfg.ads.google?.login_customer_id ?? null,
                  secret_ref: e.target.value,
                },
              })
            }
          />
        </div>
      </div>

      <div className="section-title">Meta Ads</div>
      <div className="field-row">
        <div className="field">
          <label>Ad account ID</label>
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
        <div className="field">
          <label>secret_ref</label>
          <input
            value={cfg.ads.meta?.secret_ref ?? ''}
            onChange={(e) =>
              set('ads', {
                ...cfg.ads,
                meta: {
                  ad_account_id: cfg.ads.meta?.ad_account_id ?? '',
                  secret_ref: e.target.value,
                },
              })
            }
          />
        </div>
      </div>

      <div className="section-title">Sito / SEO</div>
      <div className="field-row">
        <div className="field">
          <label>URL base</label>
          <input
            value={cfg.site.base_url}
            onChange={(e) => set('site', { ...cfg.site, base_url: e.target.value })}
          />
        </div>
        <div className="field">
          <label>URL sitemap</label>
          <input
            value={cfg.site.sitemap_url ?? ''}
            onChange={(e) => set('site', { ...cfg.site, sitemap_url: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Adapter CMS</label>
          <select
            value={cfg.site.cms_adapter}
            onChange={(e) => set('site', { ...cfg.site, cms_adapter: e.target.value })}
          >
            <option value="shopify_online_store">shopify_online_store</option>
            <option value="generic_http">generic_http</option>
            <option value="git_content">git_content</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>URL prioritarie (una per riga)</label>
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

      <div className="section-title">Policy / HITL</div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={cfg.policy.hitl_default}
          onChange={(e) =>
            set('policy', { ...cfg.policy, hitl_default: e.target.checked })
          }
        />
        Propose-then-approve di default
      </label>
      <div className="field-row">
        <div className="field">
          <label>ROAS minimo</label>
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
          <label>CPA massimo</label>
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
          <label>Delta budget max %</label>
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

      <div>
        <div className="section-title">Secret ref (questo tenant)</div>
        <p className="status-line">
          I valori vivono in env / secret manager, mai incollati in git.
        </p>
        {detail.secrets.map((s) => (
          <div key={s.secret_ref} className="secret-row">
            <code>{s.secret_ref}</code>
            <span className={`pill ${s.configured ? 'ok' : 'miss'}`}>
              {s.configured ? 'configured' : 'missing'}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={() => void onSave(cfg)}>
          {busy ? 'Salvataggio…' : 'Salva tenant.yaml'}
        </button>
        <span className="status-line">File: {detail.path}</span>
      </div>
    </div>
  )
}

function App() {
  const [view, setView] = useState<View>(
    () => (window.location.hash === '#admin' ? 'admin' : 'agent'),
  )
  const [tenants, setTenants] = useState<TenantListItem[]>([])
  const [tenantId, setTenantId] = useState(
    () => localStorage.getItem(TENANT_KEY) || 'demo',
  )
  const [threadId, setThreadId] = useState<string | undefined>()
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'agent',
      text: 'Monny è in dry-run. Cambia tenant dall’header. Prova spend, SEO, promo o lead warming: vedrai le skill attivarsi in tempo reale.',
    },
  ])
  const [draft, setDraft] = useState('report spend ultimi 7 giorni')
  const [busy, setBusy] = useState(false)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [lastDecide, setLastDecide] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [latestReport, setLatestReport] = useState<Report | null>(null)
  const [artifactNames, setArtifactNames] = useState<string[]>([])
  const [highlightApprovals, setHighlightApprovals] = useState(false)
  const [liveRun, setLiveRun] = useState<AgentRun | null>(null)

  useEffect(() => {
    const onHash = () => setView(window.location.hash === '#admin' ? 'admin' : 'agent')
    window.addEventListener('hashchange', onHash)
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
      if (last?.payload) {
        setLatestReport(last.payload as Report)
      } else {
        setLatestReport(null)
      }
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
    if (view !== 'admin') return
    getTenant(tenantId)
      .then((detail) => {
        setTenantDetail(detail)
        setSaveNote(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [view, tenantId])

  const tenantMeta = useMemo(
    () => tenants.find((t) => t.tenant_id === tenantId),
    [tenants, tenantId],
  )
  const tenantLabel = tenantMeta?.display_name ?? tenantId

  const switchTenant = (id: string) => {
    if (id === tenantId) return
    setTenantId(id)
    setThreadId(undefined)
    setLastDecide(null)
    setHighlightApprovals(false)
    setLiveRun(null)
    setMessages([
      {
        role: 'agent',
        text: `Passato al tenant “${id}”. Chiedi un report spend, un audit SEO, uno stub promo o lead warming.`,
      },
    ])
  }

  const send = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    setError(null)
    const text = draft.trim()
    setMessages((m) => [...m, { role: 'user', text }])
    setDraft('')
    try {
      const started = await startRun({
        tenant_id: tenantId,
        message: text,
        thread_id: threadId,
      })
      setThreadId(started.thread_id)
      setLiveRun(started)

      const terminal = new Set(['completed', 'awaiting_approval', 'error'])
      let current = started
      while (!terminal.has(current.status)) {
        await new Promise((r) => setTimeout(r, 280))
        current = await getRun(started.id)
        setLiveRun({ ...current })
      }

      setLatestReport(current.report ?? null)
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: current.reply || current.status_line || 'Fatto.',
          report: current.report,
          timeline: current.steps,
          runStatus: current.status,
        },
      ])
      if (current.status === 'awaiting_approval') {
        setHighlightApprovals(true)
      }
      const pending = await refreshApprovals(tenantId)
      if (current.approval_ids.length || pending.length) {
        setHighlightApprovals(true)
      }
      await loadArtifacts(tenantId)
      await refreshTenants()
      // Keep rail briefly on HITL, then settle to compact history in thread
      if (current.status !== 'awaiting_approval') {
        setTimeout(() => setLiveRun(null), 800)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLiveRun(null)
    } finally {
      setBusy(false)
    }
  }

  const onDecide = async (id: string, decision: 'approved' | 'rejected') => {
    setError(null)
    try {
      const result = await decideApproval(id, decision)
      setLastDecide(
        decision === 'approved'
          ? `Approvato ${result.action_type}: ${result.apply_result?.status ?? 'ok'}`
          : `Rifiutato ${result.action_type}`,
      )
      setLiveRun(null)
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
      setSaveNote(`Saved to ${res.path}`)
      const detail = await getTenant(tenantId)
      setTenantDetail(detail)
      await refreshTenants()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const spendFromArtifact = (latestReport?.spend_channels ?? []) as SpendDiagnosis[]
  const seoFromArtifact = (latestReport?.seo_change_set?.changes ?? []) as SeoChange[]

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-strip" aria-hidden />
          <span className="brand-mark">Monny</span>
          <span className="brand-tag">workspace</span>
        </div>
        <div className="tenant-switch">
          <label htmlFor="global-tenant">Tenant</label>
          <select
            id="global-tenant"
            value={tenantId}
            onChange={(e) => switchTenant(e.target.value)}
          >
            {tenants.map((t) => (
              <option key={t.tenant_id} value={t.tenant_id}>
                {t.display_name} ({t.tenant_id})
                {t.pending_approvals ? ` · ${t.pending_approvals} pending` : ''}
              </option>
            ))}
          </select>
          {tenantMeta && (
            <span className="pill miss">
              secrets {tenantMeta.secrets_configured ?? 0}/{tenantMeta.secrets_total ?? 0}
            </span>
          )}
        </div>
        <nav className="nav">
          <a
            href="#agent"
            className={view === 'agent' ? 'active' : ''}
            onClick={() => setView('agent')}
          >
            Agent
          </a>
          <a
            href="#admin"
            className={view === 'admin' ? 'active' : ''}
            onClick={() => setView('admin')}
          >
            Admin
          </a>
        </nav>
      </header>

      <main className="page">
        {view === 'agent' ? (
          <>
            <section className="page-intro">
              <div>
                <h1>Agent</h1>
                <p>
                  Console operativa per <strong>{tenantLabel}</strong>. Le skill si attivano
                  in evidenza; le proposte restano in attesa della tua decisione.
                </p>
              </div>
            </section>

            {liveRun && (
              <div className="skill-stage" data-testid="skill-rail-live">
                <SkillRail run={liveRun} />
              </div>
            )}

            {approvals.length > 0 && (
              <div className={`approval-banner ${highlightApprovals ? 'pulse' : ''}`}>
                <strong>{approvals.length} approvazione/i in sospeso</strong> per {tenantId}.{' '}
                <a href="#approvals" onClick={() => setHighlightApprovals(false)}>
                  Rivedi →
                </a>
              </div>
            )}

            <div className="layout-split">
              <section className="panel console-panel">
                <h2>Console · {tenantLabel}</h2>
                <div className="quick-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('report spend ultimi 7 giorni')}
                  >
                    Report spend
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('seo audit of priority pages')}
                  >
                    Audit SEO
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('propose shopify promo discount')}
                  >
                    Stub promo
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('lead warming sequence stub')}
                  >
                    Stub lead
                  </button>
                </div>
                <div className="chat-log">
                  {messages.map((m, i) => (
                    <div key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
                      {m.text}
                      {m.timeline && m.timeline.length > 0 && (
                        <div className="thread-timeline">
                          <SkillRail
                            compact
                            run={{
                              id: `hist-${i}`,
                              tenant_id: tenantId,
                              thread_id: threadId || '',
                              goal: '',
                              status: m.runStatus || 'completed',
                              status_line: '',
                              steps: m.timeline,
                              approval_ids: [],
                              created_at: '',
                              updated_at: '',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="composer">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
                    }}
                    placeholder="Chiedi a Monny…"
                  />
                  <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
                    {busy ? 'In corso…' : 'Invia'}
                  </button>
                </div>
                {error && <p className="error">{error}</p>}
              </section>

              <section className="panel" id="approvals">
                <h2>Approvazioni</h2>
                {lastDecide && <p className="status-line">{lastDecide}</p>}
                {approvals.length === 0 && (
                  <p className="status-line">Nessuna azione in attesa.</p>
                )}
                {approvals.map((a) => (
                  <div key={a.id} className="approval">
                    <div>
                      <strong>{a.action_type}</strong>
                      <div>{a.summary}</div>
                      <div className="meta">
                        {a.id.slice(0, 8)} · {a.created_at}
                      </div>
                    </div>
                    <div className="approval-actions">
                      <button className="btn btn-ok" onClick={() => void onDecide(a.id, 'approved')}>
                        Approva
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => void onDecide(a.id, 'rejected')}
                      >
                        Rifiuta
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            </div>

            <section className="panel report-panel">
              <h2>Artifact salvati</h2>
              <p className="status-line">
                {artifactNames.length
                  ? artifactNames.join(' · ')
                  : 'Nessun artifact ancora. Avvia un job spend o SEO.'}
              </p>
              <SpendPanel channels={spendFromArtifact} />
              <SeoPanel changes={seoFromArtifact} />
            </section>
          </>
        ) : (
          <>
            <section className="page-intro">
              <div>
                <h1>Admin</h1>
                <p>
                  Configurazione di <strong>{tenantLabel}</strong> (`{tenantId}`). I secret
                  sono solo riferimenti.
                </p>
              </div>
            </section>

            <section className="panel">
              <h2>Tenant</h2>
              <div className="tenant-chips">
                {tenants.map((t) => (
                  <button
                    key={t.tenant_id}
                    type="button"
                    className={`tenant-chip ${t.tenant_id === tenantId ? 'active' : ''}`}
                    onClick={() => switchTenant(t.tenant_id)}
                  >
                    <strong>{t.display_name}</strong>
                    <span>{t.tenant_id}</span>
                    <span className="meta">
                      secrets {t.secrets_configured}/{t.secrets_total}
                      {t.pending_approvals
                        ? ` · ${t.pending_approvals} pending`
                        : ''}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>Configurazione · {tenantId}</h2>
              {tenantDetail && (
                <AdminForm detail={tenantDetail} onSave={saveConfig} busy={busy} />
              )}
              {saveNote && <p className="status-line">{saveNote}</p>}
              {error && <p className="error">{error}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
