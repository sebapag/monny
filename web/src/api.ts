const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
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
  apply_result?: Record<string, unknown> | null
}

export type TenantListItem = {
  tenant_id: string
  display_name: string
  secrets?: { secret_ref: string; configured: boolean }[]
  secrets_configured?: number
  secrets_total?: number
  pending_approvals?: number
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
  }
  integrations?: {
    search_console?: { site_url: string; secret_ref: string } | null
  }
}

export type TenantDetail = {
  config: TenantConfig
  secrets: { secret_ref: string; configured: boolean }[]
  path: string
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

export function listApprovals(tenant_id?: string, status = 'pending') {
  const params = new URLSearchParams()
  if (tenant_id) params.set('tenant_id', tenant_id)
  if (status) params.set('status', status)
  const q = params.toString() ? `?${params}` : ''
  return request<Approval[]>(`/api/approvals${q}`)
}

export function decideApproval(
  id: string,
  decision: 'approved' | 'rejected',
  note?: string,
) {
  return request<Approval>(`/api/approvals/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision, note }),
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

export function listTenantArtifacts(tenantId: string) {
  return request<ArtifactList>(`/api/tenants/${tenantId}/artifacts`)
}

export function getTenantArtifact(tenantId: string, name: string) {
  return request<ArtifactPayload>(`/api/tenants/${tenantId}/artifacts/${name}`)
}
