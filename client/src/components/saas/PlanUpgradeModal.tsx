import { FeatureLockedModal } from '../plan/FeatureLockedModal'
import type { FeatureKey } from '../../data/planFeatures'

type PlanUpgradeModalProps = {
  open: boolean
  onClose: () => void
  feature: FeatureKey
  featureTitle?: string
  requiredPlan?: string
  description?: string
}

/** @deprecated Nutze showFeatureLocked() aus usePlanUpgrade – Props außer open/onClose/feature werden ignoriert. */
export function PlanUpgradeModal({ open, onClose, feature }: PlanUpgradeModalProps) {
  return <FeatureLockedModal open={open} onClose={onClose} feature={feature} />
}
