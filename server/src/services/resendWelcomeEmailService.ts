import type { Database } from 'better-sqlite3'
import type { Request } from 'express'
import { planDisplayName, normalizePlanId } from '../constants/plans.js'
import { getTenantById } from './tenantService.js'
import { deliverWelcomeEmail } from './registrationWelcomeEmailService.js'
import { assertSmtpReadyToSend } from './smtpMailErrors.js'
import { isSmtpConfigured } from './smtpConfig.js'

const MAX_RESENDS_PER_24H = 3

export type ResendWelcomeEmailInput = {
  tenantId: string
  userId: string
  reason?: string
  triggeredBy: 'control_center' | 'platform_admin'
  req?: Request
}

export type ResendWelcomeEmailSuccess = {
  ok: true
  message: string
  mail: {
    messageId?: string
    accepted: string[]
    rejected: string[]
  }
}

export type ResendWelcomeEmailFailure = {
  ok: false
  error: string
  message: string
  details?: {
    errorCode?: string
    responseCode?: number
    safeMessage?: string
  }
}

export type ResendWelcomeEmailResult = ResendWelcomeEmailSuccess | ResendWelcomeEmailFailure

function publicAppBase(): string {
  return (process.env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/$/, '')
}

function resolveUserEmail(row: {
  email: string | null
  username: string | null
}): string | null {
  const email = row.email?.trim().toLowerCase()
  if (email && email.includes('@')) return email
  const username = row.username?.trim().toLowerCase()
  if (username && username.includes('@')) return username
  return email || null
}

function getPrimaryStationName(db: Database, tenantId: string): string {
  const row = db
    .prepare(
      `SELECT name FROM stations
       WHERE tenant_id = ? AND (active IS NULL OR active = 1)
       ORDER BY created_at ASC LIMIT 1`,
    )
    .get(tenantId) as { name: string } | undefined
  return row?.name?.trim() || 'Ihre Station'
}

export function countWelcomeResendsLast24h(db: Database, tenantId: string, userId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) as c FROM tenant_audit_logs
       WHERE tenant_id = ? AND user_id = ? AND action = 'registration_welcome_email_resent'
         AND datetime(created_at) >= datetime('now', '-24 hours')`,
    )
    .get(tenantId, userId) as { c: number }
  return Number(row?.c ?? 0)
}

export async function resendWelcomeEmail(
  db: Database,
  input: ResendWelcomeEmailInput,
): Promise<ResendWelcomeEmailResult> {
  const reason = input.reason?.trim() || 'Manuell erneut gesendet'
  const auditMeta = {
    triggeredBy: input.triggeredBy,
    reason,
  }

  const tenant = getTenantById(db, input.tenantId)
  if (!tenant) {
    return {
      ok: false,
      error: 'tenant_not_found',
      message: 'Mandant wurde nicht gefunden.',
    }
  }

  const user = db
    .prepare(
      `SELECT id, tenant_id, email, username, display_name
       FROM users WHERE id = ? AND (active IS NULL OR active = 1)`,
    )
    .get(input.userId) as
    | {
        id: string
        tenant_id: string | null
        email: string | null
        username: string | null
        display_name: string | null
      }
    | undefined

  if (!user) {
    return {
      ok: false,
      error: 'user_not_found',
      message: 'Benutzer wurde nicht gefunden.',
    }
  }

  if ((user.tenant_id ?? '').trim() !== input.tenantId) {
    return {
      ok: false,
      error: 'user_not_found',
      message: 'Benutzer wurde nicht gefunden.',
    }
  }

  const userEmail = resolveUserEmail(user)
  if (!userEmail) {
    return {
      ok: false,
      error: 'missing_email',
      message: 'Für diesen Benutzer ist keine E-Mail-Adresse hinterlegt.',
    }
  }

  const resendCount = countWelcomeResendsLast24h(db, input.tenantId, input.userId)
  if (resendCount >= MAX_RESENDS_PER_24H) {
    return {
      ok: false,
      error: 'rate_limit',
      message: 'Für diesen Benutzer wurden heute bereits mehrere Willkommens-E-Mails versendet.',
    }
  }

  if (!isSmtpConfigured()) {
    return {
      ok: false,
      error: 'smtp_not_available',
      message: 'SMTP ist nicht bereit oder Mailversand aktuell nicht möglich.',
    }
  }

  const precheck = assertSmtpReadyToSend()
  if (precheck) {
    return {
      ok: false,
      error: 'smtp_not_available',
      message: 'SMTP ist nicht bereit oder Mailversand aktuell nicht möglich.',
      details: {
        errorCode: precheck.errorCode,
        safeMessage: precheck.safeMessage,
      },
    }
  }

  const publicUrl = publicAppBase()
  const stationName = getPrimaryStationName(db, input.tenantId)
  const planLabel = planDisplayName(normalizePlanId(tenant.plan))
  const trialEnd = tenant.trial_end ?? new Date().toISOString()
  const displayName =
    user.display_name?.trim() || userEmail.split('@')[0] || 'Nutzer'

  const delivery = await deliverWelcomeEmail(
    {
      to: userEmail,
      name: displayName,
      companyName: tenant.company_name,
      stationName,
      planLabel,
      trialEnd,
      setupUrl: `${publicUrl}/setup`,
      loginUrl: `${publicUrl}/login`,
      appUrl: publicUrl,
      db,
      tenantId: input.tenantId,
      userId: input.userId,
      req: input.req,
    },
    {
      sent: 'registration_welcome_email_resent',
      failed: 'registration_welcome_email_resend_failed',
    },
    {
      ...auditMeta,
      tenantName: tenant.company_name,
      userEmail,
    },
  )

  if (!delivery.sent) {
    return {
      ok: false,
      error: 'mail_send_failed',
      message: 'Willkommens-E-Mail konnte nicht erneut gesendet werden.',
      details: {
        errorCode: delivery.errorCode,
        responseCode: delivery.responseCode,
        safeMessage: delivery.safeMessage ?? delivery.error,
      },
    }
  }

  return {
    ok: true,
    message: 'Willkommens-E-Mail wurde erneut gesendet.',
    mail: {
      messageId: delivery.messageId,
      accepted: delivery.accepted,
      rejected: delivery.rejected,
    },
  }
}
