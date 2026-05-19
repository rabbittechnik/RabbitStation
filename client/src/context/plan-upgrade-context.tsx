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

type PlanUpgradeContextValue = {
  isLoggedIn: boolean
  currentPlanId: PlanId | null
  openPlanUpgrade: (targetPlan: PlanId) => void
}

const PlanUpgradeContext = createContext<PlanUpgradeContextValue | null>(null)

export function PlanUpgradeProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth()
  const [open, setOpen] = useState(false)
  const [targetPlan, setTargetPlan] = useState<PlanId>('pro')

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

  const value = useMemo(
    () => ({ isLoggedIn, currentPlanId, openPlanUpgrade }),
    [isLoggedIn, currentPlanId, openPlanUpgrade],
  )

  return (
    <PlanUpgradeContext.Provider value={value}>
      {children}
      <PlanTrialUpgradeDialog open={open} targetPlan={targetPlan} onClose={() => setOpen(false)} />
    </PlanUpgradeContext.Provider>
  )
}

export function usePlanUpgrade(): PlanUpgradeContextValue {
  const ctx = useContext(PlanUpgradeContext)
  if (!ctx) throw new Error('usePlanUpgrade must be used within PlanUpgradeProvider')
  return ctx
}
