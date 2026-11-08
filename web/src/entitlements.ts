import type {
  OfficeMode,
  SubscriptionFeatures,
  SubscriptionSkills,
  TenantConfig,
} from './api'
import type { DeptId } from './depts'

export const DEFAULT_SKILLS: SubscriptionSkills = {
  spend: true,
  seo: true,
  shopify: false,
  leads: false,
}

export const DEFAULT_FEATURES: SubscriptionFeatures = {
  office_view: false,
}

export function skillsFromConfig(cfg?: TenantConfig | null): SubscriptionSkills {
  return {
    ...DEFAULT_SKILLS,
    ...(cfg?.subscription?.skills ?? {}),
  }
}

export function featuresFromConfig(cfg?: TenantConfig | null): SubscriptionFeatures {
  return {
    ...DEFAULT_FEATURES,
    ...(cfg?.subscription?.features ?? {}),
  }
}

/** Without office_view entitlement, preference is ignored → auto. */
export function effectiveOfficeMode(cfg?: TenantConfig | null): OfficeMode {
  const features = featuresFromConfig(cfg)
  if (!features.office_view) return 'auto'
  const mode = cfg?.subscription?.office_mode
  if (mode === 'full' || mode === 'light' || mode === 'auto') return mode
  return 'auto'
}

export function officeModePreference(cfg?: TenantConfig | null): OfficeMode {
  const mode = cfg?.subscription?.office_mode
  if (mode === 'full' || mode === 'light' || mode === 'auto') return mode
  return 'auto'
}

/** Map office / dept id → subscription skill key. Leadership always entitled. */
export function deptEntitlementKey(dept: DeptId): keyof SubscriptionSkills | null {
  if (dept === 'direzione') return null
  if (dept === 'lead') return 'leads'
  return dept
}

export function isDeptEnabled(dept: DeptId, skills: SubscriptionSkills): boolean {
  const key = deptEntitlementKey(dept)
  if (key === null) return true
  return Boolean(skills[key])
}

export function lockedHintIt(dept: DeptId): string {
  const names: Record<string, string> = {
    spend: 'Spend pubblicitario',
    seo: 'SEO',
    shopify: 'Negozio Shopify',
    lead: 'Lead',
  }
  const name = names[dept] ?? 'Questo reparto'
  return `${name} non è nel piano attivo. Attivalo in Admin → Attivazione piano / reparti.`
}

/** Best-effort: which entitlement a free-text goal needs (null = generic / leadership). */
export function goalEntitlement(goal: string): keyof SubscriptionSkills | null {
  const text = goal.toLowerCase()
  if (/(promo|promotion|discount|price rule|shopify promo)/.test(text)) return 'shopify'
  if (/(lead|warming|nurture|crm|sequence)/.test(text)) return 'leads'
  if (/(spend|ads|budget|roas|cpa|meta|google)/.test(text)) return 'spend'
  if (/(seo|title|meta|page|sitemap|crawl)/.test(text)) return 'seo'
  return null
}

export function assertGoalAllowed(
  goal: string,
  skills: SubscriptionSkills,
): string | null {
  const key = goalEntitlement(goal)
  if (!key) return null
  if (skills[key]) return null
  const labels: Record<keyof SubscriptionSkills, string> = {
    spend: 'Spend pubblicitario',
    seo: 'SEO',
    shopify: 'Negozio Shopify',
    leads: 'Lead',
  }
  return `Reparto non attivo nel piano: ${labels[key]}. Attivalo in Admin → Attivazione piano / reparti.`
}
