import type { Database } from 'better-sqlite3'
import type { Request } from 'express'
import { normalizePlanId, planDisplayName, type PlanId } from '../constants/plans.js'
import { nowIso } from '../utils/timestamps.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { buildTenantPlanEntitlements } from './planFeatureService.js'
import {
  getSubscriptionWriteState,
  getTrialMessage,
  type SubscriptionWriteState,
} from './subscriptionService.js'
import {
  getTenantById,
  getUserTenantContext,
  tenantToApi,
  type TenantRow,
  type UserTenantContext,
} from './tenantService.js'

const PLAN_RANK: Record<PlanId, number> = {
  starter: 0,
  pro: 1,
  multi_station: 2,
}

const MANAGER_ROLES = new Set(['tenant_owner', 'station_admin'])

export class ChangePlanError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message)
    this.name = 'ChangePlanError'
  }
}

export function canManageTenantSubscription(ctx: UserTenantContext | null): boolean {
  if (!ctx?.tenantId) return false
  if (ctx.isPlatformAdmin) return false
  return ctx.roleKey != null && MANAGER_ROLES.has(ctx.roleKey)
}

function trialEndFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function isTrialUsed(row: TenantRow, plan: PlanId): boolean {
  if (plan === 'pro') return (row.pro_trial_used ?? 0) === 1
  if (plan === 'multi_station') return (row.multi_trial_used ?? 0) === 1
  return false
}

function trialUsedMessage(plan: PlanId): string {
  if (plan === 'multi_station') {
    return 'Die Multi-Station-Testphase wurde bereits genutzt. Bitte wählen Sie ein Abo oder kontaktieren Sie den Support.'
  }
  return 'Die Pro-Testphase wurde bereits genutzt. Bitte wählen Sie ein Abo oder kontaktieren Sie den Support.'
}

export type ChangePlanResult = {
  tenant: ReturnType<typeof tenantToApi>
  plan: ReturnType<typeof buildTenantPlanEntitlements>
  subscription: SubscriptionWriteState & { message: string | null }
  message: string
  changed: boolean
}

export function changeTenantPlan(
  db: Database,
  userId: string,
  targetPlanRaw: string,
  req?: Request,
): ChangePlanResult {
  const ctx = getUserTenantContext(db, userId)
  if (!ctx) throw new ChangePlanError('Nicht angemeldet', 'not_authenticated', 401)
  if (!ctx.tenantId) throw new ChangePlanError('Kein Tenant-Konto', 'no_tenant', 404)
  if (!canManageTenantSubscription(ctx)) {
    throw new ChangePlanError('Keine Berechtigung für Planwechsel', 'forbidden', 403)
  }

  const targetPlan = normalizePlanId(targetPlanRaw)
  const tenant = getTenantById(db, ctx.tenantId)
  if (!tenant) throw new ChangePlanError('Tenant nicht gefunden', 'tenant_not_found', 404)

  const currentPlan = normalizePlanId(tenant.plan)
  const oldStatus = tenant.subscription_status?.trim() || 'trial'
  const ts = nowIso()

  if (oldStatus === 'active') {
    throw new ChangePlanError(
      'Planwechsel für aktive Abos wird vorbereitet. Bitte kontaktieren Sie den Support.',
      'active_subscription',
      409,
    )
  }

  if (currentPlan === targetPlan && oldStatus === 'trial') {
    const ws = getSubscriptionWriteState(tenant)
    return buildResult(db, tenant, ws, 'Sie nutzen diesen Plan bereits.', false)
  }

  if (PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan]) {
    return applyUpgrade(db, tenant, ctx, currentPlan, targetPlan, oldStatus, ts, req)
  }

  if (PLAN_RANK[targetPlan] < PLAN_RANK[currentPlan]) {
    db.prepare(`UPDATE tenants SET plan = ?, updated_at = ? WHERE id = ?`).run(targetPlan, ts, tenant.id)
    const updated = getTenantById(db, tenant.id)!
    writeAudit(db, tenant, updated, ctx, oldStatus, req)
    const ws = getSubscriptionWriteState(updated)
    return buildResult(
      db,
      updated,
      ws,
      `Plan auf ${planDisplayName(targetPlan)} umgestellt.`,
      true,
    )
  }

  const ws = getSubscriptionWriteState(tenant)
  return buildResult(db, tenant, ws, 'Keine Änderung erforderlich.', false)
}

