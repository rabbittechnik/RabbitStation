import { useMemo } from 'react'
import { useAuth } from '../context/auth-context'
import {
  FEATURE_LABELS,
  FEATURE_MIN_PLAN,
  hasPlanFeature,
  type FeatureKey,
  type PlanEntitlements,
} from '../data/planFeatures'

export function usePlanEntitlements() {
  const { user } = useAuth()
  const entitlements = (user as { planEntitlements?: PlanEntitlements } | null)?.planEntitlements ?? null
  const subscription = user?.subscription

  return useMemo(() => {
    const canWrite = subscription?.canWrite !== false

    function hasFeature(feature: FeatureKey): boolean {
      if (!entitlements) return true
      return hasPlanFeature(entitlements, feature)
    }

    function requiredPlanLabel(feature: FeatureKey): string {
      const min = FEATURE_MIN_PLAN[feature]
      if (min === 'starter') return 'Starter'
      if (min === 'multi_station') return 'Multi-Station'
      return 'Pro'
    }

    function featureLabel(feature: FeatureKey): string {
      return FEATURE_LABELS[feature] ?? feature
    }

    const employeeLimit = entitlements?.limits.maxEmployees
    const employeeUsage = entitlements?.usage.employees
    const employeeLimitReached =
      employeeLimit != null && employeeUsage != null && employeeUsage >= employeeLimit

    return {
      entitlements,
      canWrite,
      hasFeature,
      requiredPlanLabel,
      featureLabel,
      employeeLimitReached,
      employeeLimit,
      employeeUsage,
      planName: entitlements?.planName ?? 'Pro',
      statusMessage: subscription?.message ?? null,
    }
  }, [entitlements, subscription])
}
