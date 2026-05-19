import { useEffect, useRef, type ReactNode } from 'react'
import type { FeatureKey } from '../../data/planFeatures'
import { usePlanEntitlements } from '../../hooks/usePlanEntitlements'
import { usePlanUpgrade } from '../../context/plan-upgrade-context'

type PlanFeatureGateProps = {
  feature: FeatureKey
  children: ReactNode
  /** @deprecated Inline-Karten werden nicht mehr gerendert – Modal erscheint zentral. */
  compact?: boolean
}

/** Zeigt Kinder nur bei Plan-Freischaltung; sonst zentrales Feature-Lock-Modal. */
export function PlanFeatureGate({ feature, children }: PlanFeatureGateProps) {
  const { hasFeature } = usePlanEntitlements()
  const { showFeatureLocked } = usePlanUpgrade()
  const shownRef = useRef(false)

  useEffect(() => {
    if (hasFeature(feature)) return
    if (shownRef.current) return
    shownRef.current = true
    showFeatureLocked(feature)
  }, [feature, hasFeature, showFeatureLocked])

  if (!hasFeature(feature)) return null
  return <>{children}</>
}
