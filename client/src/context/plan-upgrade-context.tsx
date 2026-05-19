import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PlanId } from '../data/pricingPlans'
import { registerUrlForPlan } from '../data/pricingPlans'
import { useAuth } from './auth-context'
import { normalizePlanId } from '../data/pricingPlans'
import { PlanTrialUpgradeDialog } from '../components/plan/PlanTrialUpgradeDialog'
import { FeatureLockedModal } from '../components/plan/FeatureLockedModal'
import type { FeatureKey } from '../data/planFeatures'
import { resolveFeatureKey } from '../lib/featureLock'

type PlanUpgradeContextValue = {
  isLoggedIn: boolean
  currentPlanId: PlanId | null
  openPlanUpgrade: (targetPlan: PlanId) => void
  showFeatureLocked: (feature: FeatureKey | string) => void
}

const PlanUpgradeContext = createContext<PlanUpgradeContextValue | null>(null)

export function PlanUpgradeProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [open, setOpen] = useState(false)
  const [targetPlan, setTargetPlan] = useState<PlanId>('pro')
  const [lockedFeature, setLockedFeature] = useState<FeatureKey | null>(null)

  const isLoggedIn = Boolean(token && user?.tenantId)
  const currentPlanId = user?.planEntitlements?.planId ? normalizePlanId(user.planEntitlements.planId) : null

  const openPlanUpgrade = useCallback(
    (plan: PlanId) => {
      if (!isLoggedIn) {
        window.location.assign(registerUrlForPlan(plan))
        return
      }
      setTargetPlan(plan)
      setOpen(true)
    },
    [isLoggedIn],
  )

  const showFeatureLocked = useCallback((feature: FeatureKey | string) => {
    setLockedFeature(resolveFeatureKey(feature))
  }, [])

  const value = useMemo(
    () => ({ isLoggedIn, currentPlanId, openPlanUpgrade, showFeatureLocked }),
    [isLoggedIn, currentPlanId, openPlanUpgrade, showFeatureLocked],
  )

  return (
    <PlanUpgradeContext.Provider value={value}>
      {children}
      <PlanTrialUpgradeDialog open={open} targetPlan={targetPlan} onClose={() => setOpen(false)} />
      <FeatureLockedModal
        open={lockedFeature != null}
        feature={lockedFeature ?? 'payroll_audit'}
        onClose={() => setLockedFeature(null)}
      />
    </PlanUpgradeContext.Provider>
  )
}

export function usePlanUpgrade(): PlanUpgradeContextValue {
  const ctx = useContext(PlanUpgradeContext)
  if (!ctx) throw new Error('usePlanUpgrade must be used within PlanUpgradeProvider')
  return ctx
}
