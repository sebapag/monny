/** Admin information architecture — hub tiles → one-job detail sections. */

export const ADMIN_SECTIONS = [
  {
    id: 'spend',
    title: 'Spesa del mese',
    blurb: 'Quanto hai speso, il limite e quando arrivano gli addebiti.',
    tint: 'sky',
  },
  {
    id: 'shop',
    title: 'Negozio e URL',
    blurb: 'Dominio Shopify, sito pubblico e pagine prioritarie.',
    tint: 'peach',
  },
  {
    id: 'ads',
    title: 'Account Meta e Ads',
    blurb: 'Collega Meta e Google Ads. I secret restano protetti.',
    tint: 'lavender',
  },
  {
    id: 'connectors',
    title: 'Connettori commerce',
    blurb: 'Shopify incluso; altri store in arrivo (grigio).',
    tint: 'peach',
  },
  {
    id: 'plan',
    title: 'Piano e reparti',
    blurb: 'Quali reparti sono nel piano e partono nell’agent.',
    tint: 'mint',
  },
  {
    id: 'office',
    title: 'Vista ufficio',
    blurb: 'Completa 3D, leggera o automatica.',
    tint: 'cream',
  },
  {
    id: 'rules',
    title: 'Regole e diritti',
    blurb: 'HITL, autonomia per reparto e soglie ads.',
    tint: 'yellow',
  },
  {
    id: 'knowledge',
    title: 'Conoscenza aziendale',
    blurb: 'Documenti che Atrium consulta prima di spend e SEO.',
    tint: 'sage',
  },
  {
    id: 'users',
    title: 'Utenti e ruoli',
    blurb: 'Chi può aprire Agent e chi può aprire Admin.',
    tint: 'rose',
  },
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

export function isAdminSectionId(value: string): value is AdminSectionId {
  return ADMIN_SECTIONS.some((s) => s.id === value)
}

export function adminSectionById(id: AdminSectionId) {
  return ADMIN_SECTIONS.find((s) => s.id === id)!
}

/** Parse `#admin` or `#admin/spend` (also tolerates `#/admin/...`). */
export function parseAdminPath(raw: string): {
  mode: 'admin'
  section: AdminSectionId | null
} | null {
  const cleaned = raw.replace(/^\/+/, '')
  if (cleaned === 'admin') return { mode: 'admin', section: null }
  const m = cleaned.match(/^admin\/([a-z_]+)$/)
  if (!m) return null
  if (!isAdminSectionId(m[1])) return { mode: 'admin', section: null }
  return { mode: 'admin', section: m[1] }
}

export function hashForAdmin(section: AdminSectionId | null | undefined): string {
  if (!section) return '#admin'
  return `#admin/${section}`
}
