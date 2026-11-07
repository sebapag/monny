import { useEffect, useMemo, useState } from 'react'
import {
  type Approval,
  type Report,
  type SeoChange,
  type SpendDiagnosis,
  type TenantConfig,
  type TenantDetail,
  chat,
  decideApproval,
  getTenant,
  listApprovals,
  listTenants,
  putTenant,
} from './api'
import './index.css'

type View = 'agent' | 'admin'
type Msg = {
  role: 'user' | 'agent'
  text: string
  report?: Report | null
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
              <div className="before">{change.before.title || '—'}</div>
              <div className="after">{change.after.title}</div>
            </div>
            <div>
              <span className="muted">meta</span>
              <div className="before">{change.before.meta_description || '—'}</div>
              <div className="after">{change.after.meta_description}</div>
            </div>
            <div>
              <span className="muted">H1</span>
              <div className="before">{change.before.h1 || '—'}</div>
              <div className="after">{change.after.h1}</div>
            </div>
          </div>
          {!!change.issues?.length && (
            <ul className="issue-list">
              {change.issues.map((issue) => (
                <li key={`${change.url}-${issue.code}`}>
                  <span className={`sev sev-${issue.severity}`}>{issue.severity}</span>{' '}
                  {issue.detail}
                </li>
              ))}
            </ul>
          )}
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
        <label>Display name</label>
        <input
          value={cfg.display_name}
          onChange={(e) => set('display_name', e.target.value)}
        />
      </div>

      <div className="section-title">Shopify</div>
      <div className="field-row">
        <div className="field">
          <label>Shop domain</label>
          <input
            value={cfg.shopify.shop_domain}
            onChange={(e) =>
              set('shopify', { ...cfg.shopify, shop_domain: e.target.value })
            }
          />
        </div>
        <div className="field">
          <label>API version</label>
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

      <div className="section-title">Site / SEO</div>
      <div className="field-row">
        <div className="field">
          <label>Base URL</label>
          <input
            value={cfg.site.base_url}
            onChange={(e) => set('site', { ...cfg.site, base_url: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Sitemap URL</label>
          <input
            value={cfg.site.sitemap_url ?? ''}
            onChange={(e) => set('site', { ...cfg.site, sitemap_url: e.target.value })}
          />
        </div>
        <div className="field">
          <label>CMS adapter</label>
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
        <label>Priority URLs (one per line)</label>
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
        Propose-then-approve by default
      </label>
      <div className="field-row">
        <div className="field">
          <label>Min ROAS</label>
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
          <label>Max CPA</label>
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
          <label>Max budget Δ %</label>
          <input
            type="number"
            step="1"
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
        <div className="field">
          <label>SEO max URLs / run</label>
          <input
            type="number"
            value={cfg.policy.seo.max_urls_per_run}
            onChange={(e) =>
              set('policy', {
                ...cfg.policy,
                seo: {
                  ...cfg.policy.seo,
                  max_urls_per_run: Number(e.target.value),
                },
              })
            }
          />
        </div>
      </div>

      <div>
        <div className="section-title">Secret refs</div>
        <p className="status-line">
          Values live in env / secret manager — never pasted into git.
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
          {busy ? 'Saving…' : 'Save tenant.yaml'}
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
  const [tenants, setTenants] = useState<{ tenant_id: string; display_name: string }[]>([])
  const [tenantId, setTenantId] = useState('demo')
  const [threadId, setThreadId] = useState<string | undefined>()
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'agent',
      text: 'Monny is in dry-run. Try “report spend” or “seo audit”.',
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

  useEffect(() => {
    const onHash = () => setView(window.location.hash === '#admin' ? 'admin' : 'agent')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    listTenants()
      .then((items) => {
        setTenants(items)
        if (items.length && !items.find((t) => t.tenant_id === tenantId)) {
          setTenantId(items[0].tenant_id)
        }
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  const refreshApprovals = async (id = tenantId) => {
    const items = await listApprovals(id)
    setApprovals(items)
  }

  useEffect(() => {
    refreshApprovals(tenantId).catch((err: Error) => setError(err.message))
  }, [tenantId])

  useEffect(() => {
    if (view !== 'admin') return
    getTenant(tenantId)
      .then((detail) => {
        setTenantDetail(detail)
        setSaveNote(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [view, tenantId])

  const tenantLabel = useMemo(
    () => tenants.find((t) => t.tenant_id === tenantId)?.display_name ?? tenantId,
    [tenants, tenantId],
  )

  const send = async () => {
    if (!draft.trim() || busy) return
    setBusy(true)
    setError(null)
    const text = draft.trim()
    setMessages((m) => [...m, { role: 'user', text }])
    setDraft('')
    try {
      const res = await chat({
        tenant_id: tenantId,
        message: text,
        thread_id: threadId,
      })
      setThreadId(res.thread_id)
      setLatestReport(res.report ?? null)
      setMessages((m) => [
        ...m,
        { role: 'agent', text: res.reply, report: res.report },
      ])
      await refreshApprovals(tenantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
          ? `Approved ${result.action_type} → ${result.apply_result?.status ?? 'ok'}`
          : `Rejected ${result.action_type}`,
      )
      await refreshApprovals(tenantId)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">Monny</span>
          <span className="brand-tag">spend · seo</span>
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
            <section className="hero">
              <h1>Monny</h1>
              <p>
                Steer spend and SEO for <strong>{tenantLabel}</strong>. Proposals wait for your
                approval before anything applies.
              </p>
            </section>

            <div className="layout-split">
              <section className="panel">
                <h2>Console</h2>
                <div className="field" style={{ marginBottom: '0.8rem' }}>
                  <label htmlFor="tenant">Tenant</label>
                  <select
                    id="tenant"
                    value={tenantId}
                    onChange={(e) => {
                      setTenantId(e.target.value)
                      setThreadId(undefined)
                      setLatestReport(null)
                    }}
                  >
                    {tenants.map((t) => (
                      <option key={t.tenant_id} value={t.tenant_id}>
                        {t.display_name} ({t.tenant_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="quick-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('report spend ultimi 7 giorni')}
                  >
                    Spend report
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setDraft('seo audit of priority pages')}
                  >
                    SEO audit
                  </button>
                </div>
                <div className="chat-log">
                  {messages.map((m, i) => (
                    <div key={`${m.role}-${i}`} className={`bubble ${m.role}`}>
                      {m.text}
                    </div>
                  ))}
                </div>
                <div className="composer">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        void send()
                      }
                    }}
                    placeholder="Ask Monny for a spend report or SEO audit…"
                  />
                  <button className="btn btn-primary" disabled={busy} onClick={() => void send()}>
                    {busy ? 'Running…' : 'Send'}
                  </button>
                </div>
                {error && <p className="error">{error}</p>}
              </section>

              <section className="panel">
                <h2>Pending approvals</h2>
                {lastDecide && <p className="status-line">{lastDecide}</p>}
                {approvals.length === 0 && (
                  <p className="status-line">No gated actions waiting.</p>
                )}
                {approvals.map((a) => (
                  <div key={a.id} className="approval">
                    <div>
                      <strong>{a.action_type}</strong>
                      <div>{a.summary}</div>
                      {a.payload?.metrics != null && (
                        <div className="meta">
                          metrics: {JSON.stringify(a.payload.metrics)}
                        </div>
                      )}
                      <div className="meta">
                        {a.id.slice(0, 8)} · {a.created_at}
                      </div>
                    </div>
                    <div className="approval-actions">
                      <button className="btn btn-ok" onClick={() => void onDecide(a.id, 'approved')}>
                        Approve
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => void onDecide(a.id, 'rejected')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            </div>

            {latestReport && (
              <section className="panel report-panel">
                <h2>Latest structured report</h2>
                <SpendPanel channels={latestReport.spend_channels ?? []} />
                <SeoPanel changes={latestReport.seo_change_set?.changes ?? []} />
              </section>
            )}
          </>
        ) : (
          <>
            <section className="hero">
              <h1>Monny</h1>
              <p>
                Admin — portable tenant config. Store secret <em>references</em>, not raw tokens.
              </p>
            </section>

            <section className="panel">
              <h2>Tenant configuration</h2>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label htmlFor="admin-tenant">Tenant</label>
                <select
                  id="admin-tenant"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                >
                  {tenants.map((t) => (
                    <option key={t.tenant_id} value={t.tenant_id}>
                      {t.display_name} ({t.tenant_id})
                    </option>
                  ))}
                </select>
              </div>
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
