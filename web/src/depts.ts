import type { Approval, TimelineStep } from './api'

/** Corporate departments — each skill family lives in one isolated panel. */

export type DeptId =
  | 'direzione'
  | 'spend'
  | 'seo'
  | 'shopify'
  | 'lead'
  | 'ops'
  | 'design'
  | 'it'
  | 'controlling'

export type DeptTint =
  | 'yellow'
  | 'sky'
  | 'mint'
  | 'peach'
  | 'rose'
  | 'amber'
  | 'lavender'
  | 'slate'
  | 'sage'

export type DeptDef = {
  id: DeptId
  name: string
  blurb: string
  tint: DeptTint
  skills: string[]
  actions: { label: string; goal: string }[]
  placeholder: string
}

export const DEPARTMENTS: DeptDef[] = [
  {
    id: 'direzione',
    name: 'Direzione',
    blurb: 'Decisioni in sospeso. Approva o rifiuta le proposte dei reparti.',
    tint: 'yellow',
    skills: ['hitl'],
    actions: [],
    placeholder: '',
  },
  {
    id: 'spend',
    name: 'Spend pubblicitario',
    blurb: 'Google Ads e Meta: controlla la spesa e le campagne poco efficaci.',
    tint: 'sky',
    skills: ['knowledge', 'spend_google', 'spend_meta', 'reporting'],
    actions: [
      { label: 'Controlla le ads', goal: 'report spend ultimi 7 giorni' },
    ],
    placeholder: 'Es. Controlla le ads degli ultimi 7 giorni…',
  },
  {
    id: 'seo',
    name: 'SEO',
    blurb: 'Title, meta e H1 delle pagine prioritarie del sito.',
    tint: 'mint',
    skills: ['seo_crawler', 'seo_audit'],
    actions: [{ label: 'Controlla SEO', goal: 'seo audit of priority pages' }],
    placeholder: 'Es. Controlla SEO delle pagine prioritarie…',
  },
  {
    id: 'shopify',
    name: 'Negozio Shopify',
    blurb: 'Lettura negozio e anteprima promo (fase successiva).',
    tint: 'peach',
    skills: ['shopify_read', 'shopify_promo'],
    actions: [{ label: 'Prova promo', goal: 'propose shopify promo discount' }],
    placeholder: 'Es. Proponi una promo Shopify…',
  },
  {
    id: 'lead',
    name: 'Lead',
    blurb: 'Sequenze di lead warming in anteprima (fase successiva).',
    tint: 'rose',
    skills: ['lead_warming'],
    actions: [{ label: 'Prova lead', goal: 'lead warming sequence stub' }],
    placeholder: 'Es. Prepara una sequenza lead warming…',
  },
  {
    id: 'ops',
    name: 'Operations',
    blurb: 'Ordini, giacenze e spedizioni: overview operativa in anteprima.',
    tint: 'amber',
    skills: ['ops_orders', 'ops_inventory', 'ops_shipping'],
    actions: [
      { label: 'Stato ordini', goal: 'stato ordini fulfillment overview' },
      { label: 'Giacenze', goal: 'giacenze e stock alerts' },
      { label: 'Spedizioni', goal: 'spedizioni e ritardi' },
    ],
    placeholder: 'Es. Mostra lo stato ordini e i ritardi di spedizione…',
  },
  {
    id: 'design',
    name: 'Graphic Designer',
    blurb: 'Asset creativi, proposte ads e coerenza brand kit.',
    tint: 'lavender',
    skills: ['design_assets', 'design_ads', 'design_brand'],
    actions: [
      { label: 'Asset creativi', goal: 'inventario asset creativi' },
      { label: 'Creatività ads', goal: 'proposte creatività ads' },
      { label: 'Brand kit', goal: 'check brand kit coerenza' },
    ],
    placeholder: 'Es. Controlla il brand kit e proponi creatività ads…',
  },
  {
    id: 'it',
    name: 'IT',
    blurb: 'Salute integrazioni, accessi da completare e monitoring runtime.',
    tint: 'slate',
    skills: ['it_integrations', 'it_access', 'it_monitoring'],
    actions: [
      { label: 'Integrazioni', goal: 'salute integrazioni Shopify Ads GSC' },
      { label: 'Accessi', goal: 'accessi e credenziali da completare' },
      { label: 'Monitoring', goal: 'uptime ed errori runtime' },
    ],
    placeholder: 'Es. Controlla accessi da completare e salute integrazioni…',
  },
  {
    id: 'controlling',
    name: 'Controlling',
    blurb: 'Budget vs spend, KPI snapshot e alert costi anomali.',
    tint: 'sage',
    skills: ['ctrl_budget', 'ctrl_kpi', 'ctrl_costs'],
    actions: [
      { label: 'Budget vs spend', goal: 'budget vs spend controlling' },
      { label: 'KPI snapshot', goal: 'kpi snapshot controlling' },
      { label: 'Costi anomali', goal: 'alert costi anomali' },
    ],
    placeholder: 'Es. Mostra budget vs spend e costi anomali…',
  },
]

