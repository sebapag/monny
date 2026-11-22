import { authHeaders, type AuthUser, type LoginResult } from './auth'

/** Prefer VITE_API_BASE_URL (Netlify/Cloud Run); fall back to legacy VITE_API_BASE. */
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE as string | undefined) ||
  ''

function parseErrorDetail(text: string, fallback: string): string {
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* plain text */
  }
  return text
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: authHeaders({
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseErrorDetail(text, res.statusText))
  }
  return res.json() as Promise<T>
}

export function login(email: string, password: string) {
  return request<LoginResult>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function signup(email: string, password: string, display_name?: string) {
  return request<LoginResult>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name: display_name ?? '' }),
  })
}

export function logout() {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export function fetchMe() {
  return request<AuthUser>('/api/auth/me')
}

export type AuthBackendInfo = {
  ok: boolean
  auth?: { backend: 'supabase' | 'fixtures'; supabase_configured: boolean }
}

export function fetchHealth() {
  return request<AuthBackendInfo>('/api/health')
}

export function listAuthUsers(tenantId?: string) {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
  return request<AuthUser[]>(`/api/auth/users${q}`)
}

export function createAuthUser(body: {
  email: string
  password: string
  display_name?: string
  role?: AuthUser['role']
  tenant_id?: string
}) {
  return request<AuthUser>('/api/auth/users', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateAuthUser(
  userId: string,
  body: { role: AuthUser['role']; display_name?: string; tenant_id?: string },
) {
  return request<AuthUser>(`/api/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
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
  /** Paid: Admin can choose full 3D / light / auto for the office twin. */
  office_view: boolean
}

export type OfficeMode = 'auto' | 'full' | 'light'

export type SubscriptionConfig = {
  plan: 'starter' | 'growth' | 'scale'
  skills: SubscriptionSkills
  features?: SubscriptionFeatures
  office_mode?: OfficeMode
}

export type SubscriptionSummary = {
  plan: string
  skills: SubscriptionSkills
  features?: SubscriptionFeatures
  office_mode?: OfficeMode
  office_mode_preference?: OfficeMode
  office_view?: boolean
  leadership: boolean
  labels_it?: Record<string, string>
  feature_labels_it?: Record<string, string>
  office_mode_labels_it?: Record<string, string>
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
}

export type TenantDetail = {
  config: TenantConfig
  secrets: { secret_ref: string; configured: boolean }[]
  path: string
  subscription?: SubscriptionSummary
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

export function chat(body: {
  tenant_id: string
  message: string
  goal?: string
  thread_id?: string
}) {
  return request<ChatResponse>('/api/chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function startRun(body: {
  tenant_id: string
  message: string
  goal?: string
  thread_id?: string
}) {
  return request<AgentRun>('/api/runs', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function getRun(runId: string) {
  return request<AgentRun>(`/api/runs/${runId}`)
}

export function listApprovals(tenant_id?: string, status = 'pending') {
  const params = new URLSearchParams()
  if (tenant_id) params.set('tenant_id', tenant_id)
  if (status) params.set('status', status)
  const q = params.toString() ? `?${params}` : ''
  return request<Approval[]>(`/api/approvals${q}`)
}

export function decideApproval(
  id: string,
  decision: ApprovalDecision,
  note?: string,
  delegateTo?: string,
) {
  return request<Approval>(`/api/approvals/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify({
      decision,
      note,
      delegate_to: delegateTo ?? null,
    }),
  })
}

export function listTenants() {
  return request<TenantListItem[]>('/api/tenants')
}

export function getTenant(tenantId: string) {
  return request<TenantDetail>(`/api/tenants/${tenantId}`)
}

export function putTenant(tenantId: string, config: TenantConfig) {
  return request<{ ok: boolean; path: string }>(`/api/tenants/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export type AuditEvent = {
  ts: string
  tenant_id: string
  event: string
  payload?: Record<string, unknown>
}

export function listTenantAudit(tenantId: string, limit = 80) {
  return request<AuditEvent[]>(
    `/api/tenants/${tenantId}/audit?limit=${encodeURIComponent(String(limit))}`,
  )
}

export function listTenantArtifacts(tenantId: string) {
  return request<ArtifactList>(`/api/tenants/${tenantId}/artifacts`)
}

export function getTenantArtifact(tenantId: string, name: string) {
  return request<ArtifactPayload>(`/api/tenants/${tenantId}/artifacts/${name}`)
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

export function listKnowledge(tenantId: string) {
  return request<KnowledgeList>(`/api/tenants/${tenantId}/knowledge`)
}

export function retrieveKnowledge(
  tenantId: string,
  body: { query?: string; tags?: string[]; limit?: number },
) {
  return request<KnowledgeRetrieveResult>(`/api/tenants/${tenantId}/knowledge/retrieve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function toggleKnowledgeSource(tenantId: string, sourceId: string, enabled: boolean) {
  return request<{ ok: boolean; source: KnowledgeSource }>(
    `/api/tenants/${tenantId}/knowledge/sources/${sourceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
  )
}
