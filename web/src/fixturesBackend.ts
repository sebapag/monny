/**
 * In-browser fixture backend for CI / local without Supabase.
 * Mirrors Edge Function shapes so the SPA happy path works offline.
 */
import type {
  AgentRun,
  Approval,
  ApprovalDecision,
  ChatResponse,
  KnowledgeList,
  KnowledgeRetrieveResult,
  KnowledgeSource,
  Report,
  ShopifyConnectorStatus,
  ShopifyOAuthStartResult,
  TenantConfig,
  TenantDetail,
  TenantListItem,
} from './apiTypes'
import type { AuthRole, AuthUser, LoginResult } from './auth'

type Store = {
  users: Array<AuthUser & { password: string }>
  session: { token: string; user: AuthUser } | null
  tenants: Record<string, TenantConfig>
  approvals: Approval[]
  runs: AgentRun[]
  knowledge: Record<string, KnowledgeSource & { body: string }>
  audit: Array<{ ts: string; tenant_id: string; event: string; payload?: Record<string, unknown> }>
  artifacts: Record<string, Record<string, unknown>>
  /** Portable secret store mirror (OAuth tokens). */
  secrets: Record<string, Record<string, string>>
}

const SHOPIFY_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_content',
  'read_price_rules',
  'write_price_rules',
]

function normalizeShopDomain(raw: string): string {
  let shop = raw.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? ''
  if (!shop.includes('.')) shop = `${shop}.myshopify.com`
  return shop
}

function shopifyConnectorStatus(cfg: TenantConfig, secrets: Record<string, string>): ShopifyConnectorStatus {
  const token = secrets[cfg.shopify.auth.secret_ref]
  const connected = Boolean(cfg.shopify.connected && cfg.shopify.shop_domain && token)
  return {
    provider: 'shopify',
    connected,
    shop_domain: cfg.shopify.shop_domain,
    shop_name: cfg.shopify.oauth?.shop_name ?? null,
    scopes_granted: cfg.shopify.oauth?.scopes_granted ?? [],
    scopes_expected: cfg.shopify.scopes_expected,
    installed_at: cfg.shopify.oauth?.installed_at ?? null,
    token_configured: Boolean(token),
    oauth_mode: cfg.shopify.oauth?.mode ?? null,
    partner_app_configured: false,
    required_scopes: SHOPIFY_SCOPES,
  }
}

