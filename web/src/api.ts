/** Atrium API client — Supabase Edge Functions, or in-browser fixtures for CI. */

import { fixturesApi } from './fixturesBackend'
import { isSupabaseRuntime } from './runtime'
import { edgeFetch, getSupabase } from './supabase'
import type { AuthRole, AuthUser, LoginResult } from './auth'

export type * from './apiTypes'
export type { AuthBackendInfo } from './apiTypes'

import type {
  AgentRun,
  Approval,
  ApprovalDecision,
  ArtifactList,
  ArtifactPayload,
  AuditEvent,
  AuthBackendInfo,
  ChatResponse,
  KnowledgeList,
  KnowledgeRetrieveResult,
  KnowledgeSource,
  TenantConfig,
  TenantDetail,
  TenantListItem,
} from './apiTypes'

async function profileFromSession(): Promise<AuthUser> {
  const sb = getSupabase()
  const { data: userData, error } = await sb.auth.getUser()
  if (error || !userData.user) throw new Error('Autenticazione richiesta')
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id,email,display_name,role,tenant_id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (pErr || !profile) throw new Error('Profilo non trovato')
  return {
    email: profile.email,
    display_name: profile.display_name,
    role: profile.role as AuthRole,
    tenant_id: profile.tenant_id,
    user_id: profile.id,
  }
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!isSupabaseRuntime()) return fixturesApi.login(email, password)
  const sb = getSupabase()
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error || !data.session) throw new Error(error?.message ?? 'Email o password non validi')
  const user = await profileFromSession()
  return {
    token: data.session.access_token,
    user,
    expires_in: data.session.expires_in ?? 3600,
    backend: 'supabase',
    refresh_token: data.session.refresh_token,
  }
}

export async function signup(
  email: string,
  password: string,
  display_name?: string,
): Promise<LoginResult> {
  if (!isSupabaseRuntime()) return fixturesApi.signup(email, password, display_name)
  const sb = getSupabase()
  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: display_name || email.split('@')[0],
        role: 'agent',
        tenant_id: 'demo',
      },
    },
  })
  if (error) throw new Error(error.message)
  if (!data.session) {
    return {
      token: '',
      user: {
        email: email.trim().toLowerCase(),
        display_name: display_name || email.split('@')[0],
        role: 'agent',
        tenant_id: 'demo',
        user_id: data.user?.id,
      },
      expires_in: 0,
      backend: 'supabase',
    }
  }
  const user = await profileFromSession()
  return {
    token: data.session.access_token,
    user,
    expires_in: data.session.expires_in ?? 3600,
    backend: 'supabase',
    refresh_token: data.session.refresh_token,
  }
}

export async function logout() {
  if (!isSupabaseRuntime()) return fixturesApi.logout()
  const sb = getSupabase()
  await sb.auth.signOut()
  return { ok: true }
}

export async function fetchMe(): Promise<AuthUser> {
  if (!isSupabaseRuntime()) return fixturesApi.fetchMe()
  return profileFromSession()
}

export async function fetchHealth(): Promise<AuthBackendInfo & { stack?: string }> {
  if (!isSupabaseRuntime()) return fixturesApi.fetchHealth()
  try {
    return await edgeFetch('/api/health')
  } catch {
    return { ok: true, auth: { backend: 'supabase', supabase_configured: true }, stack: 'netlify-supabase' }
  }
}

export function listAuthUsers(tenantId?: string) {
  if (!isSupabaseRuntime()) return fixturesApi.listAuthUsers(tenantId)
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : ''
  return edgeFetch<AuthUser[]>(`/api/auth/users${q}`)
}

export function createAuthUser(body: {
  email: string
  password: string
  display_name?: string
  role?: AuthUser['role']
  tenant_id?: string
}) {
  if (!isSupabaseRuntime()) return fixturesApi.createAuthUser(body)
  return edgeFetch<AuthUser>('/api/auth/users', { method: 'POST', body: JSON.stringify(body) })
}

