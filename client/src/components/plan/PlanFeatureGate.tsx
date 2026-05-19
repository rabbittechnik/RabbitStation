import type { ReactNode } from 'react'
import type { FeatureKey } from '../../data/planFeatures'
import { usePlanEntitlements } from '../../hooks/usePlanEntitlements'
import { FeatureLockedCard } from './FeatureLockedCard'

type PlanFeatureGateProps = {
  feature: FeatureKey
  children: ReactNode
  compact?: boolean
}

/** Zeigt Kinder nur bei Plan-Freischaltung; sonst Upgrade-Karte. */
export function PlanFeatureGate({ feature, children, compact }: PlanFeatureGateProps) {
  const { hasFeature, planName } = usePlanEntitlements()
  if (hasFeature(feature)) return <>{children}</>
  return <FeatureLockedCard feature={feature} currentPlan={planName} compact={compact} />
}