const DEMO_CONFIG: TenantConfig = {
  tenant_id: 'demo',
  display_name: 'Demo Shop',
  shopify: {
    shop_domain: 'demo-shop.myshopify.com',
    api_version: '2025-10',
    auth: { secret_ref: 'SHOPIFY_TOKEN_DEMO' },
    scopes_expected: ['read_products', 'write_content', 'read_orders'],
    connected: false,
  },
  ads: {
    google: { customer_id: '000-000-0000', login_customer_id: null, secret_ref: 'GOOGLE_ADS_DEMO' },
    meta: { ad_account_id: 'act_demo', secret_ref: 'META_ADS_DEMO' },
  },
  site: {
    base_url: 'https://www.demo-shop.example',
    sitemap_url: 'https://www.demo-shop.example/sitemap.xml',
    cms_adapter: 'shopify_online_store',
    locales: ['it', 'en'],
    priority_urls: [
      'https://www.demo-shop.example/',
      'https://www.demo-shop.example/collections/all',
    ],
  },
  policy: {
    hitl_default: true,
    spend: {
      max_budget_delta_pct: 15,
      auto_apply: { enabled: false, allow: [] },
      thresholds: { min_roas: 2, max_cpa: 40, lookback_days: 14 },
    },
    seo: { auto_apply: false, max_urls_per_run: 50 },
    decision_rights: {
      spend: 'always_ask',
      seo: 'always_ask',
      shopify: 'always_ask',
      leads: 'always_ask',
      operations: 'always_ask',
      design: 'always_ask',
      it: 'always_ask',
      controlling: 'always_ask',
    },
  },
  subscription: {
    plan: 'plus',
    plus_override: false,
    skills: {
      spend: true,
      seo: true,
      shopify: false,
      leads: false,
      operations: true,
      design: true,
      it: true,
      controlling: false,
    },
    features: { office_view: true },
    office_mode: 'full',
  },
  billing: {
    currency: 'EUR',
    renews_on_day: 1,
    atrium_price_eur: 79,
    ads_monthly_budget_eur: 2500,
    ads_spent_this_month_eur: 2015.5,
  },
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function now(): string {
  return new Date().toISOString()
}

let store: Store | null = null

function getStore(): Store {
  if (store) return store
  store = {
    secrets: {},
    users: [
      {
        email: 'agent@demo',
        display_name: 'Agent Demo',
        role: 'agent',
        tenant_id: 'demo',
        user_id: 'fixture-agent',
        password: 'agent-demo',
      },
      {
        email: 'admin@demo',
        display_name: 'Admin Demo',
        role: 'admin',
        tenant_id: 'demo',
        user_id: 'fixture-admin',
        password: 'admin-demo',
      },
    ],
    session: null,
    tenants: { demo: structuredClone(DEMO_CONFIG) },
    approvals: [],
    runs: [],
    knowledge: {
      'brand-voice': {
        id: 'brand-voice',
        title: 'Tono di voce',
        type: 'markdown',
        path: 'brand-voice',
        tags: ['brand', 'copy'],
        enabled: true,
        body: 'Chiaro, concreto, italiano.',
      },
      'product-faq': {
        id: 'product-faq',
        title: 'FAQ prodotti',
        type: 'markdown',
        path: 'product-faq',
        tags: ['commerce'],
        enabled: true,
        body: 'Spedizione 2-4 giorni.',
      },
      'spend-guidelines': {
        id: 'spend-guidelines',
        title: 'Linee guida spend',
        type: 'markdown',
        path: 'spend-guidelines',
        tags: ['spend'],
        enabled: true,
        body: 'ROAS minimo 2.0.',
      },
    },
    audit: [],
    artifacts: {},
  }
  return store
}

function requireSession(): AuthUser {
  const s = getStore().session
  if (!s) throw new Error('Autenticazione richiesta')
  return s.user
}

function requireAdmin(): AuthUser {
  const u = requireSession()
  if (u.role !== 'admin') throw new Error("Solo Admin: l'account Agent non può aprire questa area")
  return u
}

export const fixturesApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const user = getStore().users.find(
      (u) => u.email === email.trim().toLowerCase() && u.password === password,
    )
    if (!user) throw new Error('Email o password non validi')
    const publicUser: AuthUser = {
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      tenant_id: user.tenant_id,
      user_id: user.user_id,
    }
    const token = `fixture.${btoa(user.email)}`
    getStore().session = { token, user: publicUser }
    return { token, user: publicUser, expires_in: 43200, backend: 'fixtures' }
  },

  async signup(email: string, password: string, display_name?: string): Promise<LoginResult> {
    const e = email.trim().toLowerCase()
    if (getStore().users.some((u) => u.email === e)) throw new Error('Email già registrata')
    if (password.length < 8) throw new Error('Password troppo corta')
    const user: AuthUser & { password: string } = {
      email: e,
      display_name: display_name || e.split('@')[0],
      role: 'agent',
      tenant_id: 'demo',
      user_id: uid('user'),
      password,
    }
    getStore().users.push(user)
    return this.login(e, password)
  },

  async logout(): Promise<{ ok: boolean }> {
    getStore().session = null
    return { ok: true }
  },

  async fetchMe(): Promise<AuthUser> {
    return requireSession()
  },

  async fetchHealth() {
    return {
      ok: true,
      auth: { backend: 'fixtures' as const, supabase_configured: false },
      stack: 'fixtures',
    }
  },

  async listAuthUsers(tenantId?: string): Promise<AuthUser[]> {
    requireAdmin()
    return getStore()
      .users.filter((u) => !tenantId || u.tenant_id === tenantId)
      .map(({ password: _p, ...u }) => u)
  },

  async createAuthUser(body: {
    email: string
    password: string
    display_name?: string
    role?: AuthRole
    tenant_id?: string
  }): Promise<AuthUser> {
    requireAdmin()
    const e = body.email.trim().toLowerCase()
    const user: AuthUser & { password: string } = {
      email: e,
      display_name: body.display_name || e.split('@')[0],
      role: body.role === 'admin' ? 'admin' : 'agent',
      tenant_id: body.tenant_id || 'demo',
      user_id: uid('user'),
      password: body.password,
    }
    getStore().users.push(user)
    const { password: _p, ...pub } = user
    return pub
  },

  async updateAuthUser(
    userId: string,
    body: { role: AuthRole; display_name?: string; tenant_id?: string },
  ): Promise<AuthUser> {
    requireAdmin()
    const user = getStore().users.find((u) => u.user_id === userId)
    if (!user) throw new Error('Utente non trovato')
    user.role = body.role
    if (body.display_name != null) user.display_name = body.display_name
    if (body.tenant_id != null) user.tenant_id = body.tenant_id
    const { password: _p, ...pub } = user
    return pub
  },

  async listTenants(): Promise<TenantListItem[]> {
    requireSession()
    const pending = getStore().approvals.filter((a) => a.status === 'pending').length
    return Object.values(getStore().tenants).map((t) => ({
      tenant_id: t.tenant_id,
      display_name: t.display_name,
      secrets_configured: t.shopify.connected && t.shopify.shop_domain ? 1 : 0,
      pending_approvals: pending,
      subscription: {
        plan: t.subscription?.plan ?? 'plus',
        skills: t.subscription?.skills ?? DEMO_CONFIG.subscription!.skills,
        features: { office_view: true },
        office_mode: t.subscription?.office_mode ?? 'full',
        office_view: true,
        leadership: true,
      },
    }))
  },

  async getTenant(tenantId: string): Promise<TenantDetail> {
    requireSession()
    const cfg = getStore().tenants[tenantId]
    if (!cfg) throw new Error('Tenant non trovato')
    const tenantSecrets = getStore().secrets[tenantId] ?? {}
    const tokenOk = Boolean(tenantSecrets[cfg.shopify.auth.secret_ref])
    return {
      config: cfg,
      secrets: [
        {
          secret_ref: cfg.shopify.auth.secret_ref,
          configured: tokenOk,
          source: tokenOk ? 'store' : 'missing',
        },
        { secret_ref: cfg.ads.google?.secret_ref ?? '', configured: false },
        { secret_ref: cfg.ads.meta?.secret_ref ?? '', configured: false },
      ].filter((s) => s.secret_ref),
      path: `fixtures:tenants/${tenantId}`,
      subscription: {
        plan: cfg.subscription?.plan ?? 'plus',
        skills: cfg.subscription!.skills,
        features: { office_view: true },
        office_mode: cfg.subscription?.office_mode ?? 'full',
        office_view: true,
        leadership: true,
      },
      shopify_connector: shopifyConnectorStatus(cfg, tenantSecrets),
    }
  },

  async putTenant(tenantId: string, config: TenantConfig) {
    requireAdmin()
    if (!config.subscription) config.subscription = DEMO_CONFIG.subscription!
    if (!config.subscription.features) config.subscription.features = { office_view: true }
    config.subscription.features.office_view = true
    getStore().tenants[tenantId] = config
    getStore().audit.unshift({
      ts: now(),
      tenant_id: tenantId,
      event: 'tenant_updated',
    })
    return { ok: true, path: `fixtures:tenants/${tenantId}` }
  },

  async getShopifyConnector(tenantId: string): Promise<ShopifyConnectorStatus> {
    requireAdmin()
    const cfg = getStore().tenants[tenantId]
    if (!cfg) throw new Error('Tenant non trovato')
    return shopifyConnectorStatus(cfg, getStore().secrets[tenantId] ?? {})
  },

  async startShopifyOAuth(tenantId: string, shopDomain: string): Promise<ShopifyOAuthStartResult> {
    requireAdmin()
    const cfg = getStore().tenants[tenantId]
    if (!cfg) throw new Error('Tenant non trovato')
    const shop = normalizeShopDomain(shopDomain)
    const token = `shpat_atrium_mock_${shop.split('.')[0]}`
    if (!getStore().secrets[tenantId]) getStore().secrets[tenantId] = {}
    getStore().secrets[tenantId][cfg.shopify.auth.secret_ref] = token
    const skills = { ...(cfg.subscription?.skills ?? DEMO_CONFIG.subscription!.skills), shopify: true }
    cfg.shopify = {
      ...cfg.shopify,
      shop_domain: shop,
      connected: true,
      scopes_expected: [...SHOPIFY_SCOPES],
      oauth: {
        scopes_granted: [...SHOPIFY_SCOPES],
        shop_name: shop.split('.')[0]?.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? shop,
        installed_at: now(),
        mode: 'mock',
      },
    }
    cfg.subscription = {
      ...(cfg.subscription ?? DEMO_CONFIG.subscription!),
      skills,
      features: { office_view: true, ...(cfg.subscription?.features ?? {}) },
    }
    getStore().audit.unshift({
      ts: now(),
      tenant_id: tenantId,
      event: 'shopify_oauth_connected',
      payload: { shop_domain: shop, mode: 'mock' },
    })
    return {
      authorize_url: '',
      state: 'fixture-instant',
      shop_domain: shop,
      scopes: [...SHOPIFY_SCOPES],
      mode: 'mock',
      completed: true,
      message_it:
        'Installazione OAuth demo completata (fixture). Con SHOPIFY_API_KEY/SECRET il flusso apre Shopify reale.',
    }
  },

  async disconnectShopify(tenantId: string) {
    requireAdmin()
    const cfg = getStore().tenants[tenantId]
    if (!cfg) throw new Error('Tenant non trovato')
    const bag = getStore().secrets[tenantId]
    if (bag) delete bag[cfg.shopify.auth.secret_ref]
    cfg.shopify = { ...cfg.shopify, connected: false, oauth: null }
    getStore().audit.unshift({
      ts: now(),
      tenant_id: tenantId,
      event: 'shopify_oauth_disconnect',
    })
    return {
      ok: true,
      connected: false,
      message_it: 'Shopify disconnesso. Il token OAuth è stato rimosso.',
    }
  },

  async listApprovals(tenant_id?: string, status = 'pending'): Promise<Approval[]> {
    requireSession()
    return getStore().approvals.filter(
      (a) => (!tenant_id || a.tenant_id === tenant_id) && (!status || a.status === status),
    )
  },

  async decideApproval(
    id: string,
    decision: ApprovalDecision,
    note?: string,
    delegateTo?: string,
  ): Promise<Approval> {
    requireSession()
    const a = getStore().approvals.find((x) => x.id === id)
    if (!a) throw new Error('Approval non trovata')
    a.status = decision
    a.note = note ?? null
    a.delegate_to = decision === 'delegated' ? delegateTo ?? null : null
    a.decided_at = now()
    a.apply_result = { ok: true, mode: 'fixture-stub', decision }
    return a
  },

  async startRun(body: {
    tenant_id: string
    message: string
    goal?: string
    thread_id?: string
  }): Promise<AgentRun> {
    requireSession()
    const goal = (body.goal || body.message || 'Report').trim()
    const id = uid('run')
    const thread = body.thread_id || uid('thread')
    const approvalId = uid('appr')
    const report: Report = {
      markdown: `## Report fixture\n\n**Obiettivo:** ${goal}\n\nStub locale (senza Supabase).`,
      proposal_count: 1,
      spend_channels: [
        {
          channel: 'google',
          totals: {
            campaigns: 2,
            healthy: 1,
            waste: 1,
            spend: 200,
            waste_spend: 40,
            waste_spend_pct: 20,
          },
          campaigns: [],
        },
      ],
    }
    const approval: Approval = {
      id: approvalId,
      tenant_id: body.tenant_id,
      thread_id: thread,
      action_type: 'spend_adjust',
      summary: `Proposta demo: ${goal.slice(0, 80)}`,
      payload: { goal, source: 'fixture' },
      status: 'pending',
      created_at: now(),
    }
    getStore().approvals.unshift(approval)
    const run: AgentRun = {
      id,
      tenant_id: body.tenant_id,
      thread_id: thread,
      goal,
      status: 'awaiting_approval',
      active_skill: null,
      status_line: 'In attesa di decisione',
      steps: [
        {
          id: 's1',
          skill: 'spend_google',
          label: 'Spend Google',
          status: 'done',
          detail: 'Completato (fixture)',
          started_at: now(),
          finished_at: now(),
        },
        {
          id: 's2',
          skill: 'hitl',
          label: 'Decisione umana',
          status: 'waiting',
          detail: 'In attesa',
          started_at: now(),
          finished_at: null,
        },
      ],
      reply: 'Ho bisogno di una tua decisione su una proposta (demo locale).',
      report,
      approval_ids: [approvalId],
      created_at: now(),
      updated_at: now(),
    }
    getStore().runs.unshift(run)
    getStore().artifacts[`${body.tenant_id}:latest_report.json`] = report as unknown as Record<
      string,
      unknown
    >
    return run
  },

  async getRun(runId: string): Promise<AgentRun> {
    requireSession()
    const run = getStore().runs.find((r) => r.id === runId)
    if (!run) throw new Error('Run non trovato')
    return run
  },

  async chat(body: {
    tenant_id: string
    message: string
    goal?: string
    thread_id?: string
  }): Promise<ChatResponse> {
    const run = await this.startRun(body)
    return {
      thread_id: run.thread_id,
      reply: run.reply ?? '',
      status: run.status,
      approval_ids: run.approval_ids,
      report: run.report,
      findings: [],
      run_id: run.id,
    }
  },

  async listTenantAudit(tenantId: string) {
    requireSession()
    return getStore().audit.filter((a) => a.tenant_id === tenantId)
  },

  async listTenantArtifacts(tenantId: string) {
    requireSession()
    const arts = Object.keys(getStore().artifacts)
      .filter((k) => k.startsWith(`${tenantId}:`))
      .map((k) => {
        const name = k.slice(tenantId.length + 1)
        const payload = getStore().artifacts[k]
        return {
          name,
          path: `fixtures:${name}`,
          size: JSON.stringify(payload).length,
          mtime: Date.now() / 1000,
        }
      })
    return { tenant_id: tenantId, artifacts: arts }
  },

  async getTenantArtifact(tenantId: string, name: string) {
    requireSession()
    const payload = getStore().artifacts[`${tenantId}:${name}`]
    if (!payload) throw new Error('Artifact non trovato')
    return { tenant_id: tenantId, name, payload }
  },

  async listKnowledge(tenantId: string): Promise<KnowledgeList> {
    requireAdmin()
    void tenantId
    const sources = Object.values(getStore().knowledge).map(({ body: _b, ...s }) => s)
    return {
      tenant_id: tenantId,
      sources,
      index: { backend: 'fixture_stub' },
      path: `fixtures:knowledge/${tenantId}`,
    }
  },

  async retrieveKnowledge(
    tenantId: string,
    body: { query?: string; tags?: string[]; limit?: number },
  ): Promise<KnowledgeRetrieveResult> {
    requireSession()
    const q = (body.query ?? '').toLowerCase()
    const chunks = Object.values(getStore().knowledge)
      .filter((s) => s.enabled)
      .map((s) => ({
        source_id: s.id,
        title: s.title,
        excerpt: s.body.slice(0, 200),
        tags: s.tags,
        score: q ? (s.body.toLowerCase().includes(q) ? 2 : 1) : 1,
      }))
      .slice(0, body.limit ?? 5)
    return { tenant_id: tenantId, query: body.query ?? '', tags: body.tags ?? [], chunks }
  },

  async toggleKnowledgeSource(tenantId: string, sourceId: string, enabled: boolean) {
    requireAdmin()
    void tenantId
    const src = getStore().knowledge[sourceId]
    if (!src) throw new Error('Fonte non trovata')
    src.enabled = enabled
    const { body: _b, ...source } = src
    return { ok: true, source }
  },
}
