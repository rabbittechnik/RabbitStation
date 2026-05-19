import { apiSend, type ApiEnvelope } from './api'
import type { PlanId } from '../data/pricingPlans'

export type ChangePlanResponse = {
  tenant: {
    plan: string
    subscriptionStatus: string
    trialDaysLeft: number | null
    trialEnd: string | null
  }
  plan: {
    planId: PlanId
    planName: string
    features: string[]
  }
  subscription: {
    canWrite: boolean
    status: string
    trialDaysLeft: number | null
    message: string | null
  }
  message: string
  changed: boolean
}

export function changeSubscriptionPlan(plan: PlanId): Promise<ApiEnvelope<ChangePlanResponse>> {
  return apiSend<ChangePlanResponse>('POST', '/subscription/change-plan', { plan })
}
