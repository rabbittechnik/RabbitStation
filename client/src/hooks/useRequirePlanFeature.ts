import { useEffect, useRef } from 'react'
import type { FeatureKey } from '../data/planFeatures'
import { usePlanEntitlements } from './usePlanEntitlements'
import { usePlanUpgrade } from '../context/plan-upgrade-context'

/** Öffnet beim Mount ein Feature-Lock-Modal, wenn die Funktion im Plan fehlt. */
export function useRequirePlanFeature(feature: FeatureKey): boolean {
  const { hasFeature } = usePlanEntitlements()
  const { showFeatureLocked } = usePlanUpgrade()
  const shownRef = useRef(false)

  useEffect(() => {
    if (hasFeature(feature)) return
    if (shownRef.current) return
    shownRef.current = true
    showFeatureLocked(feature)
  }, [feature, hasFeature, showFeatureLocked])

  return hasFeature(feature)
}
