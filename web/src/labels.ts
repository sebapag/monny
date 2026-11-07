import type { Approval, Report } from './api'

/** Human Italian labels — never show snake_case as primary text. */

export const ACTION_LABELS: Record<string, string> = {
  pause_campaign: 'Metti in pausa la campagna',
  reduce_budget: 'Riduci il budget',
  seo_apply_changeset: 'Applica le modifiche SEO',
  phase2_stub: 'Proposta promo Shopify (anteprima)',
  phase3_stub: 'Proposta lead warming (anteprima)',
}

export const CHANNEL_LABELS: Record<string, string> = {
  google: 'Google Ads',
  meta: 'Meta Ads',
  shopify: 'Shopify',
  seo: 'SEO',
  site: 'Sito',
}

export const SKILL_LABELS: Record<string, string> = {
  planner: 'Pianificazione',
  shopify_read: 'Lettura Shopify',
  spend_google: 'Spend · Google Ads',
  spend_meta: 'Spend · Meta',
  seo_audit: 'Audit SEO',
  seo_crawler: 'Crawl pagine',
  shopify_promo: 'Promo Shopify',
  lead_warming: 'Lead warming',
  reporting: 'Report',
  hitl: 'Approvazione umana',
}

export function actionTitle(actionType: string, entityName?: string | null): string {
  const base = ACTION_LABELS[actionType] ?? humanizeSnake(actionType)
  const name = (entityName || '').trim()
  if (!name) return base
  if (actionType === 'seo_apply_changeset') return `${base} (${name})`
  return `${base} “${name}”`
}

export function channelLabel(channel?: string | null): string {
  if (!channel) return ''
  return CHANNEL_LABELS[channel] ?? humanizeSnake(channel)
}

export function skillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? humanizeSnake(skill)
}

export function humanizeSnake(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase())
}

export type PlainApproval = {
  title: string
  reasonLine: string
  why: string
  ifApprove: string
  details: string[]
  channel: string
  entityName: string
  actionType: string
}

export function plainApproval(a: Approval): PlainApproval {
  const p = a.payload || {}
  const actionType = a.action_type || String(p.action_type || '')
  const entityName = String(p.entity_name || p.entity_id || '')
  const channel = String(p.channel || '')
  const metrics = (p.metrics || {}) as Record<string, unknown>
  const flags = Array.isArray(p.flags) ? (p.flags as string[]) : []
  const delta = p.proposed_budget_delta_pct as number | undefined

  const title = actionTitle(actionType, entityName)
  const ch = channelLabel(channel)

  let reasonLine = ''
  let why = ''
  let ifApprove = ''

  if (actionType === 'pause_campaign') {
    reasonLine = ch
      ? `Su ${ch} sta spendendo poco in modo efficace.`
      : 'La campagna sta spendendo poco in modo efficace.'
    why =
      flags.includes('zero_conversions')
        ? 'Non ha portato conversioni utili nel periodo analizzato.'
        : 'Il rendimento è sotto le soglie che hai impostato.'
    ifApprove = 'La campagna viene messa in pausa (in dry-run: simulato, senza effetti reali).'
  } else if (actionType === 'reduce_budget') {
    const pct = typeof delta === 'number' ? Math.abs(delta) : 15
    reasonLine = ch
      ? `Su ${ch} conviene ridurre la spesa giornaliera.`
      : 'Conviene ridurre la spesa giornaliera.'
    why = `Il rendimento è sotto soglia: propongo circa −${pct}% sul budget giornaliero.`
    ifApprove = `Il budget giornaliero viene ridotto di circa ${pct}% (in dry-run: simulato).`
  } else if (actionType === 'seo_apply_changeset') {
    const pages = entityName || 'alcune pagine'
    reasonLine = `Ci sono titoli e meta da migliorare su ${pages}.`
    why = String(p.reason || 'L’audit SEO ha trovato testi da aggiornare.')
    ifApprove = 'Le modifiche SEO proposte vengono applicate al CMS (in dry-run: simulato).'
  } else if (actionType === 'phase2_stub' || actionType === 'phase3_stub') {
    reasonLine = 'Anteprima di una funzione in arrivo: nessuna modifica reale.'
    why = String(p.reason || 'Proposta stub per mostrare il flusso di approvazione.')
    ifApprove = 'Confermi di aver visto l’anteprima. Nessun effetto sul negozio.'
  } else {
    reasonLine = stripRawIds(a.summary) || 'Proposta in attesa della tua decisione.'
    why = String(p.reason || reasonLine)
    ifApprove = 'L’azione proposta viene eseguita (in dry-run: simulato).'
  }

  const details: string[] = []
  if (ch) details.push(`Canale: ${ch}`)
  if (entityName) details.push(`Campagna / entità: ${entityName}`)
  if (metrics.roas != null) details.push(`ROAS: ${metrics.roas}`)
  if (metrics.cpa != null) details.push(`CPA: €${metrics.cpa}`)
  if (metrics.spend != null) details.push(`Spend: €${metrics.spend}`)
  if (metrics.conversions != null) details.push(`Conversioni: ${metrics.conversions}`)
  if (metrics.daily_budget != null) details.push(`Budget giornaliero: €${metrics.daily_budget}`)
  if (typeof delta === 'number') details.push(`Delta budget proposto: ${delta}%`)
  if (flags.length) details.push(`Segnali: ${flags.map(humanizeSnake).join(', ')}`)
  if (p.reason && typeof p.reason === 'string') details.push(`Nota tecnica: ${p.reason}`)

  return {
    title,
    reasonLine,
    why,
    ifApprove,
    details,
    channel: ch,
    entityName,
    actionType,
  }
}

