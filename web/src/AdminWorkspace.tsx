import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type {
  BillingConfig,
  DecisionAutonomy,
  DecisionRights,
  OfficeMode,
  TenantConfig,
  TenantDetail,
  TenantListItem,
} from './api'
import {
  billingFromConfig,
  chargeExplainers,
  formatEuro,
  monthPeriodLabelIt,
  spendProgressPct,
} from './adminBilling'
import {
  ADMIN_SECTIONS,
  adminSectionById,
  type AdminSectionId,
} from './adminNav'
import {
  COMMERCE_CONNECTORS,
  isShopifyConnected,
} from './commerceConnectors'
import {
  isPlusEntitled,
  mergeSkills,
  normalizePlan,
} from './entitlements'
import { skillsForDepartment, type SkillDef } from './skillCatalog'

function FieldHelp({ children }: { children: string }) {
  return <p className="field-help">{children}</p>
}

function setBilling(cfg: TenantConfig, patch: Partial<BillingConfig>): BillingConfig {
  return { ...billingFromConfig(cfg), ...patch }
}

type Props = {
  detail: TenantDetail
  onSave: (config: TenantConfig) => Promise<void>
  busy: boolean
  section: AdminSectionId | null
  onNavigateSection: (section: AdminSectionId | null) => void
  tenants: TenantListItem[]
  tenantId: string
  onSwitchTenant: (id: string) => void
  tenantLabel: string
  knowledgePanel: ReactNode
  usersPanel: ReactNode
  saveNote: string | null
  error: string | null
}

