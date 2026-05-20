import type { Database } from 'better-sqlite3'
import { isPlatformRole } from '../constants/saasRoles.js'

export type TenantRow = {
  id: string
  company_name: string
  slug: string | null
  plan: string
  subscription_status: string
  trial_start: string | null
  trial_end: string | null
  payment_provider: string | null
  payment_customer_id: string | null
  payment_subscription_id: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancelled_at: string | null
  blocked_reason: string | null
  setup_completed: number
  onboarding_tour_completed?: number
  pro_trial_started_at?: string | null
  pro_trial_used?: number
  multi_trial_started_at?: string | null
  multi_trial_used?: number
  trial_extended_count?: number
  trial_last_extended_at?: string | null
  trial_last_extended_by?: string | null
  trial_extension_note?: string | null
  contact_email: string | null
  contact_phone: string | null
  address_json: string | null
  created_at: string
  updated_at: string
}

export type UserTenantContext = {
  userId: string
  tenantId: string | null
  platformRole: string | null
  roleKey: string | null
  isPlatformAdmin: boolean
}

export function getUserTenantContext(db: Database, userId: string): UserTenantContext | null {
  const row = db
    .prepare(
      `SELECT u.id, u.tenant_id, u.platform_role, r.role_key
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND (u.active IS NULL OR u.active = 1)`,
    )
    .get(userId) as
    | { id: string; tenant_id: string | null; platform_role: string | null; role_key: string | null }
    | undefined
  if (!row) return null
  const platformRole = row.platform_role?.trim() || null
  return {
    userId: row.id,
    tenantId: row.tenant_id?.trim() || null,
    platformRole,
    roleKey: row.role_key?.trim() || null,
    isPlatformAdmin: isPlatformRole(platformRole),
  }
}

export function getTenantById(db: Database, tenantId: string): TenantRow | undefined {
  return db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId) as TenantRow | undefined
}

export function getStationTenantId(db: Database, stationId: string): string | null {
  const r = db.prepare(`SELECT tenant_id FROM stations WHERE id = ?`).get(stationId) as
    | { tenant_id: string | null }
    | undefined
  return r?.tenant_id?.trim() || null
}

export function assertStationBelongsToTenant(
  db: Database,
  stationId: string,
  tenantId: string,
): boolean {
  const tid = getStationTenantId(db, stationId)
  return tid === tenantId
}

export function resolveEffectiveTenantId(ctx: UserTenantContext): string | null {
  if (ctx.isPlatformAdmin) return ctx.tenantId
  return ctx.tenantId
}

export function tenantTrialDaysLeft(t: TenantRow, now = new Date()): number | null {
  const trialEnd = t.trial_end ? new Date(t.trial_end) : null
  if (!trialEnd || t.subscription_status?.trim() !== 'trial') return null
  return Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000))
}

export function tenantToApi(t: TenantRow) {
  const trialDaysLeft = tenantTrialDaysLeft(t)
  return {
    id: t.id,
    companyName: t.company_name,
    slug: t.slug,
    plan: t.plan,
    subscriptionStatus: t.subscription_status,
    trialStart: t.trial_start,
    trialEnd: t.trial_end,
    trialDaysLeft,
    trialExtendedCount: t.trial_extended_count ?? 0,
    trialLastExtendedAt: t.trial_last_extended_at ?? null,
    trialLastExtendedBy: t.trial_last_extended_by ?? null,
    setupCompleted: t.setup_completed === 1,
    onboardingTourCompleted: (t.onboarding_tour_completed ?? 0) === 1,
    paymentProvider: t.payment_provider,
    currentPeriodStart: t.current_period_start,
    currentPeriodEnd: t.current_period_end,
    blockedReason: t.blocked_reason,
    contactEmail: t.contact_email,
    contactPhone: t.contact_phone,
  }
}

export type AdminTenantListRow = TenantRow & {
  station_count?: number
  user_count?: number
  employee_count?: number
  primary_station_name?: string | null
  owner_email?: string | null
  last_activity_at?: string | null
}

export function adminTenantToApi(row: AdminTenantListRow) {
  const base = tenantToApi(row)
  const remainingDays = tenantTrialDaysLeft(row)
  return {
    ...base,
    tenantId: row.id,
    tenantName: row.company_name,
    stationName: row.primary_station_name?.trim() || null,
    ownerEmail: row.owner_email?.trim() || null,
    remainingDays,
    lastActivityAt: row.last_activity_at ?? row.updated_at ?? null,
    employeeCount: Number(row.employee_count ?? 0),
    stationCount: Number(row.station_count ?? 0),
    userCount: Number(row.user_count ?? 0),
  }
}
