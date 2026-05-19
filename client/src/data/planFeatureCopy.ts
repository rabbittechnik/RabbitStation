import type { FeatureKey } from './planFeatures'
import { FEATURE_LABELS, FEATURE_MIN_PLAN } from './planFeatures'

export type PlanFeatureCopy = {
  title: string
  description: string
  requiredPlanLabel: string
}

function planLabel(min: 'starter' | 'pro' | 'multi_station'): string {
  if (min === 'multi_station') return 'Multi-Station'
  if (min === 'pro') return 'Pro'
  return 'Starter'
}

const COPY: Partial<Record<FeatureKey, Omit<PlanFeatureCopy, 'requiredPlanLabel'>>> = {
  station_tablet: {
    title: 'Stationstablet ist im Pro-Paket enthalten',
    description:
      'Das Stationstablet ermöglicht Stempeln, Aufgabenübersicht und Schichtinformationen direkt an der Station. Diese Funktion ist ab RabbitStation Pro verfügbar.',
  },
  monthly_tuv_report: {
    title: 'TÜV-Bericht ist im Pro-Paket enthalten',
    description:
      'Monatliche TÜV-Checklisten, Erinnerungen und Auswertungen sind ab RabbitStation Pro verfügbar.',
  },
  payroll_audit: {
    title: 'Lohnprüfung ist im Pro-Paket enthalten',
    description:
      'Lohnprüfung, Zuschläge und detaillierte Lohnauswertungen sind ab RabbitStation Pro verfügbar.',
  },
  surcharges: {
    title: 'Zuschläge sind im Pro-Paket enthalten',
    description: 'Zuschlagsauswertungen und erweiterte Lohnregeln sind ab RabbitStation Pro verfügbar.',
  },
  time_approvals: {
    title: 'Zeitfreigaben sind im Pro-Paket enthalten',
    description: 'Freigabe und Korrektur von Zeiterfassungen ist ab RabbitStation Pro verfügbar.',
  },
  time_tracking: {
    title: 'Zeiterfassung ist im Pro-Paket enthalten',
    description: 'Erweiterte Zeiterfassung und Auswertungen sind ab RabbitStation Pro verfügbar.',
  },
  absences: {
    title: 'Erweiterte Abwesenheiten sind im Pro-Paket enthalten',
    description:
      'Urlaubssperren und erweiterte Abwesenheitsverwaltung sind ab RabbitStation Pro verfügbar.',
  },
  holidays: {
    title: 'Feiertage sind im Pro-Paket enthalten',
    description: 'Feiertagsverwaltung für die Lohnabrechnung ist ab RabbitStation Pro verfügbar.',
  },
  contacts: {
    title: 'Kontakte & Vertreter sind im Pro-Paket enthalten',
    description: 'Vertreter und Lieferantenkontakte sind ab RabbitStation Pro verfügbar.',
  },
  protected_documents: {
    title: 'Erweiterte Dokumente sind im Pro-Paket enthalten',
    description: 'Geschützte Dokumentenrechte und erweiterte Ablage sind ab RabbitStation Pro verfügbar.',
  },
  multi_station: {
    title: 'Multi-Station ist im Multi-Station-Paket enthalten',
    description: 'Mehrere Tankstellen in einem Mandanten sind ab RabbitStation Multi-Station verfügbar.',
  },
}

export function getPlanFeatureCopy(feature: FeatureKey): PlanFeatureCopy {
  const min = FEATURE_MIN_PLAN[feature]
  const requiredPlanLabel = planLabel(min)
  const custom = COPY[feature]
  const label = FEATURE_LABELS[feature] ?? feature
  return {
    requiredPlanLabel,
    title: custom?.title ?? `${label} ist im ${requiredPlanLabel}-Paket enthalten`,
    description:
      custom?.description ??
      `${label} ist in Ihrem aktuellen Paket nicht enthalten. Upgraden Sie auf ${requiredPlanLabel}, um diese Funktion zu nutzen.`,
  }
}
