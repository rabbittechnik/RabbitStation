/** Tarif-IDs (sync mit server/src/constants/plans.ts) */
export const PLAN_IDS = ['starter', 'pro', 'multi_station'] as const
export type PlanId = (typeof PLAN_IDS)[number]

export const DEFAULT_PLAN_ID: PlanId = 'pro'

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

export type PricingFeature = { text: string; included: boolean }

export type PricingPlan = {
  id: PlanId
  name: string
  price: string
  subtitle: string
  features: PricingFeature[]
  cta: string
  recommended?: boolean
  footnote?: string
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '19,90 €',
    subtitle: 'Für kleine Stationen, die digital starten möchten.',
    cta: 'Starter testen',
    features: [
      { text: '1 Station', included: true },
      { text: 'bis 5 Mitarbeiter', included: true },
      { text: 'Dienstplan', included: true },
      { text: 'Schichtmodelle', included: true },
      { text: 'Aufgabenverwaltung', included: true },
      { text: 'einfache Dokumentenablage', included: true },
      { text: 'Mitarbeiter-App', included: true },
      { text: 'Feiertage & B-Feiertage', included: true },
      { text: 'einfache Lohnabrechnung aus Schichtplan', included: true },
      { text: '7 Tage kostenlos testen', included: true },
      { text: 'Zeiterfassung / Stempeln', included: false },
      { text: 'Zeitfreigaben', included: false },
      { text: 'Lohnabrechnung aus Zeiterfassung', included: false },
      { text: 'Lohnprüfung / Plan-Ist-Vergleich', included: false },
      { text: 'TÜV-Bericht', included: false },
      { text: 'Stationstablet', included: false },
      { text: 'Multi-Station', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '39,90 €',
    subtitle: 'Für den kompletten digitalen Stationsalltag.',
    cta: 'Pro 7 Tage testen',
    recommended: true,
    features: [
      { text: '1 Station', included: true },
      { text: 'bis 15 Mitarbeiter', included: true },
      { text: 'alles aus Starter', included: true },
      { text: 'Zeiterfassung', included: true },
      { text: 'Zeitfreigaben', included: true },
      { text: 'Lohnabrechnung aus Zeiterfassung', included: true },
      { text: 'Lohnprüfung / Plan-Ist-Vergleich', included: true },
      { text: 'Zuschlagsauswertung erweitert', included: true },
      { text: 'Abwesenheiten & Urlaub', included: true },
      { text: 'optionaler TÜV-Bericht', included: true },
      { text: 'Stationstablet', included: true },
      { text: 'geschützte Dokumente', included: true },
      { text: 'Kontakte & Vertreter', included: true },
      { text: 'Monatsberichte', included: true },
    ],
  },
  {
    id: 'multi_station',
    name: 'Multi-Station',
    price: 'ab 69,90 €',
    subtitle: 'Für Betreiber mit mehreren Standorten oder größeren Teams.',
    cta: 'Angebot anfragen',
    footnote: 'Weitere Stationen oder größere Teams auf Anfrage.',
    features: [
      { text: 'bis 2 Stationen', included: true },
      { text: 'bis 30 Mitarbeiter', included: true },
      { text: 'alles aus Pro', included: true },
      { text: 'mehrere Stationen', included: true },
      { text: 'erweiterte Rollen & Rechte', included: true },
      { text: 'mehrere Tablet-Geräte', included: true },
      { text: 'Exportfunktionen', included: true },
      { text: 'priorisierter Support', included: true },
      { text: 'Support-Zugriff nach Freigabe', included: true },
    ],
  },
]

export const PRICING_FAQ = [
  {
    q: 'Kann ich RabbitStation Pro kostenlos testen?',
    a: 'Ja, alle Pakete können 7 Tage kostenlos getestet werden.',
  },
  {
    q: 'Kann ich später den Plan wechseln?',
    a: 'Ja, Sie können später auf einen größeren Plan wechseln.',
  },
  {
    q: 'Sind meine Daten von anderen Tankstellen getrennt?',
    a: 'Ja, jeder Betreiber erhält einen eigenen geschützten Bereich.',
  },
  {
    q: 'Ist die Lohnprüfung eine echte Lohnabrechnung?',
    a: 'Nein, RabbitStation Pro bereitet Arbeitszeiten, Zuschläge und Monatsdaten für Steuerberater, Lohnbüro oder Abrechnungssysteme vor.',
  },
  {
    q: 'Brauche ich eine Installation?',
    a: 'Nein, RabbitStation Pro läuft im Browser und kann am PC, Tablet und Smartphone genutzt werden.',
  },
] as const

export function registerUrlForPlan(planId: PlanId): string {
  return `/registrieren?plan=${planId}`
}

export function planLabel(planId: PlanId): string {
  return PRICING_PLANS.find((p) => p.id === planId)?.name ?? 'Pro'
}
