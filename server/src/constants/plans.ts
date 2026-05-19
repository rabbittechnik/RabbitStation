/** SaaS-Tarife RabbitStation Pro */
export const PLAN_IDS = ['starter', 'pro', 'multi_station'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const DEFAULT_PLAN_ID: PlanId = 'pro'

const PLAN_LABELS: Record<PlanId, string> = {
  starter: 'Starter',
  pro: 'Pro',
  multi_station: 'Multi-Station',
}

export function normalizePlanId(raw: string | null | undefined): PlanId {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (s === 'rabbitstation_pro' || s === 'pro') return 'pro'
  if (s === 'starter') return 'starter'
  if (s === 'multi_station' || s === 'multistation') return 'multi_station'
  return DEFAULT_PLAN_ID
}

export function planDisplayName(planId: string): string {
  const id = normalizePlanId(planId)
  return PLAN_LABELS[id]
}

export function isValidPlanId(raw: string): boolean {
  return PLAN_IDS.includes(normalizePlanId(raw))
}

export const PUBLIC_PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    priceLabel: '19,90 € / Monat',
    trialDays: 7,
    description: 'Für kleine Stationen, die digital starten möchten.',
  },
  {
    id: 'pro' as const,
    name: 'Pro',
    priceLabel: '39,90 € / Monat',
    trialDays: 7,
    recommended: true,
    description: 'Für den kompletten digitalen Stationsalltag.',
  },
  {
    id: 'multi_station' as const,
    name: 'Multi-Station',
    priceLabel: 'ab 69,90 € / Monat',
    trialDays: 7,
    description: 'Für Betreiber mit mehreren Standorten oder größeren Teams.',
  },
] as const
