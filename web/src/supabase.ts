import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loadStoredToken } from './auth'

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (client) return client
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (!url || !key) {
    throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti')
  }
  client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'atrium.supabase.auth',
    },
  })
  return client
}

export function functionsBaseUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  return `${url}/functions/v1/atrium-api`
}

function parseError(text: string, fallback: string): string {
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { detail?: string }
    if (typeof parsed.detail === 'string') return parsed.detail
  } catch {
    /* plain */
  }
  return text || fallback
}

export async function edgeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const sb = getSupabase()
  const { data: sessionData } = await sb.auth.getSession()
  const token = sessionData.session?.access_token
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const res = await fetch(`${functionsBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseError(text, res.statusText))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Call LangGraph worker (Cloud Run / local uvicorn) with Bearer session. */
export async function workerFetch<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
  tokenOverride?: string | null,
): Promise<T> {
  let token = tokenOverride ?? null
  if (!token) {
    try {
      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
        const sb = getSupabase()
        const { data } = await sb.auth.getSession()
        token = data.session?.access_token ?? null
      }
    } catch {
      /* fixtures / no supabase client */
    }
  }
  if (!token) {
    token = loadStoredToken()
  }
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(parseError(text, res.statusText))
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
