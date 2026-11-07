import { useEffect, useMemo, useState } from 'react'
import {
  type Approval,
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
type Msg = { role: 'user' | 'agent'; text: string }

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
      text: 'Monny is in dry-run. Ask for a spend report, SEO audit, or both.',
    },
  ])
  const [draft, setDraft] = useState('report spend ultimi 7 giorni')
  const [busy, setBusy] = useState(false)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null)
  const [configJson, setConfigJson] = useState('')
  const [saveNote, setSaveNote] = useState<string | null>(null)

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
        setConfigJson(JSON.stringify(detail.config, null, 2))
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
      setMessages((m) => [...m, { role: 'agent', text: res.reply }])
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
      await decideApproval(id, decision)
      await refreshApprovals(tenantId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const saveConfig = async () => {
    setError(null)
    setSaveNote(null)
    try {
      const parsed = JSON.parse(configJson) as Record<string, unknown>
      const res = await putTenant(tenantId, parsed)
      setSaveNote(`Saved to ${res.path}`)
      const detail = await getTenant(tenantId)
      setTenantDetail(detail)
      setConfigJson(JSON.stringify(detail.config, null, 2))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
                    }}
                  >
                    {tenants.map((t) => (
                      <option key={t.tenant_id} value={t.tenant_id}>
                        {t.display_name} ({t.tenant_id})
                      </option>
                    ))}
                  </select>
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
                {approvals.length === 0 && (
                  <p className="status-line">No gated actions waiting.</p>
                )}
                {approvals.map((a) => (
                  <div key={a.id} className="approval">
                    <div>
                      <strong>{a.action_type}</strong>
                      <div>{a.summary}</div>
                      <div className="meta">{a.id.slice(0, 8)} · {a.created_at}</div>
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
              <div className="form-grid">
                <div className="field">
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

                <div>
                  <div className="section-title">Secret refs</div>
                  <p className="status-line">
                    Values live in env / secret manager. YAML only keeps the name.
                  </p>
                  {(tenantDetail?.secrets ?? []).map((s) => (
                    <div key={s.secret_ref} className="secret-row">
                      <code>{s.secret_ref}</code>
                      <span className={`pill ${s.configured ? 'ok' : 'miss'}`}>
                        {s.configured ? 'configured' : 'missing'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="field">
                  <label htmlFor="config">tenant.yaml (JSON editor)</label>
                  <textarea
                    id="config"
                    rows={22}
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={() => void saveConfig()}>
                    Save config
                  </button>
                  {tenantDetail && (
                    <span className="status-line">File: {tenantDetail.path}</span>
                  )}
                </div>
                {saveNote && <p className="status-line">{saveNote}</p>}
                {error && <p className="error">{error}</p>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
