/**
 * Portable skill catalog mirror (free | plus + knowhow linkage).
 * Source of truth for runtime gates is the worker catalog; this drives Admin/Agent UI.
 */

export type SkillTier = 'free' | 'plus'

export type SkillKnowhow = {
  playbook: string | null
  knowledge_tags: string[]
  knowledge_paths: string[]
  decision_rights_key: string | null
}

export type SkillDef = {
  id: string
  department: string
  tier: SkillTier
  label_it: string
  blurb_it: string
  entitlement: keyof import('./apiTypes').SubscriptionSkills
  knowhow: SkillKnowhow
  extension_hook: boolean
}

export const SKILL_CATALOG: SkillDef[] = [
  {
    id: 'spend_google',
    department: 'spend',
    tier: 'free',
    label_it: 'Spend · Google Ads',
    blurb_it: 'Diagnosi campagne Google: ROAS/CPA e proposte base.',
    entitlement: 'spend',
    knowhow: {
      playbook: 'playbooks/ads-base.md',
      knowledge_tags: ['spend', 'ads', 'brand'],
      knowledge_paths: ['spend-guidelines.md', 'playbooks/ads-base.md'],
      decision_rights_key: 'spend',
    },
    extension_hook: false,
  },
  {
    id: 'spend_meta',
    department: 'spend',
    tier: 'free',
    label_it: 'Spend · Meta',
    blurb_it: 'Diagnosi campagne Meta: ROAS/CPA e proposte base.',
    entitlement: 'spend',
    knowhow: {
      playbook: 'playbooks/ads-base.md',
      knowledge_tags: ['spend', 'ads', 'brand'],
      knowledge_paths: ['spend-guidelines.md', 'playbooks/ads-base.md'],
      decision_rights_key: 'spend',
    },
    extension_hook: false,
  },
  {
    id: 'spend_deep_optimize',
    department: 'spend',
    tier: 'plus',
    label_it: 'Spend deep · ottimizzazione',
    blurb_it:
      'Plus: retrieval ricco, packaging report ROAS, hook adapter live e decision rights avanzati.',
    entitlement: 'spend',
    knowhow: {
      playbook: 'playbooks/ads-deep.md',
      knowledge_tags: ['spend', 'ads', 'plus', 'optimize'],
      knowledge_paths: ['playbooks/ads-deep.md', 'spend-guidelines.md'],
      decision_rights_key: 'spend',
    },
    extension_hook: true,
  },
  {
    id: 'seo_crawler',
    department: 'seo',
    tier: 'free',
    label_it: 'Crawl pagine',
    blurb_it: 'Crawl delle pagine prioritarie (title/meta/H1 input).',
    entitlement: 'seo',
    knowhow: {
      playbook: 'playbooks/seo-base.md',
      knowledge_tags: ['seo', 'site'],
      knowledge_paths: ['playbooks/seo-base.md'],
      decision_rights_key: 'seo',
    },
    extension_hook: false,
  },
  {
    id: 'seo_audit',
    department: 'seo',
    tier: 'free',
    label_it: 'Audit SEO',
    blurb_it: 'Audit title / meta / H1 sulle pagine prioritarie.',
    entitlement: 'seo',
    knowhow: {
      playbook: 'playbooks/seo-base.md',
      knowledge_tags: ['seo', 'site', 'brand'],
      knowledge_paths: ['playbooks/seo-base.md', 'brand-voice.md'],
      decision_rights_key: 'seo',
    },
    extension_hook: false,
  },
  {
    id: 'seo_deep_content',
    department: 'seo',
    tier: 'plus',
    label_it: 'SEO deep · content & report',
    blurb_it: 'Plus: brief content, packaging report SEO e hook CMS/live apply.',
    entitlement: 'seo',
    knowhow: {
      playbook: 'playbooks/seo-deep.md',
      knowledge_tags: ['seo', 'content', 'plus'],
      knowledge_paths: ['playbooks/seo-deep.md', 'brand-voice.md'],
      decision_rights_key: 'seo',
    },
    extension_hook: true,
  },
]

export function skillsForDepartment(department: string): SkillDef[] {
  return SKILL_CATALOG.filter((s) => s.department === department)
}

export function getCatalogSkill(id: string): SkillDef | undefined {
  return SKILL_CATALOG.find((s) => s.id === id)
}
