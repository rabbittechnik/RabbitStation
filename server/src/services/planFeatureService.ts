import type { Database } from 'better-sqlite3'
import type { Response } from 'express'
import {
  getMinimumPlanForFeature,
  getPlanDefinition,
  suggestUpgradePlan,
  type FeatureKey,
  type PlanDefinition,
} from '../config/planConfig.js'
import { normalizePlanId, planDisplayName, type PlanId } from '../constants/plans.js'
import { getTenantById, type TenantRow } from './tenantService.js'

export type PlanLimits = {
  maxStations: number
  maxEmployees: number
  maxTablets: number
}

export class PlanFeatureError extends Error {
  code: string
  status: number
  payload: Record<string, unknown>

  constructor(code: string, message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message)
    this.name = 'PlanFeatureError'
    this.code = code
    this.status = status
    this.payload = payload
  }
}

export function getPlanLimits(planId: string | null | undefined): PlanLimits {
  const def = getPlanDefinition(planId)
  return {
    maxStations: def.maxStations,
    maxEmployees: def.maxEmployees,
    maxTablets: def.maxTablets,
  }
}

export function hasFeature(tenant: TenantRow | null | undefined, featureKey: FeatureKey): boolean {
  if (!tenant) return false
  const def = getPlanDefinition(tenant.plan)
  return def.features.has(featureKey)
}

export function requireFeature(tenant: TenantRow, featureKey: FeatureKey): void {
  if (hasFeature(tenant, featureKey)) return
  const requiredPlan = getMinimumPlanForFeature(featureKey)
  throw new PlanFeatureError(
    'feature_not_available',
    'Diese Funktion ist in Ihrem aktuellen Plan nicht enthalten.',
    403,
    {
      feature: featureKey,
      requiredPlan,
      requiredPlanName: planDisplayName(requiredPlan),
      currentPlan: normalizePlanId(tenant.plan),
    },
  )
}

export function countTenantStations(db: Database, tenantId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM stations
       WHERE tenant_id = ? AND (active IS NULL OR active = 1)`,
    )
    .get(tenantId) as { c: number }
  return Number(row?.c ?? 0)
}

export function countTenantEmployees(db: Database, tenantId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM employees e
       INNER JOIN stations s ON s.id = e.station_id
       WHERE s.tenant_id = ?
         AND (e.deleted_at IS NULL OR trim(e.deleted_at) = '')`,
    )
    .get(tenantId) as { c: number }
  return Number(row?.c ?? 0)
}

export function countTenantTablets(db: Database, tenantId: string): number {
  try {
    const row = db
      .prepare(
        `SELECT COUNT(*) as c FROM station_tablet_devices d
         INNER JOIN stations s ON s.id = d.station_id
         WHERE s.tenant_id = ? AND (d.revoked_at IS NULL OR trim(d.revoked_at) = '')`,
      )
      .get(tenantId) as { c: number }
    return Number(row?.c ?? 0)
  } catch {
    return 0
  }
}

export function canAddStation(db: Database, tenant: TenantRow): { ok: true } | { ok: false; error: PlanFeatureError } {
  const def = getPlanDefinition(tenant.plan)
  const current = countTenantStations(db, tenant.id)
  if (current >= def.maxStations) {
    return { ok: false, error: planLimitError(tenant, 'stations', current, def.maxStations) }
  }
  return { ok: true }
}

export function canAddEmployee(db: Database, tenant: TenantRow): { ok: true } | { ok: false; error: PlanFeatureError } {
  const def = getPlanDefinition(tenant.plan)
  const current = countTenantEmployees(db, tenant.id)
  if (current >= def.maxEmployees) {
    return { ok: false, error: planLimitError(tenant, 'employees', current, def.maxEmployees) }
  }
  return { ok: true }
}

export function canAddTablet(db: Database, tenant: TenantRow): { ok: true } | { ok: false; error: PlanFeatureError } {
  if (!hasFeature(tenant, 'station_tablet')) {
    const requiredPlan = getMinimumPlanForFeature('station_tablet')
    return {
      ok: false,
      error: new PlanFeatureError(
        'feature_not_available',
        'Stationstablet ist in Ihrem aktuellen Plan nicht enthalten.',
        403,
        { requiredPlan, currentPlan: normalizePlanId(tenant.plan) },
      ),
    }
  }
  const def = getPlanDefinition(tenant.plan)
  const current = countTenantTablets(db, tenant.id)
  const limit = def.maxTablets
  if (limit <= 0) {
    return {
      ok: false,
      error: new PlanFeatureError(
        'feature_not_available',
        'Stationstablet ist in Ihrem aktuellen Plan nicht enthalten.',
        403,
        { requiredPlan: 'pro', currentPlan: normalizePlanId(tenant.plan) },
      ),
    }
  }
  if (current >= limit) {
    return {
      ok: false,
      error: planLimitError(tenant, 'tablets', current, limit),
    }
  }
  return { ok: true }
}

function planLimitError(
  tenant: TenantRow,
  kind: 'employees' | 'stations' | 'tablets',
  current: number,
  limit: number,
): PlanFeatureError {
  const messages = {
    employees: 'Das Mitarbeiterlimit Ihres Plans wurde erreicht.',
    stations: 'Das Stationslimit Ihres Plans wurde erreicht.',
    tablets: 'Das Tablet-Limit Ihres Plans wurde erreicht.',
  }
  return new PlanFeatureError('plan_limit_reached', messages[kind], 403, {
    current,
    limit,
    upgradePlan: suggestUpgradePlan(tenant.plan, kind === 'employees' ? 'employees' : kind === 'stations' ? 'stations' : 'tablets'),
    currentPlan: normalizePlanId(tenant.plan),
  })
}

export function sendPlanError(res: Response, err: PlanFeatureError) {
  return res.status(err.status).json({
    ok: false,
    error: err.code,
    message: err.message,
    ...err.payload,
  })
}

export function buildTenantPlanEntitlements(db: Database, tenant: TenantRow) {
  const planId = normalizePlanId(tenant.plan)
  const def = getPlanDefinition(planId)
  const limits = getPlanLimits(planId)
  const usage = {
    stations: countTenantStations(db, tenant.id),
    employees: countTenantEmployees(db, tenant.id),
    tablets: countTenantTablets(db, tenant.id),
  }
  return {
    planId,
    planName: def.name,
    priceMonthly: def.priceMonthly,
    features: [...def.features],
    limits,
    usage,
    subscriptionStatus: tenant.subscription_status,
  }
}

export function tenantForRequest(db: Database, tenantId: string | null | undefined): TenantRow | undefined {
  if (!tenantId) return undefined
  return getTenantById(db, tenantId)
}
