import type { Database } from 'better-sqlite3'
import type { Request } from 'express'
import { nowIso } from '../utils/timestamps.js'
import { getTenantById, type TenantRow } from './tenantService.js'
import { appendTenantAudit } from './tenantAuditService.js'
import { getSubscriptionWriteState } from './subscriptionService.js'

const MS_PER_DAY = 86_400_000
const MAX_DAYS_PARAM = 30
const MAX_FUTURE_DAYS_DEFAULT = 30
const MAX_FUTURE_DAYS_SUPERADMIN = 365

export type ExtendTrialInput = {
  days?: number
  newTrialEnd?: string
  reason: string
  note?: string
}

export type ExtendTrialActor = {
  isSuperAdmin: boolean
  extendedByUserId?: string | null
  extendedByEmail?: string | null
  source: 'control_center' | 'platform_admin'
}

export type ExtendTrialSuccess = {
  ok: true
  message: string
  data: {
    tenantId: string
    tenantName: string
    plan: string
    subscriptionStatus: string
    oldTrialEnd: string | null
    newTrialEnd: string
    daysAdded: number
    remainingDays: number
  }
}

export type ExtendTrialFailure = {
  ok: false
  error: string
  message: string
  status: number
}

export type ExtendTrialResult = ExtendTrialSuccess | ExtendTrialFailure

function fail(
  error: string,
  message: string,
  status: number,
): ExtendTrialFailure {
  return { ok: false, error, message, status }
}

export function isTrialExpiredByDate(tenant: TenantRow, now = new Date()): boolean {
  if (tenant.subscription_status?.trim() !== 'trial') return false
  if (!tenant.trial_end) return false
  return new Date(tenant.trial_end) < now
}

export function remainingTrialDays(tenant: TenantRow, now = new Date()): number {
  if (tenant.subscription_status?.trim() !== 'trial' || !tenant.trial_end) return 0
  return Math.max(0, Math.ceil((new Date(tenant.trial_end).getTime() - now.getTime()) / MS_PER_DAY))
}

function maxFutureTrialEnd(isSuperAdmin: boolean, now: Date): Date {
  const days = isSuperAdmin ? MAX_FUTURE_DAYS_SUPERADMIN : MAX_FUTURE_DAYS_DEFAULT
  return new Date(now.getTime() + days * MS_PER_DAY)
}

function parseTrialEnd(value: string): Date | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isBlockedTenant(tenant: TenantRow): boolean {
  const status = tenant.subscription_status?.trim().toLowerCase() ?? ''
  if (status === 'cancelled' || status === 'suspended' || status === 'archived') return true
  if (tenant.cancelled_at?.trim()) return true
  const blocked = tenant.blocked_reason?.trim().toLowerCase() ?? ''
  if (blocked && blocked !== 'trial_expired') return true
  return false
}

function resolveActorEmail(db: Database, actor: ExtendTrialActor): string | null {
  if (actor.extendedByEmail?.trim()) return actor.extendedByEmail.trim()
  if (!actor.extendedByUserId) return null
  const row = db
    .prepare(`SELECT email, username FROM users WHERE id = ?`)
    .get(actor.extendedByUserId) as { email: string | null; username: string | null } | undefined
  if (!row) return null
  const email = row.email?.trim()
  if (email && email.includes('@')) return email
  const username = row.username?.trim()
  if (username && username.includes('@')) return username
  return email || null
}

function logTrialExtendFailed(
  db: Database,
  tenantId: string,
  error: string,
  message: string,
  meta: Record<string, unknown>,
  actor: ExtendTrialActor,
  req?: Request,
) {
  appendTenantAudit(db, {
    tenantId,
    userId: actor.extendedByUserId ?? null,
    action: 'trial_extend_failed',
    entityType: 'subscription',
    entityId: tenantId,
    metadata: {
      ...meta,
      error,
      safeMessage: message,
      source: actor.source,
      extendedByUserId: actor.extendedByUserId ?? null,
      extendedByEmail: resolveActorEmail(db, actor),
    },
    req,
  })
}

