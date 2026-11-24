
export type AuthBackendInfo = {
  ok: boolean
  auth?: { backend: 'supabase' | 'fixtures'; supabase_configured: boolean }
}

export type SpendCampaign = {
  id?: string
  name?: string
  channel?: string
  spend?: number
  roas?: number
  cpa?: number
  conversions?: number
  daily_budget?: number
  flags?: string[]
  healthy?: boolean
}

export type SpendDiagnosis = {
  channel: string
  totals: {
    campaigns: number
    healthy: number
    waste: number
    spend: number
    waste_spend: number
    waste_spend_pct: number
  }
  thresholds?: { min_roas: number; max_cpa: number }
  campaigns: SpendCampaign[]
}

export type SeoChange = {
  url: string
  before: { title?: string; meta_description?: string; h1?: string }
  after: { title?: string; meta_description?: string; h1?: string }
  issues?: { code: string; severity: string; detail: string }[]
  status?: string
}

export type Report = {
  markdown?: string
  proposal_count?: number
  proposals?: Record<string, unknown>[]
  spend_channels?: SpendDiagnosis[]
  top_campaigns?: SpendCampaign[]
  seo_change_set?: { status?: string; changes?: SeoChange[] } | null
  seo_findings?: Record<string, unknown>[]
  shopify?: Record<string, unknown> | null
}

export type ChatResponse = {
  thread_id: string
  reply: string
  status: string
  approval_ids: string[]
  report?: Report | null
  findings?: Record<string, unknown>[]
  run_id?: string | null
}

export type TimelineStep = {
  id: string
  skill: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error' | 'waiting' | string
  detail: string
  started_at?: string | null
  finished_at?: string | null
}

export type AgentRun = {
  id: string
  tenant_id: string
  thread_id: string
  goal: string
  status: string
  active_skill?: string | null
  status_line: string
  steps: TimelineStep[]
  reply?: string | null
  report?: Report | null
  approval_ids: string[]
  error?: string | null
  created_at: string
  updated_at: string
}

/** Three-path escalation + legacy reject. */
export type ApprovalDecision =
  | 'approved'
  | 'rejected'
  | 'delegated'
  | 'escalated'

/** Autonomy: what a skill/dept may do without Leadership approval. */
export type DecisionAutonomy =
  | 'always_ask'
  | 'within_policy'
  | 'agent_resolves'

export type DecisionRights = {
  spend: DecisionAutonomy
  seo: DecisionAutonomy
  shopify: DecisionAutonomy
  leads: DecisionAutonomy
  operations: DecisionAutonomy
  design: DecisionAutonomy
  it: DecisionAutonomy
  controlling: DecisionAutonomy
}

export type Approval = {
  id: string
  tenant_id: string
  thread_id: string
  action_type: string
  summary: string
  payload: Record<string, unknown>
  status: string
  created_at: string
  decided_at?: string | null
  note?: string | null
  delegate_to?: string | null
  apply_result?: Record<string, unknown> | null
}

export type SubscriptionSkills = {
  spend: boolean
  seo: boolean
  shopify: boolean
  leads: boolean
  operations: boolean
  design: boolean
  it: boolean
  controlling: boolean
}

export type SubscriptionFeatures = {
  /**
   * Market rule: full 3D office is for everyone (free + paid).
   * Kept for backwards-compatible tenant JSON; always treated as true in UI.
   */
  office_view: boolean
}

export type OfficeMode = 'auto' | 'full' | 'light'

/** Product plans: free (signup) | plus (paid). Legacy starter→free, growth/scale→plus. */
export type ProductPlan = 'free' | 'plus'

export type SkillTier = 'free' | 'plus'

export type SkillCatalogEntry = {
  id: string
  department: string
  tier: SkillTier
  label_it: string
  blurb_it: string
  entitlement: string
  knowhow: {
    playbook: string | null
    knowledge_tags: string[]
    knowledge_paths: string[]
    decision_rights_key: string | null
    metrics?: string[]
    hitl_prompts?: string[]
    decision_rights_hint?: string | null
  }
  extension_hook: boolean
}

export type SubscriptionConfig = {
  plan: ProductPlan | 'starter' | 'growth' | 'scale'
  skills: SubscriptionSkills
  features?: SubscriptionFeatures
  office_mode?: OfficeMode
  /** Admin unlocks plus-tier skills without changing plan label (Stripe stub). */
  plus_override?: boolean
}

