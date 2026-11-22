/** Deploy runtime: Supabase+Netlify happy path, or local fixture mock for CI. */

export type RuntimeMode = 'supabase' | 'fixtures'

export function runtimeMode(): RuntimeMode {
  const forced = (import.meta.env.VITE_ATRIUM_RUNTIME as string | undefined)?.trim()
  if (forced === 'fixtures' || forced === 'supabase') return forced
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()
  if (url && key) return 'supabase'
  return 'fixtures'
}

export function isSupabaseRuntime(): boolean {
  return runtimeMode() === 'supabase'
}