export function extendTenantTrial(
  db: Database,
  tenantId: string,
  input: ExtendTrialInput,
  actor: ExtendTrialActor,
  req?: Request,
): ExtendTrialResult {
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) {
    return fail('reason_required', 'Grund (reason) ist erforderlich.', 400)
  }

  const hasDays = input.days != null
  const hasNewEnd = typeof input.newTrialEnd === 'string' && input.newTrialEnd.trim().length > 0
  if (hasDays && hasNewEnd) {
    return fail(
      'invalid_body',
      'Bitte entweder days oder newTrialEnd angeben, nicht beides.',
      400,
    )
  }
  if (!hasDays && !hasNewEnd) {
    return fail('invalid_body', 'Bitte days oder newTrialEnd angeben.', 400)
  }

  if (hasDays) {
    const days = Number(input.days)
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS_PARAM) {
      return fail(
        'invalid_days',
        `days muss eine ganze Zahl zwischen 1 und ${MAX_DAYS_PARAM} sein.`,
        400,
      )
    }
  }

  const tenant = getTenantById(db, tenantId)
  if (!tenant) {
    return fail('tenant_not_found', 'Tenant wurde nicht gefunden.', 404)
  }

  if (isBlockedTenant(tenant)) {
    logTrialExtendFailed(
      db,
      tenantId,
      'tenant_not_eligible',
      'Tenant ist gekündigt, gesperrt oder ausgesetzt.',
      { reason, note: input.note ?? null },
      actor,
      req,
    )
    return fail(
      'tenant_not_eligible',
      'Testzeit kann für gekündigte oder gesperrte Kunden nicht verlängert werden.',
      403,
    )
  }

  const status = tenant.subscription_status?.trim().toLowerCase() ?? 'trial'
  if (status === 'active') {
    logTrialExtendFailed(
      db,
      tenantId,
      'tenant_already_active',
      'Der Kunde hat bereits ein aktives Abo.',
      { reason, note: input.note ?? null, plan: tenant.plan },
      actor,
      req,
    )
    return fail(
      'tenant_already_active',
      'Der Kunde hat bereits ein aktives Abo. Eine Testzeitverlängerung ist nicht nötig.',
      409,
    )
  }

  const now = new Date()
  const oldTrialEnd = tenant.trial_end
  const oldSubscriptionStatus = tenant.subscription_status
  const expired = isTrialExpiredByDate(tenant, now) || status === 'expired'

  let newTrialEndDate: Date
  let daysAdded: number

  if (hasNewEnd) {
    const parsed = parseTrialEnd(String(input.newTrialEnd).trim())
    if (!parsed) {
      return fail('invalid_new_trial_end', 'newTrialEnd ist kein gültiges Datum.', 400)
    }
    if (parsed <= now) {
      return fail('invalid_new_trial_end', 'newTrialEnd muss in der Zukunft liegen.', 400)
    }
    const maxEnd = maxFutureTrialEnd(actor.isSuperAdmin, now)
    if (parsed > maxEnd) {
      return fail(
        'trial_end_too_far',
        actor.isSuperAdmin
          ? `newTrialEnd darf maximal ${MAX_FUTURE_DAYS_SUPERADMIN} Tage in der Zukunft liegen.`
          : `newTrialEnd darf maximal ${MAX_FUTURE_DAYS_DEFAULT} Tage in der Zukunft liegen.`,
        400,
      )
    }
    newTrialEndDate = parsed
    const base = expired
      ? now
      : new Date(Math.max(oldTrialEnd ? new Date(oldTrialEnd).getTime() : now.getTime(), now.getTime()))
    daysAdded = Math.max(1, Math.ceil((newTrialEndDate.getTime() - base.getTime()) / MS_PER_DAY))
  } else {
    const days = Number(input.days)
    if (expired || status === 'expired') {
      newTrialEndDate = new Date(now.getTime() + days * MS_PER_DAY)
    } else {
      const baseMs = Math.max(
        oldTrialEnd ? new Date(oldTrialEnd).getTime() : now.getTime(),
        now.getTime(),
      )
      newTrialEndDate = new Date(baseMs + days * MS_PER_DAY)
    }
    daysAdded = days
    const maxEnd = maxFutureTrialEnd(actor.isSuperAdmin, now)
    if (newTrialEndDate > maxEnd) {
      return fail(
        'trial_end_too_far',
        actor.isSuperAdmin
          ? `Das neue Trial-Ende darf maximal ${MAX_FUTURE_DAYS_SUPERADMIN} Tage in der Zukunft liegen.`
          : `Das neue Trial-Ende darf maximal ${MAX_FUTURE_DAYS_DEFAULT} Tage in der Zukunft liegen.`,
        400,
      )
    }
  }

  const newTrialEnd = newTrialEndDate.toISOString()
  const newSubscriptionStatus = 'trial'
  const ts = nowIso()
  const extendedBy =
    actor.extendedByUserId?.trim() ||
    (actor.source === 'control_center' ? 'control_center' : 'platform_admin')
  const noteText = typeof input.note === 'string' ? input.note.trim() : ''
  const extensionNote = noteText ? `${reason} — ${noteText}` : reason

  const clearTrialBlock =
    tenant.blocked_reason?.trim().toLowerCase() === 'trial_expired' ? null : tenant.blocked_reason

  db.prepare(
    `UPDATE tenants SET
      subscription_status = ?,
      trial_end = ?,
      blocked_reason = ?,
      trial_extended_count = COALESCE(trial_extended_count, 0) + 1,
      trial_last_extended_at = ?,
      trial_last_extended_by = ?,
      trial_extension_note = ?,
      updated_at = ?
     WHERE id = ?`,
  ).run(
    newSubscriptionStatus,
    newTrialEnd,
    clearTrialBlock,
    ts,
    extendedBy,
    extensionNote,
    ts,
    tenantId,
  )

  const updated = getTenantById(db, tenantId)!
  const extendedByEmail = resolveActorEmail(db, actor)

  appendTenantAudit(db, {
    tenantId,
    userId: actor.extendedByUserId ?? null,
    action: 'trial_extended',
    entityType: 'subscription',
    entityId: tenantId,
    metadata: {
      tenantId,
      tenantName: tenant.company_name,
      oldTrialEnd,
      newTrialEnd,
      daysAdded,
      oldSubscriptionStatus,
      newSubscriptionStatus,
      plan: tenant.plan,
      reason,
      note: noteText || null,
      extendedByUserId: actor.extendedByUserId ?? null,
      extendedByEmail,
      source: actor.source,
    },
    req,
  })

  const writeState = getSubscriptionWriteState(updated)
  if (!writeState.canWrite) {
    console.warn(
      `[trial-extend] Tenant ${tenantId} extended but write still blocked: ${writeState.reason}`,
    )
  }

  return {
    ok: true,
    message: 'Testzeitraum wurde verlängert.',
    data: {
      tenantId,
      tenantName: tenant.company_name,
      plan: tenant.plan,
      subscriptionStatus: newSubscriptionStatus,
      oldTrialEnd,
      newTrialEnd,
      daysAdded,
      remainingDays: remainingTrialDays(updated, now),
    },
  }
}
