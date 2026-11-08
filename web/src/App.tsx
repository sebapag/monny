import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type AgentRun,
  type Approval,
  type KnowledgeSource,
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
  listKnowledge,
  listTenantArtifacts,
  listTenants,
  putTenant,
  startRun,
  toggleKnowledgeSource,
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
import type { OfficeMode } from './api'
import {
  assertGoalAllowed,
  effectiveOfficeMode,
  featuresFromConfig,
  isDeptEnabled,
  lockedHintIt,
  skillsFromConfig,
} from './entitlements'
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
        Documenti aziendali che Monny consulta prima di spend e SEO. Per ora sono file
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

      <div className="section-title">Attivazione piano / reparti</div>
      <FieldHelp>
        Scegli i reparti inclusi nella sottoscrizione. Leadership (decisioni HITL) resta
        sempre disponibile. I reparti spenti non partono nell’agent e restano chiusi
        nell’ufficio.
      </FieldHelp>
      <div className="field">
        <label>Piano</label>
        <select
          value={cfg.subscription?.plan ?? 'growth'}
          onChange={(e) =>
            set('subscription', {
              plan: e.target.value as 'starter' | 'growth' | 'scale',
              skills: {
                spend: true,
                seo: true,
                shopify: false,
                leads: false,
                ...(cfg.subscription?.skills ?? {}),
              },
              features: {
                office_view: false,
                ...(cfg.subscription?.features ?? {}),
              },
              office_mode: cfg.subscription?.office_mode ?? 'auto',
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
          ] as const
        ).map(([key, title, hint]) => {
          const skills = {
            spend: true,
            seo: true,
            shopify: false,
            leads: false,
            ...(cfg.subscription?.skills ?? {}),
          }
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
                      office_view: false,
                      ...(cfg.subscription?.features ?? {}),
                    },
                    office_mode: cfg.subscription?.office_mode ?? 'auto',
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
          Leadership / decisioni: sempre attivo
        </p>
      </div>

      <div className="section-title">Vista ufficio</div>
      <FieldHelp>
        Opzione a pagamento: scegli se l’home Agent mostra la vista completa 3D, la
        vista leggera (2D), o lascia che Monny scelga in automatico in base al browser.
        Senza questa opzione resta sempre la modalità automatica.
      </FieldHelp>
      {(() => {
        const features = {
          office_view: false,
          ...(cfg.subscription?.features ?? {}),
        }
        const officeMode = (cfg.subscription?.office_mode ?? 'auto') as OfficeMode
        const entitled = Boolean(features.office_view)
        return (
          <div className="skill-toggles office-view-toggles">
            <label className="check-row skill-toggle">
              <input
                type="checkbox"
                checked={entitled}
                onChange={(e) =>
                  set('subscription', {
                    plan: cfg.subscription?.plan ?? 'growth',
                    skills: {
                      spend: true,
                      seo: true,
                      shopify: false,
                      leads: false,
                      ...(cfg.subscription?.skills ?? {}),
                    },
                    features: { ...features, office_view: e.target.checked },
                    office_mode: e.target.checked ? officeMode : 'auto',
                  })
                }
              />
              <span>
                <strong>Modalità vista ufficio</strong>
                <span className="muted">
                  {' '}
                  — Sblocca la scelta Completa / Leggera / Automatica
                </span>
              </span>
            </label>
            <div className="field" style={{ marginTop: '0.35rem' }}>
              <label htmlFor="office-mode-select">Presentazione ufficio</label>
              <select
                id="office-mode-select"
                data-testid="office-mode-select"
                disabled={!entitled}
                value={entitled ? officeMode : 'auto'}
                onChange={(e) =>
                  set('subscription', {
                    plan: cfg.subscription?.plan ?? 'growth',
                    skills: {
                      spend: true,
                      seo: true,
                      shopify: false,
                      leads: false,
                      ...(cfg.subscription?.skills ?? {}),
                    },
                    features,
                    office_mode: e.target.value as OfficeMode,
                  })
                }
              >
                <option value="auto">Automatica (consigliata)</option>
                <option value="full">Completa (3D)</option>
                <option value="light">Leggera</option>
              </select>
              {!entitled && (
                <p className="status-line" style={{ marginTop: '0.35rem' }}>
                  Opzione non attiva: resta Automatica. Attivala qui per venderla come
                  extra frontend.
                </p>
              )}
            </div>
          </div>
        )
      })()}

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
  const officeFeatures = featuresFromConfig(tenantDetail?.config)
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
      await refreshApprovals(tenantId)
      await loadArtifacts(tenantId)
      await refreshTenants()
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

  return (
    <div className="app-shell">
      <div className="app-chrome">
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

        {route.mode !== 'admin' && approvals.length > 0 && (
          <DecisionsAlert count={approvals.length} onOpen={openDecisions} />
        )}
      </div>

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
            <section className="panel">
              <h2>Conoscenza aziendale</h2>
              <KnowledgeAdminPanel tenantId={tenantId} busy={busy} />
            </section>
          </>
        ) : route.mode === 'piano' ? (
          <>
            <OfficeTwin
              lights={officeLights}
              pending={deptCounts}
              enabled={entitlementSkills}
              officeMode={officeMode}
              officeViewEntitled={officeFeatures.office_view}
              statusLine={liveRun?.status_line}
              busy={busy}
              onSelect={(id) => {
                if (!isDeptEnabled(id, entitlementSkills)) {
                  setError(lockedHintIt(id))
                  return
                }
                setError(null)
                navigate({ mode: 'dept', dept: id })
              }}
              onQuickAction={(goal) => void runFromOffice(goal)}
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
                  onClick={() => navigate({ mode: 'piano' })}
                >
                  ← Piano reparti
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
                  <SpendPanel channels={spendFromArtifact} />
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
    </div>
  )
}

export default App