function applyUpgrade(
  db: Database,
  tenant: TenantRow,
  ctx: UserTenantContext,
  currentPlan: PlanId,
  targetPlan: PlanId,
  oldStatus: string,
  ts: string,
  req?: Request,
): ChangePlanResult {
  if (targetPlan === 'pro' || targetPlan === 'multi_station') {
    if (isTrialUsed(tenant, targetPlan) && currentPlan !== targetPlan) {
      throw new ChangePlanError(trialUsedMessage(targetPlan), 'trial_already_used', 409)
    }

    const wsBefore = getSubscriptionWriteState(tenant)
    if (isTrialUsed(tenant, targetPlan) && !wsBefore.canWrite) {
      throw new ChangePlanError(trialUsedMessage(targetPlan), 'trial_expired', 409)
    }
  }

  const trialEnd = trialEndFromNow(7)
  const sets: string[] = ['plan = ?', 'updated_at = ?', 'trial_end = ?']
  const params: unknown[] = [targetPlan, ts, trialEnd]

  if (oldStatus !== 'trial') {
    sets.push('subscription_status = ?')
    params.push('trial')
  }

  if (targetPlan === 'pro') {
    sets.push('pro_trial_used = 1')
    sets.push('pro_trial_started_at = COALESCE(pro_trial_started_at, ?)')
    params.push(ts)
  }
  if (targetPlan === 'multi_station') {
    sets.push('multi_trial_used = 1')
    sets.push('multi_trial_started_at = COALESCE(multi_trial_started_at, ?)')
    params.push(ts)
  }

  params.push(tenant.id)
  db.prepare(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`).run(...params)

  const updated = getTenantById(db, tenant.id)!
  writeAudit(db, tenant, updated, ctx, oldStatus, req, trialEnd)
  const ws = getSubscriptionWriteState(updated)
  const label = planDisplayName(targetPlan)
  return buildResult(
    db,
    updated,
    ws,
    `${label}-Test aktiviert – Ihre bestehenden Daten bleiben erhalten.`,
    true,
  )
}

function buildResult(
  db: Database,
  tenant: TenantRow,
  ws: SubscriptionWriteState,
  message: string,
  changed: boolean,
): ChangePlanResult {
  return {
    tenant: tenantToApi(tenant),
    plan: buildTenantPlanEntitlements(db, tenant),
    subscription: {
      ...ws,
      message: getTrialMessage(ws, tenant),
    },
    message,
    changed,
  }
}

function writeAudit(
  db: Database,
  before: TenantRow,
  after: TenantRow,
  ctx: UserTenantContext,
  oldStatus: string,
  req?: Request,
  trialEnd?: string,
) {
  const user = db
    .prepare(`SELECT email, username FROM users WHERE id = ?`)
    .get(ctx.userId) as { email: string | null; username: string } | undefined
  const email = user?.email?.trim() || user?.username?.trim() || null

  appendTenantAudit(db, {
    tenantId: after.id,
    userId: ctx.userId,
    action: 'subscription_plan_changed',
    entityType: 'tenant',
    entityId: after.id,
    metadata: {
      oldPlan: normalizePlanId(before.plan),
      newPlan: normalizePlanId(after.plan),
      oldStatus,
      newStatus: after.subscription_status,
      changedByUserId: ctx.userId,
      changedByEmail: email,
      trialEnd: trialEnd ?? after.trial_end,
      source: 'self_service_upgrade',
    },
    req,
  })
}
