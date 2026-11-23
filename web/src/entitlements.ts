import type {
  OfficeMode,
  ProductPlan,
  SubscriptionFeatures,
  SubscriptionSkills,
  TenantConfig,
} from './api'
import type { DeptId } from './depts'
import { getCatalogSkill, SKILL_CATALOG, type SkillDef } from './skillCatalog'

export const DEFAULT_SKILLS: SubscriptionSkills = {
  spend: true,
  seo: true,
  shopify: false,
  leads: false,
  operations: false,
  design: false,
  it: false,
  controlling: false,
}

export const DEFAULT_FEATURES: SubscriptionFeatures = {
  // Market rule: full 3D office for everyone; free vs paid = skills/limits only.
  office_view: true,
}

/** Merge known defaults so Admin / PUT never drop new entitlement keys. */
export function mergeSkills(
  partial?: Partial<SubscriptionSkills> | null,
): SubscriptionSkills {
  return { ...DEFAULT_SKILLS, ...(partial ?? {}) }
}

export function normalizePlan(plan?: string | null): ProductPlan {
  const key = (plan || 'free').trim().toLowerCase()
  if (key === 'free' || key === 'starter') return 'free'
  if (key === 'plus' || key === 'growth' || key === 'scale') return 'plus'
  return 'free'
}

export function skillsFromConfig(cfg?: TenantConfig | null): SubscriptionSkills {
  return mergeSkills(cfg?.subscription?.skills)
}

export function featuresFromConfig(cfg?: TenantConfig | null): SubscriptionFeatures {
  return {
    ...DEFAULT_FEATURES,
    ...(cfg?.subscription?.features ?? {}),
  }
}

export function isPlusEntitled(cfg?: TenantConfig | null): boolean {
  if (cfg?.subscription?.plus_override) return true
  return normalizePlan(cfg?.subscription?.plan) === 'plus'
}

/** Office mode preference — 3D available to all plans (not a paid gate). */
export function effectiveOfficeMode(cfg?: TenantConfig | null): OfficeMode {
  const mode = cfg?.subscription?.office_mode
  if (mode === 'full' || mode === 'light' || mode === 'auto') return mode
  return 'full'
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
  if (dept === 'ops') return 'operations'
  return dept as keyof SubscriptionSkills
}

export function isDeptEnabled(dept: DeptId, skills: SubscriptionSkills): boolean {
  const key = deptEntitlementKey(dept)
  if (key === null) return true
  return Boolean(skills[key])
}

export function isCatalogSkillAllowed(
  skillId: string,
  cfg?: TenantConfig | null,
): boolean {
  const always = new Set(['planner', 'hitl', 'reporting', 'shopify_read', 'knowledge'])
  if (always.has(skillId)) return true
  const catalog = getCatalogSkill(skillId)
  const skills = skillsFromConfig(cfg)
  if (catalog) {
    if (!skills[catalog.entitlement]) return false
    if (catalog.tier === 'plus' && !isPlusEntitled(cfg)) return false
    return true
  }
  // Fallback: treat as dept entitlement via id prefix heuristics — unknown = deny.
  return false
}

/** Skills the Agent may activate for this tenant (dept on + tier ok). */
export function allowedCatalogSkills(cfg?: TenantConfig | null): SkillDef[] {
  return SKILL_CATALOG.filter((s) => isCatalogSkillAllowed(s.id, cfg))
}

export function lockedHintIt(dept: DeptId): string {
  const names: Record<string, string> = {
    spend: 'Spend pubblicitario',
    seo: 'SEO',
    shopify: 'Negozio Shopify',
    lead: 'Lead',
    ops: 'Operations',
    design: 'Graphic Designer',
    it: 'IT',
    controlling: 'Controlling',
  }
  const name = names[dept] ?? 'Questo reparto'
  return `${name} non è nel piano attivo. Attivalo in Admin → Attivazione piano / reparti.`
}

export function plusLockedHintIt(skillLabel: string): string {
  return (
    `${skillLabel} è una skill Plus. Passa a Plus in Admin → Attivazione piano / reparti ` +
    `(o abilita override Admin).`
  )
}

/** Best-effort: which entitlement a free-text goal needs (null = generic / leadership). */
export function goalEntitlement(goal: string): keyof SubscriptionSkills | null {
  const text = goal.toLowerCase()
  if (/(promo|promotion|discount|price rule|shopify promo)/.test(text)) return 'shopify'
  if (/(lead|warming|nurture|crm|sequence)/.test(text)) return 'leads'
  if (/(operat|fulfillment|giacenz|inventory|stock|spedizion|shipping|ordini)/.test(text)) {
    return 'operations'
  }
  if (/(design|creative|creativit|brand kit|asset creativ|graphic)/.test(text)) return 'design'
  if (/(integraz|integration|accessi|credenzial|uptime|monitoring|runtime)/.test(text)) {
    return 'it'
  }
  if (/(controlling|budget vs|kpi snapshot|costi anomali|cost alert)/.test(text)) {
    return 'controlling'
  }
  if (/(spend|ads|budget|roas|cpa|meta|google)/.test(text)) return 'spend'
  if (/(seo|title|meta|page|sitemap|crawl)/.test(text)) return 'seo'
  return null
}

/** Detect explicit plus-deep skill intent in free text. */
export function goalPlusSkill(goal: string): string | null {
  const text = goal.toLowerCase()
  if (
    /(spend deep|ottimizzazione deep|optimize spend deep|deep roas|live optimize ads|packaging report roas)/.test(
      text,
    )
  ) {
    return 'spend_deep_optimize'
  }
  if (
    /(seo deep|content brief|brief content|deep seo|seo report pack|packaging report seo)/.test(
      text,
    )
  ) {
    return 'seo_deep_content'
  }
  return null
}

export function assertGoalAllowed(
  goal: string,
  skills: SubscriptionSkills,
  cfg?: TenantConfig | null,
): string | null {
  const plusSkill = goalPlusSkill(goal)
  if (plusSkill && cfg !== undefined) {
    if (!isCatalogSkillAllowed(plusSkill, cfg)) {
      const label = getCatalogSkill(plusSkill)?.label_it ?? plusSkill
      if (!isPlusEntitled(cfg)) return plusLockedHintIt(label)
    }
  }
  const key = goalEntitlement(goal)
  if (!key) return null
  if (skills[key]) return null
  const labels: Record<keyof SubscriptionSkills, string> = {
    spend: 'Spend pubblicitario',
    seo: 'SEO',
    shopify: 'Negozio Shopify',
    leads: 'Lead',
    operations: 'Operations',
    design: 'Graphic Designer',
    it: 'IT',
    controlling: 'Controlling',
  }
  return `Reparto non attivo nel piano: ${labels[key]}. Attivalo in Admin → Attivazione piano / reparti.`
}
