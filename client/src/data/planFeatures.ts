/** Feature-Keys (sync mit server/src/config/planConfig.ts) */
export type FeatureKey =
  | 'schedule'
  | 'shift_templates'
  | 'tasks'
  | 'basic_documents'
  | 'employee_app'
  | 'protected_documents'
  | 'time_tracking'
  | 'time_approvals'
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

export type PlanEntitlements = {
  planId: string
  planName: string
  priceMonthly: number
  features: string[]
  limits: { maxStations: number; maxEmployees: number; maxTablets: number }
  usage: { stations: number; employees: number; tablets: number }
  subscriptionStatus: string
}

export const FEATURE_MIN_PLAN: Record<FeatureKey, 'starter' | 'pro' | 'multi_station'> = {
  schedule: 'starter',
  shift_templates: 'starter',
  tasks: 'starter',
  basic_documents: 'starter',
  employee_app: 'starter',
  protected_documents: 'pro',
  time_tracking: 'pro',
  time_approvals: 'pro',
  payroll_audit: 'pro',
  surcharges: 'pro',
  holidays: 'pro',
  absences: 'pro',
  monthly_tuv_report: 'pro',
  station_tablet: 'pro',
  contacts: 'pro',
  monthly_reports: 'pro',
  multi_station: 'multi_station',
  advanced_roles: 'multi_station',
  exports: 'multi_station',
  priority_support: 'multi_station',
  multiple_tablets: 'multi_station',
}

export const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = {
  payroll_audit: 'Lohnprüfung',
  time_tracking: 'Zeiterfassung',
  time_approvals: 'Zeitfreigaben',
  station_tablet: 'Stationstablet',
  monthly_tuv_report: 'TÜV-Bericht',
  absences: 'Abwesenheiten',
  contacts: 'Kontakte & Vertreter',
  holidays: 'Feiertage',
  multi_station: 'Multi-Station',
}

/** Nav-Pfad → Feature (fehlend = immer sichtbar im Plan-Kontext). */
export const NAV_PATH_FEATURES: Record<string, FeatureKey> = {
  '/absences': 'absences',
  '/abwesenheiten': 'absences',
  '/tuv-berichte': 'monthly_tuv_report',
  '/organisation/representatives': 'contacts',
  '/contacts/representatives': 'contacts',
  '/reports/payroll-time': 'payroll_audit',
  '/reports/payroll-schedule': 'payroll_audit',
  '/reports/payroll-summary': 'payroll_audit',
  '/reports/payroll-audit': 'payroll_audit',
  '/zeiterfassung/freigaben': 'time_approvals',
  '/time-tracking/approvals': 'time_approvals',
  '/holidays': 'holidays',
}

export function featureForPath(path: string): FeatureKey | undefined {
  if (NAV_PATH_FEATURES[path]) return NAV_PATH_FEATURES[path]
  for (const [prefix, feature] of Object.entries(NAV_PATH_FEATURES)) {
    if (path.startsWith(prefix)) return feature
  }
  return undefined
}

export function hasPlanFeature(entitlements: PlanEntitlements | null | undefined, feature: FeatureKey): boolean {
  if (!entitlements) return true
  return entitlements.features.includes(feature)
}
