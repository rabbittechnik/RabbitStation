import { normalizePlanId, type PlanId } from '../constants/plans.js'

/** Feature-Schlüssel für Plan-Freischaltung */
export type FeatureKey =
  | 'schedule'
  | 'shift_templates'
  | 'tasks'
  | 'basic_documents'
  | 'employee_app'
  | 'protected_documents'
  | 'time_tracking'
  | 'time_approvals'
  | 'payroll_schedule'
  | 'payroll_time_tracking'
  | 'payroll_audit'
  | 'surcharges'
  | 'holidays'
  | 'absences'
  | 'monthly_tuv_report'
  | 'station_tablet'
  | 'contacts'
  | 'monthly_reports'
  | 'multi_station'
  | 'advanced_roles'
  | 'exports'
  | 'priority_support'
  | 'multiple_tablets'

export type PlanDefinition = {
  id: PlanId
  name: string
  priceMonthly: number
  maxStations: number
  maxEmployees: number
  maxTablets: number
  features: ReadonlySet<FeatureKey>
}

const STARTER_FEATURES: FeatureKey[] = [
  'schedule',
  'shift_templates',
  'tasks',
  'basic_documents',
  'employee_app',
  'holidays',
  'payroll_schedule',
]

const PRO_ONLY_FEATURES: FeatureKey[] = [
  'protected_documents',
  'time_tracking',
  'time_approvals',
  'payroll_time_tracking',
  'payroll_audit',
  'surcharges',
  'absences',
  'monthly_tuv_report',
  'station_tablet',
  'contacts',
  'monthly_reports',
]

const MULTI_ONLY_FEATURES: FeatureKey[] = [
  'multi_station',
  'advanced_roles',
  'exports',
  'priority_support',
  'multiple_tablets',
]

const PRO_FEATURES: FeatureKey[] = [...STARTER_FEATURES, ...PRO_ONLY_FEATURES]
const MULTI_FEATURES: FeatureKey[] = [...PRO_FEATURES, ...MULTI_ONLY_FEATURES]

export const PLAN_CONFIG: Record<PlanId, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 19.9,
    maxStations: 1,
    maxEmployees: 5,
    maxTablets: 0,
    features: new Set(STARTER_FEATURES),
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 39.9,
    maxStations: 1,
    maxEmployees: 15,
    maxTablets: 1,
    features: new Set(PRO_FEATURES),
  },
  multi_station: {
    id: 'multi_station',
    name: 'Multi-Station',
    priceMonthly: 69.9,
    maxStations: 2,
    maxEmployees: 30,
    maxTablets: 10,
    features: new Set(MULTI_FEATURES),
  },
}

export function getPlanDefinition(planId: string | null | undefined): PlanDefinition {
  return PLAN_CONFIG[normalizePlanId(planId)]
}

export function getMinimumPlanForFeature(feature: FeatureKey): PlanId {
  if (STARTER_FEATURES.includes(feature)) return 'starter'
  if (PRO_ONLY_FEATURES.includes(feature)) return 'pro'
  return 'multi_station'
}

export function suggestUpgradePlan(currentPlanId: string, context?: 'employees' | 'stations' | 'tablets'): PlanId {
  const current = normalizePlanId(currentPlanId)
  if (context === 'stations' || context === 'tablets') {
    if (current === 'starter') return 'multi_station'
    return 'multi_station'
  }
  if (context === 'employees' && current === 'starter') return 'pro'
  if (current === 'multi_station') return 'multi_station'
  if (current === 'pro') return 'multi_station'
  return 'pro'
}
