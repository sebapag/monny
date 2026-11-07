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

export type ChatResponse = {
  thread_id: string
  reply: string
  status: string
  approval_ids: string[]
  report?: Record<string, unknown> | null
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
}

export type TenantListItem = { tenant_id: string; display_name: string }

export type TenantDetail = {
  config: Record<string, unknown>
  secrets: { secret_ref: string; configured: boolean }[]
  path: string
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

export function listApprovals(tenant_id?: string) {
  const q = tenant_id ? `?tenant_id=${encodeURIComponent(tenant_id)}` : ''
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

export function putTenant(tenantId: string, config: Record<string, unknown>) {
  return request<{ ok: boolean; path: string }>(`/api/tenants/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}