export function updateAuthUser(
  userId: string,
  body: { role: AuthUser['role']; display_name?: string; tenant_id?: string },
) {
  if (!isSupabaseRuntime()) return fixturesApi.updateAuthUser(userId, body)
  return edgeFetch<AuthUser>(`/api/auth/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function chat(body: {
  tenant_id: string
  message: string
  goal?: string
  thread_id?: string
}) {
  if (!isSupabaseRuntime()) return fixturesApi.chat(body)
  return edgeFetch<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify(body) })
}

export function startRun(body: {
  tenant_id: string
  message: string
  goal?: string
  thread_id?: string
}) {
  if (!isSupabaseRuntime()) return fixturesApi.startRun(body)
  return edgeFetch<AgentRun>('/api/runs', { method: 'POST', body: JSON.stringify(body) })
}

export function getRun(runId: string) {
  if (!isSupabaseRuntime()) return fixturesApi.getRun(runId)
  return edgeFetch<AgentRun>(`/api/runs/${runId}`)
}

export function listApprovals(tenant_id?: string, status = 'pending') {
  if (!isSupabaseRuntime()) return fixturesApi.listApprovals(tenant_id, status)
  const params = new URLSearchParams()
  if (tenant_id) params.set('tenant_id', tenant_id)
  if (status) params.set('status', status)
  const q = params.toString() ? `?${params}` : ''
  return edgeFetch<Approval[]>(`/api/approvals${q}`)
}

export function decideApproval(
  id: string,
  decision: ApprovalDecision,
  note?: string,
  delegateTo?: string,
) {
  if (!isSupabaseRuntime()) return fixturesApi.decideApproval(id, decision, note, delegateTo)
  return edgeFetch<Approval>(`/api/approvals/${id}/decide`, {
    method: 'POST',
    body: JSON.stringify({
      decision,
      note,
      delegate_to: delegateTo ?? null,
    }),
  })
}

export function listTenants() {
  if (!isSupabaseRuntime()) return fixturesApi.listTenants()
  return edgeFetch<TenantListItem[]>('/api/tenants')
}

export function getTenant(tenantId: string) {
  if (!isSupabaseRuntime()) return fixturesApi.getTenant(tenantId)
  return edgeFetch<TenantDetail>(`/api/tenants/${tenantId}`)
}

export function putTenant(tenantId: string, config: TenantConfig) {
  if (!isSupabaseRuntime()) return fixturesApi.putTenant(tenantId, config)
  return edgeFetch<{ ok: boolean; path: string }>(`/api/tenants/${tenantId}`, {
    method: 'PUT',
    body: JSON.stringify({ config }),
  })
}

export function listTenantAudit(tenantId: string, limit = 80) {
  if (!isSupabaseRuntime()) return fixturesApi.listTenantAudit(tenantId)
  return edgeFetch<AuditEvent[]>(
    `/api/tenants/${tenantId}/audit?limit=${encodeURIComponent(String(limit))}`,
  )
}

export function listTenantArtifacts(tenantId: string) {
  if (!isSupabaseRuntime()) return fixturesApi.listTenantArtifacts(tenantId)
  return edgeFetch<ArtifactList>(`/api/tenants/${tenantId}/artifacts`)
}

export function getTenantArtifact(tenantId: string, name: string) {
  if (!isSupabaseRuntime()) return fixturesApi.getTenantArtifact(tenantId, name)
  return edgeFetch<ArtifactPayload>(`/api/tenants/${tenantId}/artifacts/${name}`)
}

export function listKnowledge(tenantId: string) {
  if (!isSupabaseRuntime()) return fixturesApi.listKnowledge(tenantId)
  return edgeFetch<KnowledgeList>(`/api/tenants/${tenantId}/knowledge`)
}

export function retrieveKnowledge(
  tenantId: string,
  body: { query?: string; tags?: string[]; limit?: number },
) {
  if (!isSupabaseRuntime()) return fixturesApi.retrieveKnowledge(tenantId, body)
  return edgeFetch<KnowledgeRetrieveResult>(`/api/tenants/${tenantId}/knowledge/retrieve`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function toggleKnowledgeSource(tenantId: string, sourceId: string, enabled: boolean) {
  if (!isSupabaseRuntime()) return fixturesApi.toggleKnowledgeSource(tenantId, sourceId, enabled)
  return edgeFetch<{ ok: boolean; source: KnowledgeSource }>(
    `/api/tenants/${tenantId}/knowledge/sources/${sourceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    },
  )
}
