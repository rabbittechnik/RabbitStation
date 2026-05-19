import type { FeatureKey } from '../data/planFeatures'

/** Aliase für showFeatureLocked (z. B. aus API oder Legacy-Keys). */
export const FEATURE_LOCK_ALIASES: Record<string, FeatureKey> = {
  payroll: 'payroll_audit',
  payroll_time: 'payroll_time_tracking',
  payroll_schedule: 'payroll_schedule',
  tuv_report: 'monthly_tuv_report',
  documents_advanced: 'protected_documents',
}

export function resolveFeatureKey(feature: string): FeatureKey {
  if (feature in FEATURE_LOCK_ALIASES) {
    return FEATURE_LOCK_ALIASES[feature]!
  }
  return feature as FeatureKey
}
