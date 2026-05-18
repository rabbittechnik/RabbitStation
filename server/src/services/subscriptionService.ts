import type { Database } from 'better-sqlite3'
import { getTenantById, type TenantRow } from './tenantService.js'

export type SubscriptionWriteState = {
  canWrite: boolean
  reason: string | null
  status: string
  trialDaysLeft: number | null
}

const WRITE_ALLOWED_STATUSES = new Set(['trial', 'active'])

export function getSubscriptionWriteState(tenant: TenantRow): SubscriptionWriteState {
  const status = tenant.subscription_status?.trim() || 'trial'
  const trialEnd = tenant.trial_end ? new Date(tenant.trial_end) : null
  const now = new Date()
  let trialDaysLeft: number | null = null
  if (trialEnd && status === 'trial') {
    trialDaysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
  }

  if (tenant.blocked_reason?.trim()) {
    return { canWrite: false, reason: tenant.blocked_reason, status, trialDaysLeft }
  }

  if (status === 'trial' && trialEnd && trialEnd < now) {
    return {
      canWrite: false,
      reason: 'trial_expired',
      status: 'expired',
      trialDaysLeft: 0,
    }
  }

  if (WRITE_ALLOWED_STATUSES.has(status)) {
    return { canWrite: true, reason: null, status, trialDaysLeft }
  }

  if (status === 'past_due') {
    return { canWrite: false, reason: 'payment_past_due', status, trialDaysLeft }
  }

  return { canWrite: false, reason: status, status, trialDaysLeft }
}

export function assertTenantCanWrite(db: Database, tenantId: string): void {
  const tenant = getTenantById(db, tenantId)
  if (!tenant) throw new Error('Tenant nicht gefunden')
  const state = getSubscriptionWriteState(tenant)
  if (!state.canWrite) {
    if (state.reason === 'trial_expired') {
      throw new Error(
        'Deine Testphase ist abgelaufen. Bitte wähle ein Abo, um RabbitStation Pro weiter zu nutzen.',
      )
    }
    throw new Error('Schreibzugriff ist für dieses Konto derzeit gesperrt.')
  }
}

export function getTrialMessage(state: SubscriptionWriteState): string | null {
  if (state.status !== 'trial' && state.status !== 'expired') return null
  if (state.trialDaysLeft == null) return null
  if (state.trialDaysLeft > 1) return `Deine Testphase läuft noch ${state.trialDaysLeft} Tage.`
  if (state.trialDaysLeft === 1) return 'Deine Testphase endet morgen.'
  if (state.trialDaysLeft === 0) {
    return state.canWrite
      ? 'Deine Testphase endet heute.'
      : 'Deine Testphase ist abgelaufen. Bitte wähle ein Abo, um RabbitStation Pro weiter zu nutzen.'
  }
  return 'Deine Testphase ist abgelaufen. Bitte wähle ein Abo, um RabbitStation Pro weiter zu nutzen.'
}