function stripRawIds(summary: string): string {
  return summary
    .replace(/\[[a-z0-9_]+\]\s*/gi, '')
    .replace(/\b(google|meta|shopify|seo)\s*:/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Short Italian agent bubble — never dump markdown / skill ids. */
export function friendlyAgentReply(
  reply: string | null | undefined,
  report: Report | null | undefined,
  status?: string,
): string {
  const proposals = report?.proposals?.length ?? report?.proposal_count ?? 0
  const spend = report?.spend_channels ?? []
  const seoChanges = report?.seo_change_set?.changes?.length ?? 0

  if (status === 'awaiting_approval' || proposals > 0) {
    const n = proposals || 'alcune'
    if (spend.length) {
      return `Ho controllato le ads: ci sono ${n} proposte da decidere. Guarda il pannello a destra e Approva o Rifiuta.`
    }
    if (seoChanges) {
      return `Ho trovato ${seoChanges} pagine da migliorare. Ci sono ${n} proposte SEO in attesa della tua decisione.`
    }
    return `Ci sono ${n} proposte in attesa. Scegli Approva o Rifiuta nel pannello Approvazioni.`
  }

  if (spend.length) {
    const waste = spend.reduce((s, ch) => s + (ch.totals?.waste_spend ?? 0), 0)
    return waste > 0
      ? `Analisi ads completata. Ho segnalato circa €${waste} di spesa poco efficace, ma non ci sono azioni da approvare ora.`
      : 'Analisi ads completata. Le campagne sembrano in linea con le tue soglie.'
  }

  if (seoChanges) {
    return `Audit SEO completato: ${seoChanges} pagine con suggerimenti. Nessuna azione in attesa.`
  }

  // Fallback: strip markdown-ish / snake_case noise from backend reply
  if (!reply) return 'Fatto.'
  const cleaned = reply
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\b[a-z]+_[a-z0-9_]+\b/g, (m) => skillLabel(m))
    .replace(/\(ids:[^)]+\)/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
  const first = cleaned.split('\n').filter(Boolean).slice(0, 2).join(' ')
  return first.length > 280 ? `${first.slice(0, 277)}…` : first || 'Fatto.'
}

export function friendlyDecideNote(
  actionType: string,
  decision: 'approved' | 'rejected',
  applyStatus?: string,
): string {
  const title = ACTION_LABELS[actionType] ?? humanizeSnake(actionType)
  if (decision === 'approved') {
    const st = applyStatus === 'dry_run' || applyStatus === 'stub' || applyStatus === 'ok'
      ? 'simulato in dry-run'
      : applyStatus || 'ok'
    return `Hai approvato: ${title} (${st}).`
  }
  return `Hai rifiutato: ${title}.`
}

export function friendlySkillDetail(skill: string, detail: string): string {
  if (!detail) return ''
  // "Piano: spend_google, spend_meta" → Italian labels
  if (detail.startsWith('Piano:')) {
    const parts = detail
      .replace(/^Piano:\s*/, '')
      .split(',')
      .map((s) => skillLabel(s.trim()))
    return `Piano: ${parts.join(', ')}`
  }
  return detail
    .replace(/\bmode=fixture\b/gi, 'modalità demo')
    .replace(/\b[a-z]+_[a-z0-9_]+\b/g, (m) => {
      if (SKILL_LABELS[m] || ACTION_LABELS[m]) return skillLabel(m)
      return humanizeSnake(m)
    })
}

export function runHasUserTurns(messages: { role: string }[]): boolean {
  return messages.some((m) => m.role === 'user')
}