/** Always-visible monthly spend (Admin). Ads billed by Google/Meta; Atrium separate. */
export type BillingConfig = {
  currency: 'EUR'
  renews_on_day: number
  atrium_price_eur: number
  ads_monthly_budget_eur: number
  ads_spent_this_month_eur: number
}

export type SubscriptionSummary = {
  plan: string
  plus_entitled?: boolean
  plus_override?: boolean
  skills: SubscriptionSkills
  features?: SubscriptionFeatures
  office_mode?: OfficeMode
  office_mode_preference?: OfficeMode
  office_view?: boolean
  leadership: boolean
  labels_it?: Record<string, string>
  feature_labels_it?: Record<string, string>
  office_mode_labels_it?: Record<string, string>
  plan_labels_it?: Record<string, string>
  skill_catalog?: SkillCatalogEntry[]
  allowed_skill_ids?: string[]
}

export type TenantListItem = {
  tenant_id: string
  display_name: string
  secrets?: { secret_ref: string; configured: boolean }[]
  secrets_configured?: number
  secrets_total?: number
  pending_approvals?: number
  subscription?: SubscriptionSummary
}

export type TenantConfig = {
  tenant_id: string
  display_name: string
  shopify: {
    shop_domain: string
    api_version: string
    auth: { secret_ref: string }
    scopes_expected: string[]
    /** True after OAuth install (token in secrets store). */
    connected?: boolean
    oauth?: {
      scopes_granted?: string[]
      shop_name?: string | null
      installed_at?: string | null
      mode?: 'live' | 'mock' | null
    } | null
  }
  ads: {
    google?: { customer_id: string; login_customer_id?: string | null; secret_ref: string } | null
    meta?: { ad_account_id: string; secret_ref: string } | null
  }
  site: {
    base_url: string
    sitemap_url?: string | null
    cms_adapter: string
    locales: string[]
    priority_urls?: string[]
  }
  policy: {
    hitl_default: boolean
    spend: {
      max_budget_delta_pct: number
      auto_apply: { enabled: boolean; allow: string[] }
      thresholds: { min_roas: number; max_cpa: number; lookback_days: number }
    }
    seo: { auto_apply: boolean; max_urls_per_run: number }
    decision_rights?: DecisionRights
  }
  integrations?: {
    search_console?: { site_url: string; secret_ref: string } | null
  }
  subscription?: SubscriptionConfig
  billing?: BillingConfig
}

export type ShopifyConnectorStatus = {
  provider: 'shopify'
  connected: boolean
  shop_domain: string
  shop_name?: string | null
  scopes_granted?: string[]
  scopes_expected?: string[]
  installed_at?: string | null
  token_configured: boolean
  oauth_mode?: 'live' | 'mock' | null
  partner_app_configured?: boolean
  required_scopes?: string[]
}

export type ShopifyOAuthStartResult = {
  authorize_url: string
  state: string
  shop_domain: string
  scopes: string[]
  redirect_uri?: string
  mode: 'live' | 'mock'
  message_it?: string
  /** Fixtures-only: OAuth completed in-browser without redirect. */
  completed?: boolean
}

export type TenantDetail = {
  config: TenantConfig
  secrets: { secret_ref: string; configured: boolean; source?: string }[]
  path: string
  subscription?: SubscriptionSummary
  shopify_connector?: ShopifyConnectorStatus
}

export type ArtifactList = {
  tenant_id: string
  artifacts: { name: string; path: string; size: number; mtime: number }[]
}

export type ArtifactPayload = {
  tenant_id: string
  name: string
  payload: Record<string, unknown>
}

export type AuditEvent = {
  ts: string
  tenant_id: string
  event: string
  payload?: Record<string, unknown>
}

export type KnowledgeSource = {
  id: string
  title: string
  type: string
  path: string
  tags: string[]
  enabled: boolean
}

export type KnowledgeList = {
  tenant_id: string
  sources: KnowledgeSource[]
  index: Record<string, unknown>
  path: string
}

export type KnowledgeChunk = {
  source_id: string
  title: string
  excerpt: string
  tags: string[]
  score: number
}

export type KnowledgeRetrieveResult = {
  tenant_id: string
  query: string
  tags: string[]
  chunks: KnowledgeChunk[]
}

