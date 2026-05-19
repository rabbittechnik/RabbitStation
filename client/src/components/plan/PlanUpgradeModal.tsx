import { PlanUpgradeModal as BaseModal } from '../saas/PlanUpgradeModal'
import type { FeatureKey } from '../../data/planFeatures'
import { getPlanFeatureCopy } from '../../data/planFeatureCopy'

type Props = {
  open: boolean
  onClose: () => void
  feature: FeatureKey
}

export function PlanFeatureUpgradeModal({ open, onClose, feature }: Props) {
  const copy = getPlanFeatureCopy(feature)
  return (
    <BaseModal
      open={open}
      onClose={onClose}
      feature={feature}
      featureTitle={copy.title}
      requiredPlan={copy.requiredPlanLabel}
      description={copy.description}
    />
  )
}
