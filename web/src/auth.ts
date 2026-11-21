/** Client-side session for Atrium Agent / Admin roles. */

export type AuthRole = 'agent' | 'admin'

export type AuthUser = {
  email: string
  display_name: string
  role: AuthRole
  tenant_id: string
}

export type LoginResult = {
  token: string
  user: AuthUser
  expires_in: number
}

const TOKEN_KEY = 'atrium.auth.token'
const USER_KEY = 'atrium.auth.user'

/** In-memory fallback when localStorage is unavailable (e.g. vitest node). */
const memoryStore = new Map<string, string>()

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key)
  } catch {
    /* ignore */
  }
  return memoryStore.get(key) ?? null
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value)
      return
    }
  } catch {
    /* ignore */
  }
  memoryStore.set(key, value)
}

function storageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
  memoryStore.delete(key)
}

export function canAccessAdmin(role: AuthRole | undefined | null): boolean {
  return role === 'admin'
}

export function canAccessAgent(role: AuthRole | undefined | null): boolean {
  return role === 'agent' || role === 'admin'
}

export function loadStoredToken(): string | null {
  return storageGet(TOKEN_KEY)
}

export function loadStoredUser(): AuthUser | null {
  try {
    const raw = storageGet(USER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthUser
    if (!parsed?.email || (parsed.role !== 'agent' && parsed.role !== 'admin')) return null
    return parsed
  } catch {
    return null
  }
}

export function persistSession(token: string, user: AuthUser): void {
  storageSet(TOKEN_KEY, token)
  storageSet(USER_KEY, JSON.stringify(user))
}

export function clearSession(): void {
  storageRemove(TOKEN_KEY)
  storageRemove(USER_KEY)
}

export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = loadStoredToken()
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