export function AdminWorkspace({
  detail,
  onSave,
  busy,
  section,
  onNavigateSection,
  tenants,
  tenantId,
  onSwitchTenant,
  tenantLabel,
  knowledgePanel,
  usersPanel,
  saveNote,
  error,
}: Props) {
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
  const needsConfigSave =
    section === 'spend' ||
    section === 'shop' ||
    section === 'ads' ||
    section === 'connectors' ||
    section === 'plan' ||
    section === 'office' ||
    section === 'rules'

  const shopifyLinked = isShopifyConnected(cfg.shopify)
  const shopifySecretOk = Boolean(secretStatus(cfg.shopify.auth.secret_ref))

  const connectShopify = () => {
    const domain = (cfg.shopify.shop_domain || '').trim()
    if (!domain) return
    const skills = mergeSkills(cfg.subscription?.skills)
    setCfg((c) => ({
      ...c,
      shopify: { ...c.shopify, connected: true, shop_domain: domain },
      subscription: {
        plan: normalizePlan(c.subscription?.plan),
        plus_override: Boolean(c.subscription?.plus_override),
        skills: { ...skills, shopify: true },
        features: { office_view: true, ...(c.subscription?.features ?? {}) },
        office_mode: c.subscription?.office_mode ?? 'full',
      },
    }))
  }

  const disconnectShopify = () => {
    setCfg((c) => ({
      ...c,
      shopify: { ...c.shopify, connected: false },
    }))
  }

  const saveBar = needsConfigSave ? (
    <div className="admin-save-bar">
      <button className="btn btn-primary" disabled={busy} onClick={() => void onSave(cfg)}>
        {busy ? 'Salvataggio…' : 'Salva questa sezione'}
      </button>
      <span className="status-line">File: {detail.path.split('/').slice(-2).join('/')}</span>
    </div>
  ) : null

  const spendPreview = (
    <span className="admin-tile-metric" data-testid="admin-hub-spend-preview">
      {formatEuro(spent)}
      <em> / {formatEuro(budget)}</em>
    </span>
  )

  if (!section) {
    return (
      <div className="admin-workspace" data-testid="admin-hub">
        <section className="page-intro admin-intro">
          <div>
            <p className="admin-brand-lockup">
              <span className="admin-brand-name">Atrium</span>
              <span className="admin-brand-sub">Workspace marketing</span>
            </p>
            <h1>Admin</h1>
            <p>
              Scegli una sezione per <strong>{tenantLabel}</strong>. Una alla volta, senza lista
              infinita.
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
                onClick={() => onSwitchTenant(t.tenant_id)}
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

        <section className="admin-hub-panel" aria-label="Sezioni Admin">
          <div className="admin-tile-grid" data-testid="admin-tile-grid">
            {ADMIN_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`admin-tile tint-${s.tint}`}
                data-testid={`admin-tile-${s.id}`}
                onClick={() => onNavigateSection(s.id)}
              >
                <span className="admin-tile-title">{s.title}</span>
                <span className="admin-tile-blurb">{s.blurb}</span>
                {s.id === 'spend' ? spendPreview : null}
                <span className="admin-tile-go" aria-hidden>
                  Apri →
                </span>
              </button>
            ))}
          </div>
        </section>
        {error && <p className="error">{error}</p>}
      </div>
    )
  }

  const meta = adminSectionById(section)

  return (
    <div className="admin-workspace is-detail" data-testid="admin-detail">
      <div className="admin-detail-shell">
        <aside className="admin-side-nav" aria-label="Sezioni Admin">
          <button
            type="button"
            className="admin-side-hub"
            data-testid="admin-back-hub"
            onClick={() => onNavigateSection(null)}
          >
            ← Tutte le sezioni
          </button>
          <nav className="admin-side-list">
            {ADMIN_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`admin-side-item${s.id === section ? ' active' : ''}`}
                data-testid={`admin-nav-${s.id}`}
                aria-current={s.id === section ? 'page' : undefined}
                onClick={() => onNavigateSection(s.id)}
              >
                <strong>{s.title}</strong>
                {s.id === 'spend' ? (
                  <span className="admin-side-spend">{formatEuro(spent)}</span>
                ) : null}
              </button>
            ))}
          </nav>
        </aside>

        <div className="admin-detail-main">
          <header className="admin-detail-head">
            <button
              type="button"
              className="admin-mobile-back"
              onClick={() => onNavigateSection(null)}
            >
              ← Sezioni
            </button>
            <p className="admin-kicker">Atrium · {tenantLabel}</p>
            <h1>{meta.title}</h1>
            <p>{meta.blurb}</p>
          </header>

          <section className="panel admin-config-panel admin-section-panel">
            {section === 'spend' && (
              <div className="admin-block admin-spend" data-testid="admin-monthly-spend">
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
                        set(
                          'billing',
                          setBilling(cfg, { ads_monthly_budget_eur: Number(e.target.value) }),
                        )
                      }
                    />
                    <FieldHelp>
                      Soglia che vuoi rispettare questo mese. Non blocca Google/Meta da sola.
                    </FieldHelp>
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
                          setBilling(cfg, {
                            ads_spent_this_month_eur: Number(e.target.value),
                          }),
                        )
                      }
                    />
                    <FieldHelp>
                      Ultimo sync o valore manuale finché i canali non aggiornano in automatico.
                    </FieldHelp>
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
                            renews_on_day: Math.min(
                              28,
                              Math.max(1, Number(e.target.value) || 1),
                            ),
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
                        set(
                          'billing',
                          setBilling(cfg, { atrium_price_eur: Number(e.target.value) }),
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {section === 'shop' && (
              <div className="form-grid" data-testid="admin-shop-urls">
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
                      onChange={(e) =>
                        set('site', { ...cfg.site, sitemap_url: e.target.value })
                      }
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
            )}

            {section === 'connectors' && (
              <div className="admin-block" data-testid="admin-commerce-connectors">
                <FieldHelp>
                  Shopify è incluso: collega dominio e token del tenant (portable, mai un negozio
                  fisso nel codice). Gli altri store restano «Prossimamente» — niente adapter finti.
                </FieldHelp>
                <div className="connector-grid" data-testid="connector-grid">
                  {COMMERCE_CONNECTORS.map((provider) => {
                    const included = provider.status === 'included'
                    const isShopify = provider.id === 'shopify'
                    return (
                      <article
                        key={provider.id}
                        className={`connector-card${included ? ' is-included' : ' is-soon'}`}
                        data-testid={`connector-${provider.id}`}
                        data-status={provider.status}
                        aria-disabled={!included}
                      >
                        <div
                          className="connector-logo"
                          style={
                            included
                              ? ({ '--connector-brand': provider.brand } as CSSProperties)
                              : undefined
                          }
                          aria-hidden
                        >
                          <svg viewBox="0 0 48 48" width="40" height="40">
                            <path
                              d={provider.mark}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <div className="connector-body">
                          <strong className="connector-name">{provider.name}</strong>
                          <span className="connector-blurb">{provider.blurb}</span>
                          {!included ? (
                            <span className="connector-soon" data-testid={`connector-soon-${provider.id}`}>
                              Prossimamente
                            </span>
                          ) : null}
                        </div>
                        {isShopify ? (
                          <div className="connector-actions">
                            <div className="field">
                              <label htmlFor="connector-shop-domain">Dominio negozio</label>
                              <input
                                id="connector-shop-domain"
                                data-testid="connector-shop-domain"
                                value={cfg.shopify.shop_domain}
                                disabled={shopifyLinked}
                                onChange={(e) =>
                                  set('shopify', {
                                    ...cfg.shopify,
                                    shop_domain: e.target.value,
                                  })
                                }
                                placeholder="mio-negozio.myshopify.com"
                              />
                            </div>
                            <div className="secret-status-row">
                              <span>Token ({cfg.shopify.auth.secret_ref})</span>
                              <span className={`pill ${shopifySecretOk ? 'ok' : 'miss'}`}>
                                {shopifySecretOk ? 'Configurato' : 'Mancante'}
                              </span>
                            </div>
                            <div className="connector-cta-row">
                              {shopifyLinked ? (
                                <>
                                  <span
                                    className="pill ok"
                                    data-testid="connector-shopify-status"
                                  >
                                    Collegato
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-ghost"
                                    data-testid="connector-shopify-disconnect"
                                    disabled={busy}
                                    onClick={disconnectShopify}
                                  >
                                    Disconnetti
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  data-testid="connector-shopify-connect"
                                  disabled={busy || !(cfg.shopify.shop_domain || '').trim()}
                                  onClick={connectShopify}
                                >
                                  Collega
                                </button>
                              )}
                            </div>
                            <p className="field-help">
                              Il token resta in env / secret manager con nome{' '}
                              <code>{cfg.shopify.auth.secret_ref}</code>. Salva la sezione dopo
                              Collega / Disconnetti.
                            </p>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn connector-disabled-btn"
                            disabled
                            tabIndex={-1}
                            aria-disabled="true"
                          >
                            Non disponibile
                          </button>
                        )}
                      </article>
                    )
                  })}
                </div>
              </div>
            )}

            {section === 'ads' && (
              <div className="form-grid" data-testid="admin-ads-accounts">
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
                    className={`pill ${
                      secretStatus(cfg.ads.google?.secret_ref || '') ? 'ok' : 'miss'
                    }`}
                  >
                    {secretStatus(cfg.ads.google?.secret_ref || '') ? 'Configurato' : 'Mancante'}
                  </span>
                </div>
              </div>
            )}

            {section === 'plan' && (
              <div className="form-grid" data-testid="admin-plan-skills">
                <FieldHelp>
                  Piano prodotto Free o Plus (Stripe stub: imposta qui). Leadership resta sempre
                  disponibile. I reparti spenti non partono nell’agent; le skill Plus richiedono
                  piano Plus (o override Admin). Ufficio 3D per tutti.
                </FieldHelp>
                <div className="field">
                  <label>Piano</label>
                  <select
                    data-testid="plan-select"
                    value={normalizePlan(cfg.subscription?.plan)}
                    onChange={(e) =>
                      set('subscription', {
                        plan: e.target.value as 'free' | 'plus',
                        plus_override: Boolean(cfg.subscription?.plus_override),
                        skills: mergeSkills(cfg.subscription?.skills),
                        features: {
                          office_view: true,
                          ...(cfg.subscription?.features ?? {}),
                        },
                        office_mode: cfg.subscription?.office_mode ?? 'full',
                      })
                    }
                  >
                    <option value="free">Free</option>
                    <option value="plus">Plus</option>
                  </select>
                </div>
                <label className="check-row skill-toggle" style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="checkbox"
                    data-testid="plus-override"
                    checked={Boolean(cfg.subscription?.plus_override)}
                    onChange={(e) =>
                      set('subscription', {
                        plan: normalizePlan(cfg.subscription?.plan),
                        plus_override: e.target.checked,
                        skills: mergeSkills(cfg.subscription?.skills),
                        features: {
                          office_view: true,
                          ...(cfg.subscription?.features ?? {}),
                        },
                        office_mode: cfg.subscription?.office_mode ?? 'full',
                      })
                    }
                  />
                  <span>
                    <strong>Override Plus (Admin)</strong>
                    <span className="muted">
                      {' '}
                      — sblocca skill Plus senza cambiare il piano (utile finché Stripe è stub)
                    </span>
                  </span>
                </label>
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
                    const deptSkills = skillsForDepartment(key)
                    return (
                      <div key={key} className="skill-toggle-block">
                        <label className="check-row skill-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(skills[key])}
                            onChange={(e) =>
                              set('subscription', {
                                plan: normalizePlan(cfg.subscription?.plan),
                                plus_override: Boolean(cfg.subscription?.plus_override),
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
                        {deptSkills.length > 0 && (
                          <ul className="skill-tier-list" data-testid={`skill-tiers-${key}`}>
                            {deptSkills.map((s: SkillDef) => (
                              <li key={s.id} className="skill-tier-item">
                                <div className="skill-tier-row">
                                  <span className={`tier-pill tier-${s.tier}`}>
                                    {s.tier === 'plus' ? 'Plus' : 'Free'}
                                  </span>
                                  <span className="skill-tier-label">{s.label_it}</span>
                                  {s.knowhow.playbook && (
                                    <span className="muted"> · {s.knowhow.playbook}</span>
                                  )}
                                </div>
                                <p className="skill-tier-blurb muted">{s.blurb_it}</p>
                                {s.knowhow.decision_rights_hint && (
                                  <p className="skill-tier-rights muted">
                                    Decision rights: {s.knowhow.decision_rights_hint}
                                  </p>
                                )}
                                {s.knowhow.metrics.length > 0 && (
                                  <p className="skill-tier-metrics muted">
                                    Metriche: {s.knowhow.metrics.slice(0, 3).join(' · ')}
                                    {s.knowhow.metrics.length > 3 ? '…' : ''}
                                  </p>
                                )}
                                {s.knowhow.hitl_prompts.length > 0 && (
                                  <p className="skill-tier-hitl muted">
                                    HITL: «{s.knowhow.hitl_prompts[0]}»
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                  <p className="status-line" style={{ marginTop: '0.35rem' }}>
                    Leadership / decisioni: sempre attivo. Free vs Plus = capacità skill / know-how,
                    non la grafica 3D.
                    {isPlusEntitled(cfg)
                      ? ' Piano corrente: Plus attivo.'
                      : ' Piano corrente: Free.'}
                  </p>
                </div>
              </div>
            )}

            {section === 'office' &&
              (() => {
                const officeMode = (cfg.subscription?.office_mode ?? 'full') as OfficeMode
                return (
                  <div className="field" data-testid="admin-office-view">
                    <label htmlFor="office-mode-select">Presentazione ufficio</label>
                    <select
                      id="office-mode-select"
                      data-testid="office-mode-select"
                      value={officeMode}
                      onChange={(e) =>
                        set('subscription', {
                          plan: normalizePlan(cfg.subscription?.plan),
                          plus_override: Boolean(cfg.subscription?.plus_override),
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
                    <FieldHelp>
                      L’ufficio 3D è incluso per tutti. Qui scegli solo come presentarlo.
                    </FieldHelp>
                  </div>
                )
              })()}

            {section === 'rules' && (
              <div className="form-grid" data-testid="admin-rules">
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
            )}

            {section === 'knowledge' && (
              <div data-testid="admin-knowledge-section">{knowledgePanel}</div>
            )}

            {section === 'users' && <div data-testid="admin-users-section">{usersPanel}</div>}

            {saveBar}
            {saveNote && <p className="status-line">{saveNote}</p>}
            {error && <p className="error">{error}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
