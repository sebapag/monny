import type { BillingConfig, TenantConfig } from './apiTypes'

const MONTHS_IT = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const

const PLAN_LABEL: Record<string, string> = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  free: 'Free',
  plus: 'Plus',
}

export function defaultBilling(partial?: Partial<BillingConfig> | null): BillingConfig {
  return {
    currency: 'EUR',
    renews_on_day: 1,
    atrium_price_eur: 49,
    ads_monthly_budget_eur: 2000,
    ads_spent_this_month_eur: 0,
    ...(partial ?? {}),
  }
}

export function billingFromConfig(cfg: TenantConfig | null | undefined): BillingConfig {
  return defaultBilling(cfg?.billing)
}

export function formatEuro(value: number): string {
  const n = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n)
}

export function monthPeriodLabelIt(now = new Date()): string {
  return `${MONTHS_IT[now.getMonth()]} ${now.getFullYear()}`
}

export function nextRenewalLabelIt(renewsOnDay: number, now = new Date()): string {
  const day = Math.min(28, Math.max(1, Math.round(renewsOnDay) || 1))
  let year = now.getFullYear()
  let month = now.getMonth()
  if (now.getDate() >= day) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return `${day} ${MONTHS_IT[month]} ${year}`
}

export function spendProgressPct(spent: number, budget: number): number {
  if (!budget || budget <= 0) return 0
  return Math.min(100, Math.round((Math.max(0, spent) / budget) * 100))
}

export function planLabelIt(plan: string | undefined): string {
  if (!plan) return '—'
  return PLAN_LABEL[plan] ?? plan
}

export type ChargeExplainer = {
  atrium: string
  ads: string
}

/** Plain Italian: when money moves, and who charges. */
export function chargeExplainers(
  billing: BillingConfig,
  plan: string | undefined,
  now = new Date(),
): ChargeExplainer {
  const planName = planLabelIt(plan)
  const renewal = nextRenewalLabelIt(billing.renews_on_day, now)
  const price = formatEuro(billing.atrium_price_eur)
  const atrium =
    billing.atrium_price_eur > 0
      ? `Abbonamento Atrium ${planName}: ${price} il giorno ${billing.renews_on_day} di ogni mese. Prossimo addebito: ${renewal}.`
      : `Piano Atrium ${planName}: nessun addebito di abbonamento questo mese.`
  const ads =
    'La spesa ads (Google e Meta) la addebitano loro sul metodo di pagamento collegato agli account ads — non passa dalla fattura Atrium.'
  return { atrium, ads }
}