export function getDept(id: DeptId | null): DeptDef | null {
  if (!id) return null
  return DEPARTMENTS.find((d) => d.id === id) ?? null
}

export function approvalDept(a: Approval): DeptId {
  const action = a.action_type || String(a.payload?.action_type || '')
  const channel = String(a.payload?.channel || '')
  if (action === 'seo_apply_changeset' || channel === 'seo' || channel === 'site') {
    return 'seo'
  }
  if (channel === 'operations') return 'ops'
  if (channel === 'design') return 'design'
  if (channel === 'it') return 'it'
  if (channel === 'controlling') return 'controlling'
  if (action === 'phase2_stub' || channel === 'shopify') return 'shopify'
  if (action === 'phase3_stub' || action.includes('lead')) return 'lead'
  if (
    action === 'pause_campaign' ||
    action === 'reduce_budget' ||
    channel === 'google' ||
    channel === 'meta'
  ) {
    return 'spend'
  }
  return 'direzione'
}

export function filterApprovals(approvals: Approval[], dept: DeptId): Approval[] {
  if (dept === 'direzione') return approvals
  return approvals.filter((a) => approvalDept(a) === dept)
}

export function countByDept(approvals: Approval[]): Record<DeptId, number> {
  const counts: Record<DeptId, number> = {
    direzione: approvals.length,
    spend: 0,
    seo: 0,
    shopify: 0,
    lead: 0,
    ops: 0,
    design: 0,
    it: 0,
    controlling: 0,
  }
  for (const a of approvals) {
    const d = approvalDept(a)
    if (d !== 'direzione') counts[d] += 1
  }
  return counts
}

/** Skill rail: only steps that belong to this department. */
export function filterSteps(steps: TimelineStep[], dept: DeptId): TimelineStep[] {
  const def = getDept(dept)
  if (!def) return []
  if (dept === 'direzione') {
    return steps.filter((s) => s.skill === 'hitl' || s.status === 'waiting')
  }
  const allowed = new Set(def.skills)
  return steps.filter((s) => allowed.has(s.skill))
}

export type RouteState =
  | { mode: 'piano' }
  | { mode: 'dept'; dept: DeptId }
  | { mode: 'admin' }

export function parseHash(hash: string): RouteState {
  const raw = hash.replace(/^#/, '')
  if (!raw || raw === 'agent' || raw === 'piano') return { mode: 'piano' }
  if (raw === 'admin') return { mode: 'admin' }
  const deptMatch = raw.match(/^dept=([a-z_]+)$/)
  if (deptMatch) {
    const id = deptMatch[1] as DeptId
    if (DEPARTMENTS.some((d) => d.id === id)) return { mode: 'dept', dept: id }
  }
  return { mode: 'piano' }
}

export function hashFor(route: RouteState): string {
  if (route.mode === 'admin') return '#admin'
  if (route.mode === 'dept') return `#dept=${route.dept}`
  return '#agent'
}
